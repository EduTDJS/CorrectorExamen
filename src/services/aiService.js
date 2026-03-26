import { extraerJsonDeTexto } from '../utils/examUtils';

export const sugerirCalificacionIA = async ({ apiKey, datos, puntaje }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const prompt = [
      'Eres una profesora experta en contabilidad y evaluación formativa.',
      `Materia: ${datos.materia}`,
      `Grupo: ${datos.grupo}`,
      `Fecha: ${datos.fecha}`,
      `Total de preguntas: ${datos.totalPreguntas}`,
      `Puntaje automático actual: ${puntaje.toFixed(2)} / 100`,
      'Responde SOLO JSON: {"puntuacion_sugerida": number, "justificacion_breve": "texto"}'
    ].join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 250,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || 'Error inesperado al consultar Anthropic.');

    const textoIa = (data?.content || [])
      .filter((bloque) => bloque?.type === 'text')
      .map((bloque) => bloque.text)
      .join('\n');

    const jsonParseado = extraerJsonDeTexto(textoIa);
    const puntuacionNormalizada = Number(jsonParseado.puntuacion_sugerida);

    if (Number.isNaN(puntuacionNormalizada) || puntuacionNormalizada < 0 || puntuacionNormalizada > 100) {
      throw new Error('La IA devolvió una puntuación fuera de rango (0-100).');
    }

    return {
      puntuacion: puntuacionNormalizada.toFixed(2),
      justificacion: String(jsonParseado.justificacion_breve || '').trim()
    };
  } finally {
    clearTimeout(timeoutId);
  }
};
