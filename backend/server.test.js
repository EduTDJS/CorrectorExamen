import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';

const ORIGINAL_ENV = { ...process.env };
let tempDir = '';

const basePayload = {
  datos: {
    materia: 'Contabilidad',
    grupo: 'A',
    fecha: '2026-03-20',
    totalPreguntas: 10
  },
  puntaje: 84.5
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

const restoreEnv = () => {
  process.env = { ...ORIGINAL_ENV };
};

const buildSessionToken = ({
  sub = 'u-docente-1',
  role = 'docente',
  institution = 'Instituto Central',
  tenantId = institution,
  sessionId = 'session-123',
  exp = Math.floor(Date.now() / 1000) + 60 * 60,
  secret = 'session-secret-test'
} = {}) => {
  const payload = { sub, role, institution, tenantId, sessionId, exp };
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signedContent = `v1.${payloadEncoded}`;
  const signature = crypto.createHmac('sha256', secret).update(signedContent).digest('base64url');
  return `${signedContent}.${signature}`;
};

const loadServer = async ({
  provider = 'anthropic',
  secondaryProvider = '',
  fallbackEnabled = true,
  fallbackRetries = 0,
  fallbackErrorCodes = 'provider_timeout,provider_upstream_error',
  timeoutMs = 20000,
  internalToken = 'test-internal-token',
  sessionSecret = 'session-secret-test',
  anthropicKey = 'anthropic-key',
  openAiKey = 'openai-key',
  rateLimitWindowMs = 60000,
  rateLimitMaxRequests = 20,
  rateLimitMaxRequestsDocente = 20,
  rateLimitMaxRequestsCoordinador = 30,
  rateLimitMaxRequestsAdmin = 40,
  rateLimitNearThresholdRatio = 0.8
} = {}) => {
  process.env.NODE_ENV = 'test';
  process.env.AI_PROVIDER = provider;
  process.env.AI_PROVIDER_SECONDARY = secondaryProvider;
  process.env.AI_FALLBACK_ENABLED = String(fallbackEnabled);
  process.env.AI_FALLBACK_RETRIES = String(fallbackRetries);
  process.env.AI_FALLBACK_ERROR_CODES = fallbackErrorCodes;
  process.env.AI_CIRCUIT_FAILURE_THRESHOLD = '2';
  process.env.AI_CIRCUIT_OPEN_MS = '1000';
  process.env.AI_REQUEST_TIMEOUT_MS = String(timeoutMs);
  process.env.INTERNAL_AUTH_TOKEN = internalToken;
  process.env.INTERNAL_AUTH_HEADER = 'x-internal-token';

  process.env.RATE_LIMIT_WINDOW_MS = String(rateLimitWindowMs);
  process.env.RATE_LIMIT_MAX_REQUESTS = String(rateLimitMaxRequests);
  process.env.RATE_LIMIT_MAX_REQUESTS_DOCENTE = String(rateLimitMaxRequestsDocente);
  process.env.RATE_LIMIT_MAX_REQUESTS_COORDINADOR = String(rateLimitMaxRequestsCoordinador);
  process.env.RATE_LIMIT_MAX_REQUESTS_ADMIN = String(rateLimitMaxRequestsAdmin);
  process.env.RATE_LIMIT_NEAR_THRESHOLD_RATIO = String(rateLimitNearThresholdRatio);
  process.env.SESSION_TOKEN_SECRET = sessionSecret;
  process.env.REPORTS_DB_FILE = path.join(tempDir, 'reports-db.sqlite');

  if (provider === 'anthropic' || secondaryProvider === 'anthropic') {
    process.env.ANTHROPIC_API_KEY = anthropicKey;
  }

  if (provider === 'openai' || secondaryProvider === 'openai') {
    process.env.OPENAI_API_KEY = openAiKey;
  }

  vi.resetModules();
  const mod = await import('./server.js');

  await new Promise((resolve) => mod.server.listen(0, '127.0.0.1', resolve));
  const address = mod.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    ...mod,
    baseUrl,
    close: async () => {
      await new Promise((resolve) => mod.server.close(resolve));
      const { closeDbPool } = await import('./db/pool.js');
      const { resetMigrationStateForTests } = await import('./db/migrate.js');
      closeDbPool();
      resetMigrationStateForTests();
    }
  };
};

const apiRequest = ({
  baseUrl,
  path: requestPath,
  method = 'GET',
  body,
  token = 'test-internal-token',
  authToken = buildSessionToken(),
  headers = {}
}) => new Promise((resolve, reject) => {
  const url = new URL(requestPath, baseUrl);
  const req = http.request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-internal-token': token,
      authorization: `Bearer ${authToken}`,
      ...headers
    }
  }, (res) => {
    let raw = '';
    res.on('data', (chunk) => {
      raw += chunk;
    });
    res.on('end', () => {
      resolve({
        status: res.statusCode,
        headers: res.headers,
        json: raw ? JSON.parse(raw) : {}
      });
    });
  });

  req.on('error', reject);

  if (body) {
    req.write(JSON.stringify(body));
  }

  req.end();
});

describe('backend/server API', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'corrector-backend-'));
    restoreEnv();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('GET /api/calificacion/proveedor devuelve proveedor y modelo activos', async () => {
    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/proveedor' });
      expect(result.status).toBe(200);
      expect(result.json).toMatchObject({
        proveedor: 'openai',
        modelo: 'gpt-4o-mini',
        timeoutMs: 20000
      });
    } finally {
      await app.close();
    }
  });

  it('POST /api/calificacion/sugerir normaliza contrato para OpenAI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {
      choices: [{ message: { content: '{"puntuacion_sugerida": 88, "justificacion_breve": "Correcto"}' } }]
    })));

    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(200);
      expect(result.json).toMatchObject({ puntuacion: '88.00', proveedor: 'openai' });
    } finally {
      await app.close();
    }
  });

  it('POST /api/calificacion/sugerir hace failover a secundario cuando falla primario', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(502, { error: { message: 'upstream fail' } }))
      .mockResolvedValueOnce(jsonResponse(200, {
        choices: [{ message: { content: '{"puntuacion_sugerida": 91, "justificacion_breve": "Fallback ok"}' } }]
      }));
    vi.stubGlobal('fetch', fetchMock);

    const logSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const app = await loadServer({
      provider: 'anthropic',
      secondaryProvider: 'openai',
      fallbackEnabled: true,
      fallbackRetries: 0
    });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(200);
      expect(result.json.proveedor).toBe('openai');
      const failoverLogged = logSpy.mock.calls.some(([line]) => String(line).includes('"event":"provider_failover"'));
      expect(failoverLogged).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
      logSpy.mockRestore();
    }
  });

  it('POST /api/calificacion/sugerir devuelve error del primario si no hay secundario', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, { error: { message: 'service unavailable' } })));
    const app = await loadServer({
      provider: 'anthropic',
      secondaryProvider: '',
      fallbackEnabled: false,
      fallbackRetries: 0
    });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(503);
      expect(result.json.error.provider).toBe('anthropic');
    } finally {
      await app.close();
    }
  });

  it('POST /api/reportes permite crear, listar, obtener y editar con auditoría', async () => {
    const app = await loadServer({ provider: 'openai' });

    try {
      const payload = {
        examen: { materia: 'Contabilidad', grupo: 'A', fecha: '2026-03-20', totalPreguntas: 10, claveRespuestas: 'ABCD' },
        estudiante: { nombre: 'Ana', matricula: 'A1' },
        respuestas: { lista: ['A', 'B'], texto: 'AB' },
        puntuacionPorPregunta: [],
        justificacionesIA: [],
        calificacionFinal: { notaSobre100: 80, letra: 'B', justificacionDocente: 'Bien' }
      };

      const created = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        method: 'POST',
        headers: { 'x-actor': 'qa_tester' },
        body: payload
      });
      expect(created.status).toBe(201);
      expect(created.json.id).toBeTruthy();
      expect(created.json.ownership).toMatchObject({
        tenantId: 'Instituto Central',
        userId: 'u-docente-1',
        role: 'docente'
      });

      const listed = await apiRequest({ baseUrl: app.baseUrl, path: '/api/reportes' });
      expect(listed.status).toBe(200);
      expect(listed.json.data).toHaveLength(1);

      const byId = await apiRequest({ baseUrl: app.baseUrl, path: `/api/reportes/${created.json.id}` });
      expect(byId.status).toBe(200);
      expect(byId.json.estudiante.nombre).toBe('Ana');

      const updated = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        method: 'POST',
        headers: { 'x-actor': 'qa_tester' },
        body: { ...created.json, estudiante: { ...created.json.estudiante, nombre: 'Ana Editada' } }
      });
      expect(updated.status).toBe(200);
      expect(updated.json.estudiante.nombre).toBe('Ana Editada');

      const rawLogs = execFileSync(
        'sqlite3',
        ['-json', process.env.REPORTS_DB_FILE, 'SELECT action, actor, metadata_json FROM audit_logs ORDER BY created_at ASC;'],
        { encoding: 'utf-8' }
      );
      const auditLogs = JSON.parse(rawLogs);

      expect(auditLogs).toHaveLength(2);
      expect(auditLogs.map((log) => log.action)).toEqual(['report_created', 'report_updated']);
      expect(auditLogs[0].actor).toBe('qa_tester');
      expect(JSON.parse(auditLogs[0].metadata_json)).toMatchObject({
        tenantId: 'Instituto Central',
        sessionId: 'session-123'
      });
    } finally {
      await app.close();
    }
  });

  it('permite acceder reportes dentro del mismo tenant', async () => {
    const app = await loadServer({ provider: 'openai' });
    const ownerToken = buildSessionToken({ sub: 'u-docente-owner', role: 'docente', tenantId: 'tenant-1', institution: 'inst-1' });
    const tenantAuditorToken = buildSessionToken({ sub: 'u-auditor-1', role: 'auditor', tenantId: 'tenant-1', institution: 'inst-1' });

    try {
      const created = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        method: 'POST',
        authToken: ownerToken,
        body: {
          examen: { materia: 'Contabilidad', grupo: 'A', fecha: '2026-03-20', totalPreguntas: 10, claveRespuestas: 'ABCD' },
          estudiante: { nombre: 'Ana', matricula: 'A1' },
          respuestas: { lista: ['A', 'B'], texto: 'AB' },
          puntuacionPorPregunta: [],
          justificacionesIA: [],
          calificacionFinal: { notaSobre100: 80, letra: 'B', justificacionDocente: 'Bien' }
        }
      });
      expect(created.status).toBe(201);

      const byId = await apiRequest({
        baseUrl: app.baseUrl,
        path: `/api/reportes/${created.json.id}`,
        authToken: tenantAuditorToken
      });
      expect(byId.status).toBe(200);

      const exported = await apiRequest({
        baseUrl: app.baseUrl,
        path: `/api/reportes/${created.json.id}/export`,
        authToken: tenantAuditorToken
      });
      expect(exported.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('deniega acceso cross-tenant por id y export con 403', async () => {
    const app = await loadServer({ provider: 'openai' });
    const ownerToken = buildSessionToken({ sub: 'u-docente-owner', role: 'docente', tenantId: 'tenant-owner', institution: 'inst-owner' });
    const foreignTenantToken = buildSessionToken({ sub: 'u-auditor-foreign', role: 'auditor', tenantId: 'tenant-foreign', institution: 'inst-foreign' });

    try {
      const created = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        method: 'POST',
        authToken: ownerToken,
        body: {
          examen: { materia: 'Contabilidad', grupo: 'A', fecha: '2026-03-20', totalPreguntas: 10, claveRespuestas: 'ABCD' },
          estudiante: { nombre: 'Ana', matricula: 'A1' },
          respuestas: { lista: ['A', 'B'], texto: 'AB' },
          puntuacionPorPregunta: [],
          justificacionesIA: [],
          calificacionFinal: { notaSobre100: 80, letra: 'B', justificacionDocente: 'Bien' }
        }
      });
      expect(created.status).toBe(201);

      const byId = await apiRequest({
        baseUrl: app.baseUrl,
        path: `/api/reportes/${created.json.id}`,
        authToken: foreignTenantToken
      });
      expect(byId.status).toBe(403);
      expect(byId.json.error.code).toBe('auth_forbidden');

      const exported = await apiRequest({
        baseUrl: app.baseUrl,
        path: `/api/reportes/${created.json.id}/export`,
        authToken: foreignTenantToken
      });
      expect(exported.status).toBe(403);
      expect(exported.json.error.code).toBe('auth_forbidden');
    } finally {
      await app.close();
    }
  });

  it('aísla listados por tenant y por usuario cuando aplica política', async () => {
    const app = await loadServer({ provider: 'openai' });
    const docenteA = buildSessionToken({ sub: 'u-docente-a', role: 'docente', tenantId: 'tenant-1', institution: 'inst-1' });
    const docenteB = buildSessionToken({ sub: 'u-docente-b', role: 'docente', tenantId: 'tenant-1', institution: 'inst-1' });
    const docenteOtherTenant = buildSessionToken({ sub: 'u-docente-c', role: 'docente', tenantId: 'tenant-2', institution: 'inst-2' });
    const auditorTenant1 = buildSessionToken({ sub: 'u-auditor-1', role: 'auditor', tenantId: 'tenant-1', institution: 'inst-1' });

    try {
      const createReportFor = (authToken, nombre) => apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        method: 'POST',
        authToken,
        body: {
          examen: { materia: 'Contabilidad', grupo: 'A', fecha: '2026-03-20', totalPreguntas: 10, claveRespuestas: 'ABCD' },
          estudiante: { nombre, matricula: `${nombre}-M` },
          respuestas: { lista: ['A', 'B'], texto: 'AB' },
          puntuacionPorPregunta: [],
          justificacionesIA: [],
          calificacionFinal: { notaSobre100: 80, letra: 'B', justificacionDocente: 'Bien' }
        }
      });

      expect((await createReportFor(docenteA, 'Ana')).status).toBe(201);
      expect((await createReportFor(docenteB, 'Beto')).status).toBe(201);
      expect((await createReportFor(docenteOtherTenant, 'Carla')).status).toBe(201);

      const listedDocenteA = await apiRequest({ baseUrl: app.baseUrl, path: '/api/reportes', authToken: docenteA });
      expect(listedDocenteA.status).toBe(200);
      expect(listedDocenteA.json.data).toHaveLength(1);
      expect(listedDocenteA.json.data[0].estudiante.nombre).toBe('Ana');

      const listedAuditorTenant1 = await apiRequest({ baseUrl: app.baseUrl, path: '/api/reportes', authToken: auditorTenant1 });
      expect(listedAuditorTenant1.status).toBe(200);
      expect(listedAuditorTenant1.json.data).toHaveLength(2);
      expect(listedAuditorTenant1.json.data.map((report) => report.estudiante.nombre).sort()).toEqual(['Ana', 'Beto']);
    } finally {
      await app.close();
    }
  });

  it('POST /api/reportes valida payload mínimo', async () => {
    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        method: 'POST',
        body: { estudiante: { nombre: 'X' } }
      });

      expect(result.status).toBe(400);
      expect(result.json.error.code).toBe('payload_validation_error');
    } finally {
      await app.close();
    }
  });

  it('devuelve 401 cuando falta token de sesión', async () => {
    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        headers: { authorization: '' }
      });

      expect(result.status).toBe(401);
      expect(result.json.error.code).toBe('auth_unauthorized');
    } finally {
      await app.close();
    }
  });

  it('devuelve 403 cuando el rol no tiene permiso para exportar', async () => {
    const app = await loadServer({ provider: 'openai' });
    const docenteToken = buildSessionToken({ role: 'docente' });

    try {
      const created = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        method: 'POST',
        authToken: docenteToken,
        body: {
          examen: { materia: 'Contabilidad', grupo: 'A', fecha: '2026-03-20', totalPreguntas: 10, claveRespuestas: 'ABCD' },
          estudiante: { nombre: 'Ana', matricula: 'A1' },
          respuestas: { lista: ['A', 'B'], texto: 'AB' },
          puntuacionPorPregunta: [],
          justificacionesIA: [],
          calificacionFinal: { notaSobre100: 80, letra: 'B', justificacionDocente: 'Bien' }
        }
      });
      expect(created.status).toBe(201);

      const correctorToken = buildSessionToken({ role: 'corrector', sub: 'u-corrector-1', sessionId: 'session-999' });
      const exported = await apiRequest({
        baseUrl: app.baseUrl,
        path: `/api/reportes/${created.json.id}/export`,
        authToken: correctorToken
      });

      expect(exported.status).toBe(403);
      expect(exported.json.error.code).toBe('auth_forbidden');
    } finally {
      await app.close();
    }
  });

  it('permite exportar cuando el rol tiene permiso', async () => {
    const app = await loadServer({ provider: 'openai' });
    const docenteToken = buildSessionToken({ role: 'docente' });

    try {
      const created = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/reportes',
        method: 'POST',
        authToken: docenteToken,
        body: {
          examen: { materia: 'Contabilidad', grupo: 'A', fecha: '2026-03-20', totalPreguntas: 10, claveRespuestas: 'ABCD' },
          estudiante: { nombre: 'Ana', matricula: 'A1' },
          respuestas: { lista: ['A', 'B'], texto: 'AB' },
          puntuacionPorPregunta: [],
          justificacionesIA: [],
          calificacionFinal: { notaSobre100: 80, letra: 'B', justificacionDocente: 'Bien' }
        }
      });
      expect(created.status).toBe(201);

      const auditorToken = buildSessionToken({ role: 'auditor', sub: 'u-auditor-1', sessionId: 'session-444' });
      const exported = await apiRequest({
        baseUrl: app.baseUrl,
        path: `/api/reportes/${created.json.id}/export`,
        authToken: auditorToken
      });

      expect(exported.status).toBe(200);
      expect(exported.json.data.id).toBe(created.json.id);
      expect(exported.json.export.format).toBe('json');
    } finally {
      await app.close();
    }
  });

  it('aplica rate limiting por usuario dentro del mismo tenant', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {
      choices: [{ message: { content: '{"puntuacion_sugerida": 88, "justificacion_breve": "Correcto"}' } }]
    })));
    const app = await loadServer({ provider: 'openai', internalToken: 'shared-internal-token', rateLimitMaxRequestsDocente: 2 });

    try {
      const docenteA = buildSessionToken({ sub: 'u-docente-a', role: 'docente', institution: 'inst-1', tenantId: 'tenant-1' });
      const docenteB = buildSessionToken({ sub: 'u-docente-b', role: 'docente', institution: 'inst-1', tenantId: 'tenant-1' });

      const r1 = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: docenteA, token: 'shared-internal-token', body: basePayload });
      const r2 = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: docenteA, token: 'shared-internal-token', body: basePayload });
      const r3 = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: docenteA, token: 'shared-internal-token', body: basePayload });
      const otherUser = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: docenteB, token: 'shared-internal-token', body: basePayload });

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);
      expect(otherUser.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('mantiene backward compatibility por token/IP cuando no hay identidad autenticada', async () => {
    const app = await loadServer({ provider: 'openai' });

    try {
      const tokenKey = app.getRateLimitIdentifier({
        headers: { 'x-internal-token': 'legacy-token' },
        socket: { remoteAddress: '10.10.0.10' }
      });
      const ipKey = app.getRateLimitIdentifier({
        headers: {},
        socket: { remoteAddress: '10.10.0.11' }
      });

      expect(tokenKey).toBe('token:legacy-token');
      expect(ipKey).toBe('ip:10.10.0.11');
    } finally {
      await app.close();
    }
  });

  it('aplica límites diferenciados por rol y registra saturación', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {
      choices: [{ message: { content: '{"puntuacion_sugerida": 88, "justificacion_breve": "Correcto"}' } }]
    })));
    const logSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const app = await loadServer({
      provider: 'openai',
      rateLimitMaxRequestsDocente: 1,
      rateLimitMaxRequestsCoordinador: 2,
      rateLimitMaxRequestsAdmin: 3,
      rateLimitNearThresholdRatio: 0.5
    });

    try {
      const docenteToken = buildSessionToken({ sub: 'u-doc', role: 'docente', institution: 'inst-1', tenantId: 'tenant-1' });
      const coordinadorToken = buildSessionToken({ sub: 'u-coord', role: 'coordinador', institution: 'inst-1', tenantId: 'tenant-1' });
      const adminToken = buildSessionToken({ sub: 'u-admin', role: 'admin', institution: 'inst-1', tenantId: 'tenant-1' });

      const docenteFirst = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: docenteToken, body: basePayload });
      const docenteSecond = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: docenteToken, body: basePayload });
      const coordFirst = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: coordinadorToken, body: basePayload });
      const coordSecond = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: coordinadorToken, body: basePayload });
      const coordThird = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: coordinadorToken, body: basePayload });
      const adminFirst = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: adminToken, body: basePayload });
      const adminSecond = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: adminToken, body: basePayload });
      const adminThird = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: adminToken, body: basePayload });
      const adminFourth = await apiRequest({ baseUrl: app.baseUrl, path: '/api/calificacion/sugerir', method: 'POST', authToken: adminToken, body: basePayload });

      expect(docenteFirst.status).toBe(200);
      expect(docenteSecond.status).toBe(429);
      expect(coordFirst.status).toBe(200);
      expect(coordSecond.status).toBe(200);
      expect(coordThird.status).toBe(429);
      expect(adminFirst.status).toBe(200);
      expect(adminSecond.status).toBe(200);
      expect(adminThird.status).toBe(200);
      expect(adminFourth.status).toBe(429);

      const saturationLogged = logSpy.mock.calls.some(([line]) => String(line).includes('"event":"rate_limit_saturation"'));
      expect(saturationLogged).toBe(true);
    } finally {
      await app.close();
      logSpy.mockRestore();
    }
  });

});
