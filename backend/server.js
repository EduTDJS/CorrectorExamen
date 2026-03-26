import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

const sendJson = (res, statusCode, body) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(body));
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

const handler = async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/calificacion/sugerir') {
    if (!ANTHROPIC_API_KEY) {
      sendJson(res, 500, { error: { message: 'ANTHROPIC_API_KEY no está configurada en el servidor.' } });
      return;
    }

    try {
      const payload = await parseBody(req);
      const { datos, puntaje } = payload;

      if (!datos || typeof datos !== 'object') {
        sendJson(res, 400, { error: { message: 'El campo "datos" es obligatorio.' } });
        return;
      }

      if (!Number.isFinite(Number(puntaje))) {
        sendJson(res, 400, { error: { message: 'El campo "puntaje" debe ser numérico.' } });
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      try {
        const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 250,
            temperature: 0.2,
            messages: [{ role: 'user', content: buildPrompt({ datos, puntaje }) }]
          }),
          signal: controller.signal
        });

        const data = await anthropicResponse.json();

        if (!anthropicResponse.ok) {
          sendJson(res, anthropicResponse.status, {
            error: { message: data?.error?.message || 'Error inesperado al consultar Anthropic.' }
          });
          return;
        }

        sendJson(res, 200, data);
      } catch (error) {
        if (error?.name === 'AbortError') {
          sendJson(res, 504, { error: { message: 'La solicitud al proveedor excedió el tiempo límite (20s).' } });
          return;
        }

        sendJson(res, 502, { error: { message: error?.message || 'No se pudo consultar Anthropic.' } });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      sendJson(res, 400, { error: { message: error?.message || 'No se pudo procesar la solicitud.' } });
    }

    return;
  }

  sendJson(res, 404, { error: { message: 'Ruta no encontrada.' } });
};

const server = http.createServer((req, res) => {
  handler(req, res);
});

server.listen(PORT, () => {
  console.log(`Backend de CorrectorExamen escuchando en http://localhost:${PORT}`);
});
