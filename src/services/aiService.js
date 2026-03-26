import { extraerJsonDeTexto } from '../utils/examUtils';

export const sugerirCalificacionIA = async ({ datos, puntaje }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch('/api/calificacion/sugerir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ datos, puntaje }),
      signal: controller.signal
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || 'Error inesperado al consultar el backend de IA.');

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
