import { convertirTextoALista, limpiarRespuestas } from '../utils/examUtils';
import { strFromU8, unzipSync } from 'fflate';

export const IMPORT_LIMITS = {
  maxRows: 200,
  maxFileSizeBytes: 2 * 1024 * 1024,
  supportedExtensions: ['csv', 'xls', 'xlsx']
};

const REQUIRED_FIELDS = ['estudianteNombre', 'estudianteMatricula', 'respuestas'];

const FIELD_ALIASES = {
  nombre: 'estudianteNombre',
  estudiante: 'estudianteNombre',
  estudiante_nombre: 'estudianteNombre',
  estudiantenombre: 'estudianteNombre',
  matricula: 'estudianteMatricula',
  matrícula: 'estudianteMatricula',
  estudiante_matricula: 'estudianteMatricula',
  estudiantematricula: 'estudianteMatricula',
  respuestas: 'respuestas',
  respuesta: 'respuestas',
  respuestas_estudiante: 'respuestas'
};

const normalizarHeader = (header = '') => header.toString().trim().toLowerCase();

const mapearHeaders = (headers = []) => headers.reduce((acc, header) => {
  const limpio = normalizarHeader(header);
  const canonico = FIELD_ALIASES[limpio] || limpio;
  acc[header] = canonico;
  return acc;
}, {});

const parseCsvLine = (line = '') => {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
};

const parseCsvText = (csvText = '') => {
  const lines = String(csvText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const columns = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = columns[index] || '';
      return row;
    }, {});
  });
};

const obtenerExtension = (filename = '') => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.at(-1).toLowerCase() : '';
};

const validarSchema = (registro, totalPreguntas, indiceFila) => {
  const errores = [];
  REQUIRED_FIELDS.forEach((field) => {
    if (!String(registro[field] || '').trim()) {
      errores.push(`Campo obligatorio ausente: ${field}`);
    }
  });

  const respuestasLimpias = limpiarRespuestas(registro.respuestas || '');
  if (!respuestasLimpias) {
    errores.push('No se detectaron respuestas válidas (A/B/C/D).');
  }

  if (Number(totalPreguntas) > 0 && respuestasLimpias.length !== Number(totalPreguntas)) {
    errores.push(`El largo de respuestas (${respuestasLimpias.length}) no coincide con totalPreguntas (${totalPreguntas}).`);
  }

  return {
    fila: indiceFila,
    esValido: errores.length === 0,
    errores,
    respuestasLimpias
  };
};

export const validarArchivoImportacion = (file) => {
  if (!file) {
    throw new Error('Debe seleccionar un archivo para importar.');
  }

  if (file.size > IMPORT_LIMITS.maxFileSizeBytes) {
    throw new Error(`Archivo excede el tamaño máximo de ${Math.round(IMPORT_LIMITS.maxFileSizeBytes / (1024 * 1024))}MB.`);
  }

  const extension = obtenerExtension(file.name);
  if (!IMPORT_LIMITS.supportedExtensions.includes(extension)) {
    throw new Error('Formato no soportado. Use CSV UTF-8 (.csv) o Excel (.xls/.xlsx).');
  }

  return extension;
};

const leerComoTexto = (file) => new Promise((resolve, reject) => {
  if (typeof file?.text === 'function') {
    file.text().then(resolve).catch(reject);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  reader.readAsText(file);
});

const leerComoArrayBuffer = (file) => new Promise((resolve, reject) => {
  if (typeof file?.arrayBuffer === 'function') {
    file.arrayBuffer().then(resolve).catch(reject);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  reader.readAsArrayBuffer(file);
});

const indiceColumna = (referencia = '') => {
  const letras = String(referencia).match(/[A-Z]+/i)?.[0]?.toUpperCase() || '';
  if (!letras) {
    return -1;
  }

  return letras.split('').reduce((acc, char) => (acc * 26) + (char.charCodeAt(0) - 64), 0) - 1;
};

const decodeXml = (value = '') => String(value)
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&apos;', '\'')
  .replaceAll('&amp;', '&');

const extraerFilasXml = (xml = '', rowTag = 'row') => {
  const regex = new RegExp(`<${rowTag}\\b[^>]*>([\\s\\S]*?)<\\/${rowTag}>`, 'gi');
  return Array.from(String(xml).matchAll(regex), (match) => match[0]);
};

const parseXlsxRows = (sheetXmlText, sharedStrings = []) => {
  const rows = extraerFilasXml(sheetXmlText, 'row');
  return rows.map((rowText) => {
    const row = [];
    const celdas = Array.from(String(rowText).matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi));

    celdas.forEach((cellMatch, idx) => {
      const attrs = cellMatch[1] || '';
      const body = cellMatch[2] || '';
      const ref = attrs.match(/\br="([^"]+)"/i)?.[1] || '';
      const col = indiceColumna(ref);
      const destino = col >= 0 ? col : idx;
      const tipo = attrs.match(/\bt="([^"]+)"/i)?.[1] || '';
      const inline = body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/i)?.[1];
      const valor = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1];
      let value = '';

      if (tipo === 's' && typeof valor !== 'undefined') {
        value = sharedStrings[Number(valor)] || '';
      } else if (typeof inline !== 'undefined') {
        value = decodeXml(inline.trim());
      } else if (typeof valor !== 'undefined') {
        value = decodeXml(valor.trim());
      }

      row[destino] = value;
    });

    return row;
  });
};

const parseSpreadsheetXmlRows = (spreadsheetXmlText = '') => {
  const rows = extraerFilasXml(spreadsheetXmlText, 'Row');
  return rows.map((rowText) => {
    const cells = Array.from(String(rowText).matchAll(/<Cell\b[^>]*>([\s\S]*?)<\/Cell>/gi));
    return cells.map((cellMatch) => {
      const data = cellMatch[1]?.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i)?.[1] || '';
      return decodeXml(data.trim());
    });
  });
};

const rowsToObjects = (rows = []) => {
  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((item) => String(item || '').trim());
  return rows
    .slice(1)
    .filter((row) => row.some((value) => String(value || '').trim()))
    .map((row) => headers.reduce((acc, header, index) => {
      acc[header] = String(row[index] || '').trim();
      return acc;
    }, {}));
};

const parseExcelTextXml = (xmlText = '') => {
  if (!String(xmlText).includes('<Workbook')) {
    throw new Error('No se pudo interpretar el archivo Excel.');
  }

  return rowsToObjects(parseSpreadsheetXmlRows(xmlText));
};

const parseExcelBinary = async (file) => {
  const raw = await leerComoArrayBuffer(file);
  const zip = unzipSync(new Uint8Array(raw));
  const keys = Object.keys(zip);
  const sheetKey = keys.find((key) => /(?:^|\/|\\)xl(?:\/|\\)worksheets(?:\/|\\)sheet\d+\.xml$/i.test(key))
    || keys.find((key) => /sheet1\.xml$/i.test(key));
  const sheetFile = sheetKey ? zip[sheetKey] : null;

  if (!sheetFile) {
    throw new Error('Archivo Excel inválido: faltan hojas de cálculo.');
  }

  const sheetXmlText = strFromU8(sheetFile);
  if (!sheetXmlText.includes('<worksheet')) {
    throw new Error('No se pudo interpretar el archivo Excel.');
  }

  const sharedStringsKey = keys.find((key) => key.endsWith('xl/sharedStrings.xml'));
  const sharedStringsFile = sharedStringsKey ? zip[sharedStringsKey] : null;
  let sharedStrings = [];

  if (sharedStringsFile) {
    const sharedXmlText = strFromU8(sharedStringsFile);
    sharedStrings = Array.from(sharedXmlText.matchAll(/<si\b[^>]*>[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/si>/gi))
      .map((match) => decodeXml((match[1] || '').trim()));
  }

  return rowsToObjects(parseXlsxRows(sheetXmlText, sharedStrings));
};

const parseByExtension = async (file, extension) => {
  if (extension === 'csv') {
    const text = await leerComoTexto(file);
    return parseCsvText(text);
  }

  if (['xlsx', 'xls'].includes(extension)) {
    try {
      if (extension === 'xlsx') {
        try {
          return await parseExcelBinary(file);
        } catch {
          const text = await leerComoTexto(file);
          return parseExcelTextXml(text);
        }
      }
      const text = await leerComoTexto(file);
      return parseExcelTextXml(text);
    } catch {
      throw new Error('No se pudo leer el archivo Excel. Verifique que no esté dañado y conserve el formato .xls/.xlsx.');
    }
  }

  throw new Error('Formato no soportado. Use CSV UTF-8 (.csv) o Excel (.xls/.xlsx).');
};

export const parsearArchivoImportacion = async ({ file, totalPreguntas }) => {
  const extension = validarArchivoImportacion(file);

  const rawRows = await parseByExtension(file, extension);

  if (rawRows.length > IMPORT_LIMITS.maxRows) {
    throw new Error(`El archivo supera el límite de ${IMPORT_LIMITS.maxRows} registros.`);
  }

  const headersMap = mapearHeaders(Object.keys(rawRows[0] || {}));
  const filas = [];
  const errores = [];
  const duplicados = [];
  const seenMatriculas = new Map();

  rawRows.forEach((row, index) => {
    const fila = index + 2;
    const canonico = Object.entries(row).reduce((acc, [key, value]) => {
      acc[headersMap[key] || key] = typeof value === 'string' ? value.trim() : value;
      return acc;
    }, {});

    const validacion = validarSchema(canonico, totalPreguntas, fila);

    if (!validacion.esValido) {
      errores.push({
        fila,
        matricula: canonico.estudianteMatricula || '',
        errores: validacion.errores
      });
      return;
    }

    if (seenMatriculas.has(canonico.estudianteMatricula)) {
      duplicados.push({
        matricula: canonico.estudianteMatricula,
        filaOriginal: seenMatriculas.get(canonico.estudianteMatricula),
        filaDuplicada: fila
      });
    }
    seenMatriculas.set(canonico.estudianteMatricula, fila);

    filas.push({
      fila,
      estudianteNombre: canonico.estudianteNombre,
      estudianteMatricula: canonico.estudianteMatricula,
      respuestasTexto: validacion.respuestasLimpias,
      respuestasLista: convertirTextoALista(validacion.respuestasLimpias, totalPreguntas, { fuenteLinea: `Importación fila ${fila}` })
    });
  });

  const filasSinDuplicados = filas.reduce((acc, fila) => {
    const ultimo = acc.findIndex((item) => item.estudianteMatricula === fila.estudianteMatricula);
    if (ultimo >= 0) {
      acc[ultimo] = fila;
      return acc;
    }
    acc.push(fila);
    return acc;
  }, []);

  return {
    filas: filasSinDuplicados,
    errores,
    duplicados,
    resumen: {
      totalLeidas: rawRows.length,
      totalValidas: filasSinDuplicados.length,
      totalErrores: errores.length,
      totalDuplicados: duplicados.length
    },
    contrato: {
      obligatorios: REQUIRED_FIELDS,
      normalizacionRespuestas: 'Se aceptan caracteres A/B/C/D y variantes OCR comunes (4->A, 8->B, (->C, 0/O/Q->D).',
      politicaDuplicados: 'Si se repite matrícula, se conserva el último registro válido del archivo.'
    }
  };
};
