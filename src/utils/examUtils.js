export const letrasValidas = ['A', 'B', 'C', 'D'];

export const limpiarRespuestas = (texto = '') => texto.toUpperCase().replace(/[^ABCD]/g, '');

export const convertirTextoALista = (texto, totalPreguntas) => {
  const letras = limpiarRespuestas(texto).split('');
  const total = Number(totalPreguntas);

  if (!total || total <= 0) return letras;

  const lista = Array(total).fill('');
  for (let i = 0; i < total; i += 1) {
    lista[i] = letras[i] || '';
  }

  return lista;
};

export const parsearOCRPorNumeroPregunta = (textoOCR, totalPreguntas) => {
  const total = Number(totalPreguntas);
  const lineas = textoOCR
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean);

  const respuestasPorIndice = {};

  lineas.forEach((linea) => {
    const coincidencia = linea.match(/(?:pregunta\s*)?(\d{1,3})\s*[:.)-]?\s*([ABCD])/i);
    if (!coincidencia) return;

    const indice = Number(coincidencia[1]) - 1;
    const respuesta = coincidencia[2].toUpperCase();

    if (Number.isInteger(indice) && indice >= 0 && (!total || indice < total)) {
      respuestasPorIndice[indice] = respuesta;
    }
  });

  if (Object.keys(respuestasPorIndice).length > 0) {
    const longitud = total > 0 ? total : Math.max(...Object.keys(respuestasPorIndice).map(Number)) + 1;
    return Array.from({ length: longitud }, (_, indice) => respuestasPorIndice[indice] || '');
  }

  return convertirTextoALista(textoOCR, total);
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
