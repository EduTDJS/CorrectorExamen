export const letrasValidas = ['A', 'B', 'C', 'D'];

const mapaCaracteresConfusos = {
  '4': 'A',
  '8': 'B',
  '(': 'C',
  '0': 'D',
  O: 'D',
  Q: 'D'
};

export const crearRespuestaEnriquecida = (respuesta = '', confianza = null, fuenteLinea = '') => ({
  respuesta,
  confianza,
  fuenteLinea
});

const normalizarCaracterRespuesta = (caracter = '') => {
  const crudo = String(caracter).trim().toUpperCase();
  if (letrasValidas.includes(crudo)) return crudo;
  return mapaCaracteresConfusos[crudo] || '';
};

export const obtenerRespuestaTexto = (item) => {
  if (typeof item === 'string') return normalizarCaracterRespuesta(item);
  if (!item || typeof item !== 'object') return '';
  return normalizarCaracterRespuesta(item.respuesta);
};

export const limpiarRespuestas = (entrada = '') => {
  if (Array.isArray(entrada)) {
    return entrada.map((item) => obtenerRespuestaTexto(item)).join('');
  }

  return String(entrada)
    .toUpperCase()
    .split('')
    .map((char) => normalizarCaracterRespuesta(char))
    .join('');
};

export const convertirTextoALista = (texto, totalPreguntas, metadatos = {}) => {
  const letras = limpiarRespuestas(texto).split('');
  const total = Number(totalPreguntas);

  if (!total || total <= 0) {
    return letras.map((respuesta, indice) => crearRespuestaEnriquecida(
      respuesta,
      metadatos.confianza ?? null,
      metadatos.fuenteLinea || `Manual ${indice + 1}`
    ));
  }

  return Array.from({ length: total }, (_, indice) => crearRespuestaEnriquecida(
    letras[indice] || '',
    metadatos.confianza ?? null,
    metadatos.fuenteLinea || (letras[indice] ? `Manual ${indice + 1}` : '')
  ));
};

const regexLineaNumeroRespuesta = /(?:^|\b)(?:p(?:regunta)?\s*)?0*(\d{1,3})\s*[\]\[.)\-:]*\s*([ABCD480QO(])/i;

export const parsearOCRPorNumeroPregunta = (textoOCR, totalPreguntas, opciones = {}) => {
  const total = Number(totalPreguntas);
  const lineasOCR = opciones.lineasOCR
    || textoOCR.split('\n').map((texto, indice) => ({
      text: texto.trim(),
      confidence: null,
      source: `Línea ${indice + 1}`
    }));

  const respuestasPorIndice = {};

  lineasOCR.forEach((linea, indiceLinea) => {
    const texto = (linea.text || '').trim();
    if (!texto) return;

    const coincidencia = texto.match(regexLineaNumeroRespuesta);
    if (!coincidencia) return;

    const indice = Number(coincidencia[1]) - 1;
    const respuesta = normalizarCaracterRespuesta(coincidencia[2]);

    if (!respuesta) return;
    if (!Number.isInteger(indice) || indice < 0 || (total > 0 && indice >= total)) return;

    respuestasPorIndice[indice] = crearRespuestaEnriquecida(
      respuesta,
      typeof linea.confidence === 'number' ? linea.confidence : null,
      linea.source || `Línea ${indiceLinea + 1}`
    );
  });

  if (Object.keys(respuestasPorIndice).length > 0) {
    const longitud = total > 0 ? total : Math.max(...Object.keys(respuestasPorIndice).map(Number)) + 1;
    return Array.from({ length: longitud }, (_, indice) => respuestasPorIndice[indice] || crearRespuestaEnriquecida());
  }

  const fallbackTexto = lineasOCR.map((linea) => linea.text || '').join(' ');
  return convertirTextoALista(fallbackTexto, total, {
    confianza: null,
    fuenteLinea: 'OCR sin numeración'
  });
};

export const extraerJsonDeTexto = (texto = '') => {
  const bloque = texto.match(/\{[\s\S]*\}/);
  if (!bloque) throw new Error('La IA respondió en un formato no válido.');
  return JSON.parse(bloque[0]);
};

export const mapearLetraPucmm = (nota) => {
  const n = Number(nota);
  if (n >= 90) return 'A';
  if (n >= 85) return 'B+';
  if (n >= 80) return 'B';
  if (n >= 75) return 'C+';
  if (n >= 70) return 'C';
  if (n >= 65) return 'D';
  return 'F';
};

export const escaparCsv = (valor) => {
  const texto = String(valor ?? '');
  if (/[,"\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
};
