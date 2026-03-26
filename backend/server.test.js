import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';

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
  sessionId = 'session-123',
  exp = Math.floor(Date.now() / 1000) + 60 * 60,
  secret = 'session-secret-test'
} = {}) => {
  const payload = { sub, role, institution, sessionId, exp };
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signedContent = `v1.${payloadEncoded}`;
  const signature = crypto.createHmac('sha256', secret).update(signedContent).digest('base64url');
  return `${signedContent}.${signature}`;
};

const loadServer = async ({
  provider = 'anthropic',
  timeoutMs = 20000,
  internalToken = 'test-internal-token',
  sessionSecret = 'session-secret-test',
  anthropicKey = 'anthropic-key',
  openAiKey = 'openai-key'
} = {}) => {
  process.env.NODE_ENV = 'test';
  process.env.AI_PROVIDER = provider;
  process.env.AI_REQUEST_TIMEOUT_MS = String(timeoutMs);
  process.env.INTERNAL_AUTH_TOKEN = internalToken;
  process.env.INTERNAL_AUTH_HEADER = 'x-internal-token';
  process.env.SESSION_TOKEN_SECRET = sessionSecret;
  process.env.REPORTS_DB_FILE = path.join(tempDir, 'reports-db.json');

  if (provider === 'anthropic') {
    process.env.ANTHROPIC_API_KEY = anthropicKey;
    delete process.env.OPENAI_API_KEY;
  }

  if (provider === 'openai') {
    process.env.OPENAI_API_KEY = openAiKey;
    delete process.env.ANTHROPIC_API_KEY;
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

      const db = JSON.parse(await readFile(process.env.REPORTS_DB_FILE, 'utf-8'));
      expect(db.audit_logs).toHaveLength(2);
      expect(db.audit_logs.map((log) => log.action)).toEqual(['report_created', 'report_updated']);
      expect(db.audit_logs[0].actor).toBe('qa_tester');
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
});
