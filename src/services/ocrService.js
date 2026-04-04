import Tesseract from 'tesseract.js';
import { limpiarRespuestas, parsearOCRPorNumeroPregunta } from '../utils/examUtils';

const BYTES_MINIMOS_IMAGEN = 25 * 1024;
const BYTES_MAXIMOS_IMAGEN = 12 * 1024 * 1024;
const PIXELES_MINIMOS_ANCHO = 900;
const PIXELES_MINIMOS_ALTO = 1200;
const UMBRAL_RELACION_ASPECTO_PANORAMICA = 2.4;
const PREPROCESAR_OCR_ACTIVO = true;
const PREPROCESADO_USAR_ESCALA_GRISES = true;
const PREPROCESADO_FACTOR_CONTRASTE = 1.45;
const PREPROCESADO_UMBRAL_LOCAL_ACTIVO = true;
const PREPROCESADO_RADIO_UMBRAL_LOCAL = 10;
const PREPROCESADO_OFFSET_UMBRAL_LOCAL = -8;
const PREPROCESADO_USAR_DENOISE_MEDIANA = true;
const PREPROCESADO_USAR_DESKEW = false;
const PREPROCESADO_DESKEW_ANGULO_MAXIMO_GRADOS = 7;
const PREPROCESADO_TIPO_MIME_SALIDA = 'image/png';
const PREPROCESADO_CALIDAD_SALIDA = 0.95;

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

const clampColor = (valor) => Math.max(0, Math.min(255, valor));

const convertirEscalaGrisesYContraste = (pixeles, factorContraste) => {
  const resultado = new Uint8ClampedArray(pixeles.length);
  for (let i = 0; i < pixeles.length; i += 4) {
    const r = pixeles[i];
    const g = pixeles[i + 1];
    const b = pixeles[i + 2];
    const gris = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const ajustado = clampColor((gris - 128) * factorContraste + 128);
    resultado[i] = ajustado;
    resultado[i + 1] = ajustado;
    resultado[i + 2] = ajustado;
    resultado[i + 3] = pixeles[i + 3];
  }
  return resultado;
};

const aplicarMediana3x3 = (pixeles, ancho, alto) => {
  const resultado = new Uint8ClampedArray(pixeles);
  const vecinos = new Array(9);
  for (let y = 1; y < alto - 1; y += 1) {
    for (let x = 1; x < ancho - 1; x += 1) {
      let idx = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const base = ((y + ky) * ancho + (x + kx)) * 4;
          vecinos[idx] = pixeles[base];
          idx += 1;
        }
      }
      vecinos.sort((a, b) => a - b);
      const mediana = vecinos[4];
      const actual = (y * ancho + x) * 4;
      resultado[actual] = mediana;
      resultado[actual + 1] = mediana;
      resultado[actual + 2] = mediana;
    }
  }
  return resultado;
};

const aplicarUmbralLocal = (pixeles, ancho, alto, radio, offset) => {
  const salida = new Uint8ClampedArray(pixeles.length);
  for (let y = 0; y < alto; y += 1) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(alto - 1, y + radio);
    for (let x = 0; x < ancho; x += 1) {
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(ancho - 1, x + radio);
      let suma = 0;
      let total = 0;
      for (let wy = y0; wy <= y1; wy += 1) {
        for (let wx = x0; wx <= x1; wx += 1) {
          suma += pixeles[(wy * ancho + wx) * 4];
          total += 1;
        }
      }
      const umbral = (suma / Math.max(1, total)) + offset;
      const idx = (y * ancho + x) * 4;
      const binario = pixeles[idx] < umbral ? 0 : 255;
      salida[idx] = binario;
      salida[idx + 1] = binario;
      salida[idx + 2] = binario;
      salida[idx + 3] = 255;
    }
  }
  return salida;
};

const calcularAnguloInclinacion = (pixeles, ancho, alto) => {
  let sumaX = 0;
  let sumaY = 0;
  let cuenta = 0;

  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const valor = pixeles[(y * ancho + x) * 4];
      if (valor < 80) {
        sumaX += x;
        sumaY += y;
        cuenta += 1;
      }
    }
  }

  if (cuenta < 100) {
    return 0;
  }

  const cx = sumaX / cuenta;
  const cy = sumaY / cuenta;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;

  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const valor = pixeles[(y * ancho + x) * 4];
      if (valor < 80) {
        const dx = x - cx;
        const dy = y - cy;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
      }
    }
  }

  const angulo = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return Number.isFinite(angulo) ? angulo : 0;
};

const rotarCanvas = (canvasOrigen, anguloRadianes) => {
  if (!anguloRadianes) {
    return canvasOrigen;
  }

  const ancho = canvasOrigen.width;
  const alto = canvasOrigen.height;
  const canvasRotado = document.createElement('canvas');
  canvasRotado.width = ancho;
  canvasRotado.height = alto;
  const contexto = canvasRotado.getContext('2d', { willReadFrequently: true });
  if (!contexto) {
    throw new Error('No se pudo crear contexto 2D para deskew.');
  }

  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, ancho, alto);
  contexto.translate(ancho / 2, alto / 2);
  contexto.rotate(-anguloRadianes);
  contexto.drawImage(canvasOrigen, -ancho / 2, -alto / 2);
  return canvasRotado;
};

const canvasToBlob = (canvas, tipo, calidad) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('No se pudo generar imagen preprocesada.'));
      return;
    }
    resolve(blob);
  }, tipo, calidad);
});

export const preprocesarImagenParaOCR = async (archivoImagen) => {
  const imageUrl = URL.createObjectURL(archivoImagen);
  try {
    const imagen = await new Promise((resolve, reject) => {
      const recurso = new Image();
      recurso.onload = () => resolve(recurso);
      recurso.onerror = () => reject(new Error('No se pudo cargar la imagen para preprocesamiento OCR.'));
      recurso.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = imagen.naturalWidth || imagen.width;
    canvas.height = imagen.naturalHeight || imagen.height;
    const contexto = canvas.getContext('2d', { willReadFrequently: true });
    if (!contexto) {
      throw new Error('No se pudo crear el contexto de preprocesamiento OCR.');
    }

    contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    const imageData = contexto.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;

    let procesados = PREPROCESADO_USAR_ESCALA_GRISES
      ? convertirEscalaGrisesYContraste(data, PREPROCESADO_FACTOR_CONTRASTE)
      : new Uint8ClampedArray(data);

    if (PREPROCESADO_USAR_DENOISE_MEDIANA) {
      procesados = aplicarMediana3x3(procesados, canvas.width, canvas.height);
    }

    if (PREPROCESADO_UMBRAL_LOCAL_ACTIVO) {
      procesados = aplicarUmbralLocal(
        procesados,
        canvas.width,
        canvas.height,
        PREPROCESADO_RADIO_UMBRAL_LOCAL,
        PREPROCESADO_OFFSET_UMBRAL_LOCAL
      );
    }

    imageData.data.set(procesados);
    contexto.putImageData(imageData, 0, 0);

    let canvasFinal = canvas;
    if (PREPROCESADO_USAR_DESKEW) {
      const angulo = calcularAnguloInclinacion(procesados, canvas.width, canvas.height);
      const maximo = (Math.PI / 180) * PREPROCESADO_DESKEW_ANGULO_MAXIMO_GRADOS;
      if (Math.abs(angulo) <= maximo) {
        canvasFinal = rotarCanvas(canvas, angulo);
      }
    }

    const blobPreprocesado = await canvasToBlob(
      canvasFinal,
      PREPROCESADO_TIPO_MIME_SALIDA,
      PREPROCESADO_CALIDAD_SALIDA
    );

    return new File([blobPreprocesado], `ocr-preprocesada-${archivoImagen.name || 'imagen'}.png`, {
      type: PREPROCESADO_TIPO_MIME_SALIDA
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

export const procesarImagenOCR = async ({ archivoImagen, totalPreguntas, onProgress }) => {
  await validarImagenAntesOCR(archivoImagen);

  let entradaOCR = archivoImagen;
  if (PREPROCESAR_OCR_ACTIVO) {
    try {
      entradaOCR = await preprocesarImagenParaOCR(archivoImagen);
    } catch {
      entradaOCR = archivoImagen;
    }
  }

  const resultado = await Tesseract.recognize(entradaOCR, 'spa+eng', {
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
