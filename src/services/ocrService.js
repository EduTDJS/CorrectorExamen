import Tesseract from 'tesseract.js';
import { limpiarRespuestas, parsearOCRPorNumeroPregunta } from '../utils/examUtils';

const BYTES_MINIMOS_IMAGEN = 25 * 1024;
const BYTES_MAXIMOS_IMAGEN = 12 * 1024 * 1024;
const PIXELES_MINIMOS_ANCHO = 900;
const PIXELES_MINIMOS_ALTO = 1200;
const UMBRAL_RELACION_ASPECTO_PANORAMICA = 2.4;

const obtenerDimensionesImagen = (archivoImagen) => new Promise((resolve, reject) => {
  const imageUrl = URL.createObjectURL(archivoImagen);
  const imagen = new Image();

  imagen.onload = () => {
    resolve({
      width: imagen.naturalWidth,
      height: imagen.naturalHeight
    });
    URL.revokeObjectURL(imageUrl);
  };

  imagen.onerror = () => {
    URL.revokeObjectURL(imageUrl);
    reject(new Error('No se pudo leer la imagen. Intente tomar una foto nueva y volver a cargarla.'));
  };

  imagen.src = imageUrl;
});

const validarImagenAntesOCR = async (archivoImagen) => {
  if (!(archivoImagen instanceof File)) {
    throw new Error('No se recibió un archivo de imagen válido. Seleccione o capture una foto para continuar.');
  }

  if (!archivoImagen.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen. Use formato JPG, PNG o HEIC.');
  }

  if (archivoImagen.size < BYTES_MINIMOS_IMAGEN) {
    throw new Error('La imagen es demasiado pequeña y puede estar vacía. Tome una foto completa de la hoja.');
  }

  if (archivoImagen.size > BYTES_MAXIMOS_IMAGEN) {
    throw new Error('La imagen supera 12 MB. Reduzca la resolución o use una compresión antes de procesar.');
  }

  const { width, height } = await obtenerDimensionesImagen(archivoImagen);
  if (width < PIXELES_MINIMOS_ANCHO || height < PIXELES_MINIMOS_ALTO) {
    throw new Error(`Resolución insuficiente (${width}x${height}). Use al menos ${PIXELES_MINIMOS_ANCHO}x${PIXELES_MINIMOS_ALTO} píxeles para mejorar OCR.`);
  }

  const relacionAspecto = Math.max(width, height) / Math.max(1, Math.min(width, height));
  if (relacionAspecto > UMBRAL_RELACION_ASPECTO_PANORAMICA) {
    throw new Error('La foto parece muy recortada o en formato panorámico. Reencuadre para incluir toda la hoja en vertical.');
  }
};

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
  await validarImagenAntesOCR(archivoImagen);

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
    throw new Error('No se detectaron respuestas válidas. Verifique iluminación, enfoque y que cada número de pregunta sea visible.');
  }

  return { textoDetectado, respuestasParseadas };
};
