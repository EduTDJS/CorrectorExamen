import http from 'node:http';
import crypto from 'node:crypto';
import {
  createReport,
  getReportById,
  listReports,
  updateReport
} from './repositories/reportRepository.js';
import { AuthError, authenticate } from './middleware/auth.js';
import { AuthorizationError, authorize } from './middleware/authorize.js';

const PORT = Number(process.env.PORT || 8787);
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 20000);
const AI_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
const INTERNAL_AUTH_TOKEN = process.env.INTERNAL_AUTH_TOKEN || '';
const INTERNAL_AUTH_HEADER = (process.env.INTERNAL_AUTH_HEADER || 'x-internal-token').toLowerCase();
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20);
const RATE_LIMIT_KEY_STRATEGY = (process.env.RATE_LIMIT_KEY_STRATEGY || 'token_or_ip').toLowerCase();

const PROVIDER_ERRORS = {
  CONFIG: 'provider_config_error',
  TIMEOUT: 'provider_timeout',
  UPSTREAM: 'provider_upstream_error',
  CONTRACT: 'provider_contract_error',
  PAYLOAD: 'payload_validation_error'
};

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
  resource
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

const buildPrompt = ({ datos, puntaje }) => ([
  'Eres una profesora experta en contabilidad y evaluación formativa.',
  `Materia: ${datos.materia}`,
  `Grupo: ${datos.grupo}`,
  `Fecha: ${datos.fecha}`,
  `Total de preguntas: ${datos.totalPreguntas}`,
  `Puntaje automático actual: ${Number(puntaje).toFixed(2)} / 100`,
  'Responde SOLO JSON: {"puntuacion_sugerida": number, "justificacion_breve": "texto"}'
].join('\n'));

class ProviderIntegrationError extends Error {
  constructor(message, { status = 502, code = PROVIDER_ERRORS.UPSTREAM } = {}) {
    super(message);
    this.name = 'ProviderIntegrationError';
    this.status = status;
    this.code = code;
  }
}

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

  if (RATE_LIMIT_KEY_STRATEGY === 'token' && token) {
    return `token:${token}`;
  }
  if (RATE_LIMIT_KEY_STRATEGY === 'ip') {
    return `ip:${ip}`;
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

const assertRateLimit = (req) => {
  const now = Date.now();
  const key = getRateLimitIdentifier(req);
  const bucket = requestBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    throw new ApiError('Límite de solicitudes excedido. Intenta nuevamente más tarde.', {
      status: 429,
      code: API_ERRORS.RATE_LIMITED
    });
  }

  bucket.count += 1;
};

const extraerJsonDeTexto = (texto = '') => {
  const input = String(texto).trim();
  if (!input) {
    throw new ProviderIntegrationError('El proveedor devolvió texto vacío.', { code: PROVIDER_ERRORS.CONTRACT });
  }

  try {
    return JSON.parse(input);
  } catch {
    const inicio = input.indexOf('{');
    const fin = input.lastIndexOf('}');
    if (inicio === -1 || fin === -1 || fin <= inicio) {
      throw new ProviderIntegrationError('No se encontró un bloque JSON válido en la respuesta del proveedor.', { code: PROVIDER_ERRORS.CONTRACT });
    }

    try {
      return JSON.parse(input.slice(inicio, fin + 1));
    } catch {
      throw new ProviderIntegrationError('La respuesta del proveedor no contiene JSON parseable.', { code: PROVIDER_ERRORS.CONTRACT });
    }
  }
};

const normalizarContrato = ({ provider, model, rawJson }) => {
  const puntuacion = Number(rawJson?.puntuacion_sugerida);
  const justificacion = String(rawJson?.justificacion_breve || '').trim();

  if (!Number.isFinite(puntuacion) || puntuacion < 0 || puntuacion > 100) {
    throw new ProviderIntegrationError('La puntuación devuelta por IA está fuera de rango (0-100).', { code: PROVIDER_ERRORS.CONTRACT });
  }

  if (!justificacion) {
    throw new ProviderIntegrationError('La justificación devuelta por IA está vacía.', { code: PROVIDER_ERRORS.CONTRACT });
  }

  return {
    puntuacion: puntuacion.toFixed(2),
    justificacion,
    proveedor: provider,
    modelo: model
  };
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ProviderIntegrationError(`La solicitud al proveedor excedió el tiempo límite (${timeoutMs / 1000}s).`, {
        status: 504,
        code: PROVIDER_ERRORS.TIMEOUT
      });
    }

    throw new ProviderIntegrationError(error?.message || 'No se pudo conectar con el proveedor de IA.');
  } finally {
    clearTimeout(timeoutId);
  }
};

class AnthropicProvider {
  constructor() {
    this.name = 'anthropic';
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  }

  validateConfig() {
    if (!this.apiKey) {
      throw new ProviderIntegrationError('ANTHROPIC_API_KEY no está configurada en el servidor.', {
        status: 500,
        code: PROVIDER_ERRORS.CONFIG
      });
    }
  }

  async suggestGrade({ datos, puntaje }) {
    this.validateConfig();

    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 250,
        temperature: 0.2,
        messages: [{ role: 'user', content: buildPrompt({ datos, puntaje }) }]
      })
    }, REQUEST_TIMEOUT_MS);

    const data = await response.json();

    if (!response.ok) {
      throw new ProviderIntegrationError(data?.error?.message || 'Error inesperado al consultar Anthropic.', {
        status: response.status,
        code: PROVIDER_ERRORS.UPSTREAM
      });
    }

    const textoIa = (data?.content || [])
      .filter((bloque) => bloque?.type === 'text')
      .map((bloque) => bloque?.text || '')
      .join('\n');

    return normalizarContrato({ provider: this.name, model: this.model, rawJson: extraerJsonDeTexto(textoIa) });
  }
}

class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  validateConfig() {
    if (!this.apiKey) {
      throw new ProviderIntegrationError('OPENAI_API_KEY no está configurada en el servidor.', {
        status: 500,
        code: PROVIDER_ERRORS.CONFIG
      });
    }
  }

  async suggestGrade({ datos, puntaje }) {
    this.validateConfig();

    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: buildPrompt({ datos, puntaje }) }]
      })
    }, REQUEST_TIMEOUT_MS);

    const data = await response.json();

    if (!response.ok) {
      throw new ProviderIntegrationError(data?.error?.message || 'Error inesperado al consultar OpenAI.', {
        status: response.status,
        code: PROVIDER_ERRORS.UPSTREAM
      });
    }

    const textoIa = data?.choices?.[0]?.message?.content || '';
    return normalizarContrato({ provider: this.name, model: this.model, rawJson: extraerJsonDeTexto(textoIa) });
  }
}

const createProvider = (providerName) => {
  if (providerName === 'anthropic') {
    return new AnthropicProvider();
  }
  if (providerName === 'openai') {
    return new OpenAIProvider();
  }

  throw new ProviderIntegrationError(`AI_PROVIDER inválido: "${providerName}". Usa "anthropic" u "openai".`, {
    status: 500,
    code: PROVIDER_ERRORS.CONFIG
  });
};

const activeProvider = createProvider(AI_PROVIDER);

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
    sendJson(res, 200, {
      proveedor: activeProvider.name,
      modelo: activeProvider.model,
      timeoutMs: REQUEST_TIMEOUT_MS
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
      assertRateLimit(req);
      const payload = await parseBody(req);
      logEvent({
        requestId,
        event: 'provider_selected',
        method: req.method,
        path: requestPath,
        provider: activeProvider.name,
        model: activeProvider.model,
        payloadMetadata: safePayloadMetadata(payload)
      });
      const { datos, puntaje } = validarPayload(payload);
      const sugerencia = await activeProvider.suggestGrade({ datos, puntaje });
      sendJson(res, 200, sugerencia, { requestId });
      logEvent({
        requestId,
        event: 'request_completed',
        method: req.method,
        path: requestPath,
        status: 200,
        durationMs: Date.now() - startedAt,
        provider: activeProvider.name,
        model: activeProvider.model
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
            provider: activeProvider.name,
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
          provider: activeProvider.name,
          model: activeProvider.model,
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
      const reportes = await listReports();
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
    const reporte = await getReportById(reportId);
    if (!reporte) {
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
    const reporte = await getReportById(reportId);

    if (!reporte) {
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
      const existe = payloadId ? await getReportById(payloadId) : null;
      const reporte = existe
        ? await updateReport(payloadId, payload, { actor })
        : await createReport(payload, { actor });

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
    console.log(`Backend de CalificaYa escuchando en http://localhost:${PORT} usando proveedor ${activeProvider.name}`);
  });
}

export { server, handler };
