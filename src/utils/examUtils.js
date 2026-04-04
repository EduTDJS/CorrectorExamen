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

const regexVentanaNumeroRespuesta = /^(?:p(?:reg|regunta)?\s*)?0*(\d{1,3})\s*[\]\[.)\-:]*\s*([ABCD480QO(])$/i;

const tokenizarLineaOCR = (texto = '') => {
  const normalizado = String(texto)
    .replace(/([)\].,:;\-])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizado ? normalizado.split(' ') : [];
};

const obtenerNumeroDesdeToken = (tokens = [], indice = 0) => {
  const token = (tokens[indice] || '').toUpperCase();
  if (!token) return null;

  const numeroSimple = token.match(/^0*(\d{1,3})[.)]?$/);
  if (numeroSimple) return Number(numeroSimple[1]);

  const numeroPrefijoP = token.match(/^P0*(\d{1,3})$/);
  if (numeroPrefijoP) return Number(numeroPrefijoP[1]);

  const numeroPregInline = token.match(/^PREG(?:UNTA)?0*(\d{1,3})$/);
  if (numeroPregInline) return Number(numeroPregInline[1]);

  if (/^PREG(?:UNTA)?$/.test(token) || token === 'P') {
    const siguiente = (tokens[indice + 1] || '').match(/^0*(\d{1,3})[.)]?$/);
    if (siguiente) return Number(siguiente[1]);
  }

  return null;
};

const obtenerPuntajeConfianza = (confianza) => (typeof confianza === 'number' ? confianza : Number.NEGATIVE_INFINITY);

const debeReemplazarRespuesta = (actual, candidata) => {
  if (!actual) return true;
  const scoreActual = obtenerPuntajeConfianza(actual.confianza);
  const scoreCandidata = obtenerPuntajeConfianza(candidata.confianza);
  if (scoreCandidata > scoreActual) return true;
  if (scoreCandidata < scoreActual) return false;
  return candidata.orden >= actual.orden;
};

export const parsearOCRPorNumeroPregunta = (textoOCR, totalPreguntas, opciones = {}) => {
  const total = Number(totalPreguntas);
  const lineasOCR = opciones.lineasOCR
    || textoOCR.split('\n').map((texto, indice) => ({
      text: texto.trim(),
      confidence: null,
      source: `Línea ${indice + 1}`
    }));

  const respuestasPorIndice = {};
  let ordenGlobal = 0;

  const registrarCandidata = (indice, respuesta, linea, indiceLinea, prioridad = 1) => {
    if (!respuesta) return;
    if (!Number.isInteger(indice) || indice < 0) return;
    if (total > 0 && indice >= total) return;

    const candidata = {
      ...crearRespuestaEnriquecida(
        respuesta,
        typeof linea.confidence === 'number' ? Number(linea.confidence * prioridad) : null,
        linea.source || `Línea ${indiceLinea + 1}`
      ),
      orden: ordenGlobal++
    };

    if (debeReemplazarRespuesta(respuestasPorIndice[indice], candidata)) {
      respuestasPorIndice[indice] = candidata;
    }
  };

  lineasOCR.forEach((linea, indiceLinea) => {
    const texto = (linea.text || '').trim();
    if (!texto) return;

    const coincidencia = texto.match(regexLineaNumeroRespuesta);
    if (coincidencia) {
      const indice = Number(coincidencia[1]) - 1;
      const respuesta = normalizarCaracterRespuesta(coincidencia[2]);
      registrarCandidata(indice, respuesta, linea, indiceLinea, 1);
      return;
    }

    const tokens = tokenizarLineaOCR(texto);
    if (tokens.length < 2) return;

    const secuenciaLinea = [];
    const usados = new Set();

    for (let i = 0; i < tokens.length; i += 1) {
      const numeroPregunta = obtenerNumeroDesdeToken(tokens, i);
      if (!Number.isInteger(numeroPregunta) || numeroPregunta <= 0) continue;
      if (total > 0 && numeroPregunta > total) continue;

      const indicePregunta = numeroPregunta - 1;
      const vecinos = [i + 1, i + 2, i - 1].filter((pos) => pos >= 0 && pos < tokens.length);
      let respuestaDetectada = '';
      let posicionRespuesta = -1;
      for (const pos of vecinos) {
        const candidata = normalizarCaracterRespuesta(tokens[pos]);
        if (candidata) {
          respuestaDetectada = candidata;
          posicionRespuesta = pos;
          break;
        }
      }
      if (!respuestaDetectada) continue;

      // Guardrail: evitar secuencias implausibles por ruido (saltos bruscos dentro de la misma línea).
      const ultimo = secuenciaLinea[secuenciaLinea.length - 1];
      if (typeof ultimo === 'number' && numeroPregunta < ultimo - 1) continue;

      secuenciaLinea.push(numeroPregunta);
      usados.add(`${indicePregunta}:${posicionRespuesta}`);
      registrarCandidata(indicePregunta, respuestaDetectada, linea, indiceLinea, 0.95);
    }

    for (let ventana = 2; ventana <= 5; ventana += 1) {
      for (let inicio = 0; inicio + ventana <= tokens.length; inicio += 1) {
        const textoVentana = tokens.slice(inicio, inicio + ventana).join(' ');
        const encontrada = textoVentana.match(regexVentanaNumeroRespuesta);
        if (!encontrada) continue;

        const numeroPregunta = Number(encontrada[1]);
        if (!Number.isInteger(numeroPregunta) || numeroPregunta <= 0) continue;
        if (total > 0 && numeroPregunta > total) continue;

        const indicePregunta = numeroPregunta - 1;
        const respuesta = normalizarCaracterRespuesta(encontrada[2]);
        if (!respuesta) continue;

        const llave = `${indicePregunta}:${inicio}`;
        if (usados.has(llave)) continue;
        usados.add(llave);
        registrarCandidata(indicePregunta, respuesta, linea, indiceLinea, 0.9);
      }
    }
  });

  if (Object.keys(respuestasPorIndice).length > 0) {
    const longitud = total > 0 ? total : Math.max(...Object.keys(respuestasPorIndice).map(Number)) + 1;
    return Array.from({ length: longitud }, (_, indice) => {
      const item = respuestasPorIndice[indice];
      if (!item) return crearRespuestaEnriquecida();
      return crearRespuestaEnriquecida(item.respuesta, item.confianza, item.fuenteLinea);
    });
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
