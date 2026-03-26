import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

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

const loadServer = async ({
  provider = 'anthropic',
  timeoutMs = 20000,
  internalToken = 'test-internal-token',
  anthropicKey = 'anthropic-key',
  openAiKey = 'openai-key'
} = {}) => {
  process.env.NODE_ENV = 'test';
  process.env.AI_PROVIDER = provider;
  process.env.AI_REQUEST_TIMEOUT_MS = String(timeoutMs);
  process.env.INTERNAL_AUTH_TOKEN = internalToken;
  process.env.INTERNAL_AUTH_HEADER = 'x-internal-token';

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

const apiRequest = ({ baseUrl, path, method = 'GET', body, token = 'test-internal-token', headers = {} }) => new Promise((resolve, reject) => {
  const url = new URL(path, baseUrl);
  const req = http.request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-internal-token': token,
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
  beforeEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GET /api/calificacion/proveedor devuelve proveedor y modelo activos', async () => {
    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/proveedor'
      });

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

  it('POST /api/calificacion/sugerir normaliza contrato para Anthropic', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        content: [
          {
            type: 'text',
            text: 'Resultado:\n{"puntuacion_sugerida": 93.2, "justificacion_breve": "Buen dominio del tema."}'
          }
        ]
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = await loadServer({ provider: 'anthropic' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(200);
      expect(result.json).toEqual({
        puntuacion: '93.20',
        justificacion: 'Buen dominio del tema.',
        proveedor: 'anthropic',
        modelo: 'claude-sonnet-4-20250514'
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('POST /api/calificacion/sugerir normaliza contrato para OpenAI', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [
          {
            message: {
              content: '{"puntuacion_sugerida": 88, "justificacion_breve": "Puede reforzar asientos de ajuste."}'
            }
          }
        ]
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(200);
      expect(result.json).toEqual({
        puntuacion: '88.00',
        justificacion: 'Puede reforzar asientos de ajuste.',
        proveedor: 'openai',
        modelo: 'gpt-4o-mini'
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('retorna provider_config_error si falta API key del proveedor', async () => {
    const app = await loadServer({ provider: 'openai', openAiKey: '' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(500);
      expect(result.json.error.code).toBe('provider_config_error');
    } finally {
      await app.close();
    }
  });

  it('retorna provider_timeout si el proveedor excede timeout', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const app = await loadServer({ provider: 'anthropic', timeoutMs: 5 });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(504);
      expect(result.json.error.code).toBe('provider_timeout');
    } finally {
      await app.close();
    }
  });

  it('retorna provider_contract_error si la respuesta de IA no cumple contrato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        content: [
          {
            type: 'text',
            text: '{"puntuacion_sugerida": 140, "justificacion_breve": "Fuera de rango"}'
          }
        ]
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = await loadServer({ provider: 'anthropic' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(502);
      expect(result.json.error.code).toBe('provider_contract_error');
    } finally {
      await app.close();
    }
  });

  it('retorna payload_validation_error cuando payload es inválido', async () => {
    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: { puntaje: 'no-num' }
      });

      expect(result.status).toBe(400);
      expect(result.json.error.code).toBe('payload_validation_error');
      expect(typeof result.json.error.requestId).toBe('string');
      expect(result.headers['x-request-id']).toBe(result.json.error.requestId);
    } finally {
      await app.close();
    }
  });

  it('respeta X-Request-Id del cliente en respuestas de error', async () => {
    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        token: 'token-invalido',
        headers: {
          'x-request-id': 'req-cliente-123'
        },
        body: basePayload
      });

      expect(result.status).toBe(401);
      expect(result.json.error.code).toBe('internal_auth_unauthorized');
      expect(result.json.error.requestId).toBe('req-cliente-123');
      expect(result.headers['x-request-id']).toBe('req-cliente-123');
    } finally {
      await app.close();
    }
  });

  it('emite logs JSON sin datos sensibles y con eventos clave', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [
          {
            message: {
              content: '{"puntuacion_sugerida": 88, "justificacion_breve": "Buen análisis."}'
            }
          }
        ]
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const app = await loadServer({ provider: 'openai' });

    try {
      const result = await apiRequest({
        baseUrl: app.baseUrl,
        path: '/api/calificacion/sugerir',
        method: 'POST',
        body: basePayload
      });

      expect(result.status).toBe(200);
      const logs = stdoutSpy.mock.calls
        .map(([line]) => line)
        .filter((line) => typeof line === 'string' && line.trim().startsWith('{'))
        .map((line) => JSON.parse(line.trim()));

      expect(logs.some((entry) => entry.event === 'request_started')).toBe(true);
      const providerLog = logs.find((entry) => entry.event === 'provider_selected');
      expect(providerLog).toBeDefined();
      expect(providerLog.provider).toBe('openai');
      expect(providerLog.payloadMetadata).toMatchObject({
        hasDatos: true,
        hasPuntaje: true
      });
      expect(providerLog.payloadMetadata).not.toHaveProperty('datos');

      const completionLog = logs.find((entry) => entry.event === 'request_completed');
      expect(completionLog).toBeDefined();
      expect(completionLog.status).toBe(200);
      expect(typeof completionLog.durationMs).toBe('number');
    } finally {
      await app.close();
    }
  });
});
