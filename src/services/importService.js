import { convertirTextoALista, limpiarRespuestas } from '../utils/examUtils';

export const IMPORT_LIMITS = {
  maxRows: 200,
  maxFileSizeBytes: 2 * 1024 * 1024,
  supportedExtensions: ['csv']
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
    throw new Error('Formato no soportado. Use CSV UTF-8 (.csv).');
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

const parseByExtension = async (file, extension) => {
  const text = await leerComoTexto(file);
  if (extension === 'csv') {
    return parseCsvText(text);
  }

  throw new Error('Formato no soportado. Use CSV UTF-8 (.csv).');
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
