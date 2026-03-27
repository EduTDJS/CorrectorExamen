import http from 'node:http';
import crypto from 'node:crypto';
import {
  createReport,
  getReportById,
  getReportByIdUnscoped,
  getReportVersion,
  listReports,
  listReportVersions,
  updateReport,
  deleteReport
} from './repositories/reportRepository.js';
import { AuthError, authenticate } from './middleware/auth.js';
import { AuthorizationError, authorize } from './middleware/authorize.js';
import { RATE_LIMIT_CONFIG, getRateLimitPolicy } from './config/rateLimit.js';
import {
  createProviderOrchestrator,
  ProviderIntegrationError,
  PROVIDER_ERRORS
} from './ai/providerOrchestrator.js';

const PORT = Number(process.env.PORT || 8787);
const INTERNAL_AUTH_TOKEN = process.env.INTERNAL_AUTH_TOKEN || '';
const INTERNAL_AUTH_HEADER = (process.env.INTERNAL_AUTH_HEADER || 'x-internal-token').toLowerCase();

const API_ERRORS = {
  UNAUTHORIZED: 'internal_auth_unauthorized',
  RATE_LIMITED: 'rate_limit_exceeded',
  BAD_REQUEST: 'bad_request',
  NOT_FOUND: 'not_found',
  PAYLOAD: 'payload_validation_error'
};

const sendJson = (res, statusCode, body, { requestId } = {}) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (requestId) {
    headers['X-Request-Id'] = requestId;
  }

  res.writeHead(statusCode, {
    ...headers
  });
  res.end(JSON.stringify(body));
};

const getOrCreateRequestId = (req) => {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  if (incoming) {
    return incoming;
  }

  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const safePayloadMetadata = (payload = {}) => {
  const datos = payload?.datos;
  const puntaje = payload?.puntaje;

  return {
    hasDatos: Boolean(datos && typeof datos === 'object'),
    datosKeys: datos && typeof datos === 'object' ? Object.keys(datos).sort() : [],
    puntajeType: typeof puntaje,
    hasPuntaje: puntaje !== undefined,
    payloadSizeBytes: Buffer.byteLength(JSON.stringify(payload || {}), 'utf8')
  };
};

const logEvent = ({
  requestId,
  event,
  method,
  path,
  status,
  durationMs,
  provider,
  model,
  errorCode,
  payloadMetadata,
  actor,
  resource,
  metrics,
  from,
  to,
  circuitState,
  attempts,
  rateLimit
}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level: errorCode ? 'error' : 'info',
    event,
    requestId,
    method,
    path
  };

  if (status !== undefined) {
    entry.status = status;
  }
  if (durationMs !== undefined) {
    entry.durationMs = durationMs;
  }
  if (provider) {
    entry.provider = provider;
  }
  if (model) {
    entry.model = model;
  }
  if (errorCode) {
    entry.errorCode = errorCode;
  }
  if (payloadMetadata) {
    entry.payloadMetadata = payloadMetadata;
  }
  if (actor) {
    entry.actor = actor;
  }
  if (resource) {
    entry.resource = resource;
  }
  if (metrics) {
    entry.metrics = metrics;
  }
  if (from) {
    entry.from = from;
  }
  if (to) {
    entry.to = to;
  }
  if (circuitState) {
    entry.circuitState = circuitState;
  }
  if (attempts) {
    entry.attempts = attempts;
  }
  if (rateLimit) {
    entry.rateLimit = rateLimit;
  }

  process.stdout.write(`${JSON.stringify(entry)}\n`);
};

const parseBody = (req) => new Promise((resolve, reject) => {
  let body = '';

  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) {
      reject(new Error('Payload demasiado grande.'));
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch {
      reject(new Error('JSON inválido en la solicitud.'));
    }
  });

  req.on('error', reject);
});

class ApiError extends Error {
  constructor(message, { status = 400, code = API_ERRORS.BAD_REQUEST } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const requestBuckets = new Map();

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || 'unknown';
};

const getRateLimitIdentifier = (req) => {
  const token = String(req.headers[INTERNAL_AUTH_HEADER] || '').trim();
  const ip = getClientIp(req);
  const tenantId = String(req.user?.tenantId || req.user?.institution || '').trim();
  const userId = String(req.user?.userId || '').trim();

  if (tenantId && userId) {
    return `tenant:${tenantId}:user:${userId}`;
  }

  if (RATE_LIMIT_CONFIG.keyStrategy === 'authenticated' && tenantId) {
    return `tenant:${tenantId}:anonymous`;
  }
  if (RATE_LIMIT_CONFIG.keyStrategy === 'token' && token) {
    return `token:${token}`;
  }
  if (RATE_LIMIT_CONFIG.keyStrategy === 'ip') {
    return `ip:${ip}`;
  }

  if (RATE_LIMIT_CONFIG.keyStrategy === 'authenticated_or_token_or_ip') {
    return token ? `token:${token}` : `ip:${ip}`;
  }

  return token ? `token:${token}` : `ip:${ip}`;
};

const assertInternalToken = (req) => {
  if (!INTERNAL_AUTH_TOKEN) {
    throw new ApiError('INTERNAL_AUTH_TOKEN no está configurada en el servidor.', {
      status: 500,
      code: PROVIDER_ERRORS.CONFIG
    });
  }

  const receivedToken = String(req.headers[INTERNAL_AUTH_HEADER] || '').trim();
  if (!receivedToken || receivedToken !== INTERNAL_AUTH_TOKEN) {
    throw new ApiError('No autorizado: token interno inválido o ausente.', {
      status: 401,
      code: API_ERRORS.UNAUTHORIZED
    });
  }
};

const assertRateLimit = ({ req, requestId, method, path }) => {
  const now = Date.now();
  const key = getRateLimitIdentifier(req);
  const { maxRequests, windowMs, nearThresholdRatio } = getRateLimitPolicy(req.user?.role);
  let bucket = requestBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    requestBuckets.set(key, bucket);
  }

  bucket.count += 1;

  const ratio = bucket.count / maxRequests;
  const rateLimitSnapshot = {
    key,
    role: req.user?.role || 'anonymous',
    tenantId: req.user?.tenantId || req.user?.institution || null,
    userId: req.user?.userId || null,
    count: bucket.count,
    maxRequests,
    windowMs,
    remainingMs: Math.max(bucket.resetAt - now, 0),
    thresholdRatio: Number(ratio.toFixed(2))
  };

  if (ratio >= nearThresholdRatio) {
    logEvent({
      requestId,
      event: 'rate_limit_saturation',
      method,
      path,
      status: bucket.count > maxRequests ? 429 : 200,
      rateLimit: {
        ...rateLimitSnapshot,
        nearThreshold: true,
        rejected: bucket.count > maxRequests
      }
    });
  }

  if (bucket.count > maxRequests) {
    throw new ApiError('Límite de solicitudes excedido. Intenta nuevamente más tarde.', {
      status: 429,
      code: API_ERRORS.RATE_LIMITED
    });
  }
};

const orchestrator = createProviderOrchestrator({
  onEvent: (eventData) => {
    logEvent(eventData);
  }
});

const validarPayload = (payload) => {
  const { datos, puntaje } = payload || {};

  if (!datos || typeof datos !== 'object') {
    throw new ProviderIntegrationError('El campo "datos" es obligatorio.', { status: 400, code: PROVIDER_ERRORS.PAYLOAD });
  }

  if (!Number.isFinite(Number(puntaje))) {
    throw new ProviderIntegrationError('El campo "puntaje" debe ser numérico.', { status: 400, code: PROVIDER_ERRORS.PAYLOAD });
  }

  return { datos, puntaje };
};

const validarPayloadReporte = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError('El payload de reporte debe ser un objeto JSON.', {
      status: 400,
      code: API_ERRORS.PAYLOAD
    });
  }

  if (!payload.examen || typeof payload.examen !== 'object') {
    throw new ApiError('El campo "examen" es obligatorio.', {
      status: 400,
      code: API_ERRORS.PAYLOAD
    });
  }

  if (!payload.estudiante || typeof payload.estudiante !== 'object') {
    throw new ApiError('El campo "estudiante" es obligatorio.', {
      status: 400,
      code: API_ERRORS.PAYLOAD
    });
  }

  return payload;
};

const runProtectedAction = async ({ req, res, requestId, action, resource, onAllowed }) => {
  try {
    authenticate(req);
    authorize(req, action);
    return await onAllowed();
  } catch (error) {
    const status = error instanceof AuthError || error instanceof AuthorizationError ? error.status : 500;
    const code = error instanceof AuthError || error instanceof AuthorizationError ? error.code : API_ERRORS.BAD_REQUEST;
    const actor = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
    logEvent({
      requestId,
      event: status === 401 ? 'authentication_failed' : 'authorization_denied',
      method: req.method,
      path: req.url || '/',
      status,
      errorCode: code,
      actor,
      resource
    });
    sendJson(res, status, {
      error: {
        message: error?.message || 'No autorizado.',
        code,
        requestId
      }
    }, { requestId });
    return undefined;
  }
};

const mustRestrictByUserId = (role) => ['docente', 'corrector'].includes(String(role || '').trim());

const getReportAccessScope = (user = {}) => ({
  tenantId: String(user.tenantId || user.institution || '').trim(),
  userId: String(user.userId || '').trim(),
  enforceUserScope: mustRestrictByUserId(user.role)
});

const sendForbiddenReportAccess = ({ req, res, requestId, resource }) => {
  const reportId = decodeURIComponent((req.url || '').replace('/api/reportes/', '').replace('/export', '').trim());
  logEvent({
    requestId,
    event: 'report_scope_denied',
    method: req.method,
    path: req.url || '/',
    status: 403,
    errorCode: 'auth_forbidden',
    actor: req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
    resource: {
      action: 'scope_validation',
      type: 'report',
      id: reportId || 'unknown',
      tenantId: req.user?.tenantId || req.user?.institution,
      endpoint: resource,
      timestamp: new Date().toISOString()
    }
  });
  sendJson(res, 403, {
    error: {
      message: 'Acceso denegado: el reporte pertenece a otro tenant o usuario.',
      code: 'auth_forbidden',
      requestId
    }
  }, { requestId });
};

const logReportAuditEvent = ({ requestId, req, event, reportId, status, action, resource }) => {
  logEvent({
    requestId,
    event,
    method: req.method,
    path: req.url || '/',
    status,
    actor: req.user ? { userId: req.user.userId, role: req.user.role, tenantId: req.user.tenantId || req.user.institution } : undefined,
    resource: {
      action,
      type: 'report',
      id: reportId,
      tenantId: req.user?.tenantId || req.user?.institution,
      endpoint: resource,
      timestamp: new Date().toISOString()
    }
  });
};

const handler = async (req, res) => {
  const requestId = getOrCreateRequestId(req);
  const startedAt = Date.now();
  const requestPath = req.url || '/';

  logEvent({
    requestId,
    event: 'request_started',
    method: req.method,
    path: requestPath
  });

  if (req.method === 'GET' && req.url === '/api/calificacion/proveedor') {
    const status = orchestrator.getStatus();
    sendJson(res, 200, {
      proveedor: status.primary?.name,
      modelo: status.primary?.model,
      secundario: status.secondary,
      fallback: status.fallback,
      timeoutMs: status.timeoutMs
    }, { requestId });
    logEvent({
      requestId,
      event: 'request_completed',
      method: req.method,
      path: requestPath,
      status: 200,
      durationMs: Date.now() - startedAt
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/calificacion/sugerir') {
    try {
      const accessResult = await runProtectedAction({
        req,
        res,
        requestId,
        action: 'correct_exam',
        resource: '/api/calificacion/sugerir',
        onAllowed: async () => true
      });
      if (!accessResult) {
        return;
      }
      assertInternalToken(req);
      assertRateLimit({ req, requestId, method: req.method, path: requestPath });
      const payload = await parseBody(req);
      logEvent({
        requestId,
        event: 'provider_selected',
        method: req.method,
        path: requestPath,
        provider: orchestrator.getStatus().primary?.name,
        model: orchestrator.getStatus().primary?.model,
        payloadMetadata: safePayloadMetadata(payload)
      });
      const { datos, puntaje } = validarPayload(payload);
      const sugerencia = await orchestrator.suggestGrade({ datos, puntaje }, {
        requestId,
        method: req.method,
        path: requestPath
      });
      sendJson(res, 200, sugerencia, { requestId });
      logEvent({
        requestId,
        event: 'request_completed',
        method: req.method,
        path: requestPath,
        status: 200,
        durationMs: Date.now() - startedAt,
        provider: sugerencia.proveedor,
        model: sugerencia.modelo
      });
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(res, error.status || 400, {
          error: {
            message: error.message,
            code: error.code,
            requestId
          }
        }, { requestId });
        logEvent({
          requestId,
          event: 'request_completed',
          method: req.method,
          path: requestPath,
          status: error.status || 400,
          durationMs: Date.now() - startedAt,
          errorCode: error.code
        });
        return;
      }

      if (error instanceof ProviderIntegrationError) {
        sendJson(res, error.status || 500, {
          error: {
            message: error.message,
            code: error.code,
            provider: error.provider || orchestrator.getStatus().primary?.name,
            requestId
          }
        }, { requestId });
        logEvent({
          requestId,
          event: 'request_completed',
          method: req.method,
          path: requestPath,
          status: error.status || 500,
          durationMs: Date.now() - startedAt,
          provider: error.provider || orchestrator.getStatus().primary?.name,
          errorCode: error.code
        });
        return;
      }

      sendJson(res, 400, {
        error: {
          message: error?.message || 'No se pudo procesar la solicitud.',
          code: API_ERRORS.BAD_REQUEST,
          requestId
        }
      }, { requestId });
      logEvent({
        requestId,
        event: 'request_completed',
        method: req.method,
        path: requestPath,
        status: 400,
        durationMs: Date.now() - startedAt,
        errorCode: API_ERRORS.BAD_REQUEST
      });
    }

    return;
  }

  if (req.method === 'GET' && req.url === '/api/reportes') {
    const accessResult = await runProtectedAction({
      req,
      res,
      requestId,
      action: 'view_history',
      resource: '/api/reportes',
      onAllowed: async () => true
    });
    if (!accessResult) {
      return;
    }

    try {
      const reportes = await listReports(getReportAccessScope(req.user));
      sendJson(res, 200, { data: reportes }, { requestId });
    } catch (error) {
      sendJson(res, 500, {
        error: {
          message: error?.message || 'No se pudieron listar reportes.',
          code: API_ERRORS.BAD_REQUEST,
          requestId
        }
      }, { requestId });
    }
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/reportes/') && req.url?.endsWith('/export')) {
    const accessResult = await runProtectedAction({
      req,
      res,
      requestId,
      action: 'export_report',
      resource: '/api/reportes/:id/export',
      onAllowed: async () => true
    });
    if (!accessResult) {
      return;
    }

    const reportId = decodeURIComponent(req.url.replace('/api/reportes/', '').replace('/export', '').trim());
    const accessScope = getReportAccessScope(req.user);
    const reporte = await getReportById(reportId, accessScope);
    if (!reporte) {
      const existing = await getReportByIdUnscoped(reportId);
      if (existing) {
        sendForbiddenReportAccess({ req, res, requestId, resource: '/api/reportes/:id/export' });
        return;
      }
      sendJson(res, 404, {
        error: {
          message: 'Reporte no encontrado.',
          code: API_ERRORS.NOT_FOUND,
          requestId
        }
      }, { requestId });
      return;
    }

    sendJson(res, 200, {
      data: reporte,
      export: { format: 'json', generatedAt: new Date().toISOString() }
    }, { requestId });
    logReportAuditEvent({
      requestId,
      req,
      event: 'report_exported',
      reportId,
      status: 200,
      action: 'export_report',
      resource: '/api/reportes/:id/export'
    });
    return;
  }

  const reportVersionsListMatch = req.method === 'GET'
    ? req.url?.match(/^\/api\/reportes\/([^/]+)\/versiones$/)
    : null;
  if (reportVersionsListMatch) {
    const accessResult = await runProtectedAction({
      req,
      res,
      requestId,
      action: 'view_history',
      resource: '/api/reportes/:id/versiones',
      onAllowed: async () => true
    });
    if (!accessResult) {
      return;
    }

    const reportId = decodeURIComponent(reportVersionsListMatch[1]);
    const accessScope = getReportAccessScope(req.user);
    const scopedReport = await getReportById(reportId, accessScope);
    if (!scopedReport) {
      const existing = await getReportByIdUnscoped(reportId);
      if (existing) {
        sendForbiddenReportAccess({ req, res, requestId, resource: '/api/reportes/:id/versiones' });
        return;
      }
      sendJson(res, 404, {
        error: {
          message: 'Reporte no encontrado.',
          code: API_ERRORS.NOT_FOUND,
          requestId
        }
      }, { requestId });
      return;
    }

    const versions = await listReportVersions(reportId);
    sendJson(res, 200, { data: versions }, { requestId });
    return;
  }

  const reportVersionDetailMatch = req.method === 'GET'
    ? req.url?.match(/^\/api\/reportes\/([^/]+)\/versiones\/(\d+)$/)
    : null;
  if (reportVersionDetailMatch) {
    const accessResult = await runProtectedAction({
      req,
      res,
      requestId,
      action: 'view_history',
      resource: '/api/reportes/:id/versiones/:version',
      onAllowed: async () => true
    });
    if (!accessResult) {
      return;
    }

    const reportId = decodeURIComponent(reportVersionDetailMatch[1]);
    const requestedVersion = Number(reportVersionDetailMatch[2]);
    const accessScope = getReportAccessScope(req.user);
    const scopedReport = await getReportById(reportId, accessScope);
    if (!scopedReport) {
      const existing = await getReportByIdUnscoped(reportId);
      if (existing) {
        sendForbiddenReportAccess({ req, res, requestId, resource: '/api/reportes/:id/versiones/:version' });
        return;
      }
      sendJson(res, 404, {
        error: {
          message: 'Reporte no encontrado.',
          code: API_ERRORS.NOT_FOUND,
          requestId
        }
      }, { requestId });
      return;
    }

    const version = await getReportVersion(reportId, requestedVersion);
    if (!version) {
      sendJson(res, 404, {
        error: {
          message: 'Versión no encontrada.',
          code: API_ERRORS.NOT_FOUND,
          requestId
        }
      }, { requestId });
      return;
    }

    sendJson(res, 200, version, { requestId });
    return;
  }

  if (req.method === 'DELETE' && req.url?.startsWith('/api/reportes/')) {
    const accessResult = await runProtectedAction({
      req,
      res,
      requestId,
      action: 'delete_report',
      resource: '/api/reportes/:id',
      onAllowed: async () => true
    });
    if (!accessResult) {
      return;
    }

    const reportId = decodeURIComponent(req.url.replace('/api/reportes/', '').trim());
    const accessScope = getReportAccessScope(req.user);
    const existingScoped = await getReportById(reportId, accessScope);
    if (!existingScoped) {
      const existing = await getReportByIdUnscoped(reportId);
      if (existing) {
        sendForbiddenReportAccess({ req, res, requestId, resource: '/api/reportes/:id' });
        return;
      }
      sendJson(res, 404, {
        error: {
          message: 'Reporte no encontrado.',
          code: API_ERRORS.NOT_FOUND,
          requestId
        }
      }, { requestId });
      return;
    }

    const deleted = await deleteReport(reportId, {
      actor: String(req.headers['x-actor'] || req.user?.userId || 'frontend_tecnico').trim() || 'frontend_tecnico',
      auditMetadata: {
        tenantId: req.user?.tenantId || req.user?.institution,
        userId: req.user?.userId,
        role: req.user?.role,
        sessionId: req.user?.sessionId,
        resource: '/api/reportes/:id',
        timestamp: new Date().toISOString()
      }
    });

    if (!deleted) {
      sendJson(res, 404, {
        error: {
          message: 'Reporte no encontrado.',
          code: API_ERRORS.NOT_FOUND,
          requestId
        }
      }, { requestId });
      return;
    }

    logReportAuditEvent({
      requestId,
      req,
      event: 'report_deleted',
      reportId,
      status: 200,
      action: 'delete_report',
      resource: '/api/reportes/:id'
    });
    sendJson(res, 200, {
      data: {
        id: reportId,
        deleted: true,
        deletedAt: new Date().toISOString()
      }
    }, { requestId });
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/reportes/')) {
    const accessResult = await runProtectedAction({
      req,
      res,
      requestId,
      action: 'view_history',
      resource: '/api/reportes/:id',
      onAllowed: async () => true
    });
    if (!accessResult) {
      return;
    }

    const reportId = decodeURIComponent(req.url.replace('/api/reportes/', '').trim());
    const accessScope = getReportAccessScope(req.user);
    const reporte = await getReportById(reportId, accessScope);

    if (!reporte) {
      const existing = await getReportByIdUnscoped(reportId);
      if (existing) {
        sendForbiddenReportAccess({ req, res, requestId, resource: '/api/reportes/:id' });
        return;
      }
      sendJson(res, 404, {
        error: {
          message: 'Reporte no encontrado.',
          code: API_ERRORS.NOT_FOUND,
          requestId
        }
      }, { requestId });
      return;
    }

    sendJson(res, 200, reporte, { requestId });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/reportes') {
    const accessResult = await runProtectedAction({
      req,
      res,
      requestId,
      action: 'create_exam',
      resource: '/api/reportes',
      onAllowed: async () => true
    });
    if (!accessResult) {
      return;
    }

    try {
      const payload = validarPayloadReporte(await parseBody(req));
      const actor = String(req.headers['x-actor'] || 'frontend_tecnico').trim() || 'frontend_tecnico';
      const payloadId = typeof payload.id === 'string' ? payload.id : '';
      const accessScope = getReportAccessScope(req.user);
      const existe = payloadId ? await getReportById(payloadId, accessScope) : null;

      if (payloadId && !existe) {
        const existing = await getReportByIdUnscoped(payloadId);
        if (existing) {
          sendForbiddenReportAccess({ req, res, requestId, resource: '/api/reportes' });
          return;
        }
      }

      const ownership = {
        tenantId: req.user?.tenantId,
        userId: req.user?.userId,
        role: req.user?.role
      };
      const auditMetadata = {
        tenantId: req.user?.tenantId || req.user?.institution,
        sessionId: req.user?.sessionId
      };
      const reporte = existe
        ? await updateReport(payloadId, payload, { actor, ownership, auditMetadata })
        : await createReport(payload, { actor, ownership, auditMetadata });

      sendJson(res, existe ? 200 : 201, reporte, { requestId });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 400;
      const code = error instanceof ApiError ? error.code : API_ERRORS.BAD_REQUEST;
      sendJson(res, status, {
        error: {
          message: error?.message || 'No se pudo guardar el reporte.',
          code,
          requestId
        }
      }, { requestId });
    }
    return;
  }

  sendJson(res, 404, {
    error: {
      message: 'Ruta no encontrada.',
      code: API_ERRORS.NOT_FOUND,
      requestId
    }
  }, { requestId });
  logEvent({
    requestId,
    event: 'request_completed',
    method: req.method,
    path: requestPath,
    status: 404,
    durationMs: Date.now() - startedAt,
    errorCode: API_ERRORS.NOT_FOUND
  });
};

const server = http.createServer((req, res) => {
  handler(req, res);
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    const status = orchestrator.getStatus();
    console.log(`Backend de CalificaYa escuchando en http://localhost:${PORT} usando proveedor ${status.primary?.name}`);
  });
}

export { server, handler, getRateLimitIdentifier };
