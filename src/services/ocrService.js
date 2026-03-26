import Tesseract from 'tesseract.js';
import { limpiarRespuestas, parsearOCRPorNumeroPregunta } from '../utils/examUtils';

const construirLineasOCR = (data = {}) => {
  const lineas = Array.isArray(data.lines) ? data.lines : [];
  if (lineas.length > 0) {
    return lineas.map((linea, indice) => ({
      text: linea.text || '',
      confidence: typeof linea.confidence === 'number' ? linea.confidence : null,
      source: `Línea ${indice + 1}`
    }));
  }

  const palabras = Array.isArray(data.words) ? data.words : [];
  if (palabras.length > 0) {
    return palabras.map((palabra, indice) => ({
      text: palabra.text || '',
      confidence: typeof palabra.confidence === 'number' ? palabra.confidence : null,
      source: `Token ${indice + 1}`
    }));
  }

  return [];
};

export const procesarImagenOCR = async ({ archivoImagen, totalPreguntas, onProgress }) => {
  const resultado = await Tesseract.recognize(archivoImagen, 'spa+eng', {
    logger: (mensaje) => {
      if (mensaje.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((mensaje.progress || 0) * 100));
      }
    }
  });

  const textoDetectado = resultado.data?.text || '';
  const lineasOCR = construirLineasOCR(resultado.data);
  const respuestasParseadas = parsearOCRPorNumeroPregunta(textoDetectado, totalPreguntas, { lineasOCR });

  if (!limpiarRespuestas(respuestasParseadas)) {
    throw new Error('No se detectaron respuestas válidas. Verifique que la imagen sea legible.');
  }

  return { textoDetectado, respuestasParseadas };
};
