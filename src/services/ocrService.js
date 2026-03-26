import Tesseract from 'tesseract.js';
import { limpiarRespuestas, parsearOCRPorNumeroPregunta } from '../utils/examUtils';

export const procesarImagenOCR = async ({ archivoImagen, totalPreguntas, onProgress }) => {
  const resultado = await Tesseract.recognize(archivoImagen, 'spa+eng', {
    logger: (mensaje) => {
      if (mensaje.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((mensaje.progress || 0) * 100));
      }
    }
  });

  const textoDetectado = resultado.data?.text || '';
  const respuestasParseadas = parsearOCRPorNumeroPregunta(textoDetectado, totalPreguntas);

  if (!limpiarRespuestas(respuestasParseadas.join(''))) {
    throw new Error('No se detectaron respuestas válidas. Verifique que la imagen sea legible.');
  }

  return { textoDetectado, respuestasParseadas };
};
