import { normalizarDesglosePregunta } from '../utils/questionBreakdown';
import { buildAuthHeaders } from './sessionService';

export const STORAGE_DECISION_FINAL = 'corrector_decision_final';
export const STORAGE_REPORTES = 'corrector_historial_reportes_v1';
export const STORAGE_OPERACIONES_IMPORTACION = 'corrector_operaciones_importacion_v1';

const SCHEMA_VERSION_REPORTES = 4;
const SCHEMA_VERSION_DECISION_FINAL = 2;
const SCHEMA_VERSION_OPERACIONES_IMPORTACION = 1;

const decisionFinalInicial = {
  puntuacion: '',
  justificacion: ''
};

const esObjeto = (valor) => typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const normalizarTextoBase = (valor) => String(valor || '').trim().replace(/\s+/g, ' ');
const removerDiacriticos = (valor) => valor.normalize('NFD').replace(/\p{Diacritic}/gu, '');

export const normalizarNombreMateria = (materia) => removerDiacriticos(normalizarTextoBase(materia)).toLowerCase();
export const crearMateriaFolderId = (materiaNormalizada) => `materia:${materiaNormalizada || 'sin-definir'}`;

const esDecisionFinalValida = (valor) => esObjeto(valor)
  && (typeof valor.puntuacion === 'string' || typeof valor.puntuacion === 'number')
  && typeof valor.justificacion === 'string';

const repararDecisionFinal = (valor) => {
  if (!esObjeto(valor)) return null;

  const puntuacion = valor.puntuacion;
  const justificacion = valor.justificacion;

  if (
    (typeof puntuacion !== 'string' && typeof puntuacion !== 'number')
    || typeof justificacion !== 'string'
  ) {
    return null;
  }

  return {
    puntuacion: String(puntuacion),
    justificacion
  };
};

const extraerDecisionFinalVersionada = (valor) => {
  if (!esObjeto(valor)) return null;

  if (typeof valor.schemaVersion === 'number' && 'data' in valor) {
    return { schemaVersion: valor.schemaVersion, data: valor.data };
  }

  return { schemaVersion: 1, data: valor };
};

const migrarDecisionFinal = (versionInicial, dataInicial) => {
  let version = versionInicial;
  let data = dataInicial;

  while (version < SCHEMA_VERSION_DECISION_FINAL) {
    if (version === 1) {
      data = repararDecisionFinal(data);
      version = 2;
      continue;
    }

    return null;
  }

  if (!esDecisionFinalValida(data)) {
    data = repararDecisionFinal(data);
  }

  if (!esDecisionFinalValida(data)) return null;

  return {
    schemaVersion: SCHEMA_VERSION_DECISION_FINAL,
    data
  };
};

const esReporteValido = (reporte) => esObjeto(reporte)
  && typeof reporte.id === 'string'
  && typeof reporte.creadoEn === 'string'
  && esObjeto(reporte.examen)
  && typeof reporte.examen.materia === 'string'
  && typeof reporte.examen.grupo === 'string'
  && typeof reporte.examen.fecha === 'string'
  && typeof reporte.examen.totalPreguntas === 'number'
  && typeof reporte.examen.claveRespuestas === 'string'
  && esObjeto(reporte.estudiante)
  && typeof reporte.estudiante.nombre === 'string'
  && typeof reporte.estudiante.matricula === 'string'
  && esObjeto(reporte.respuestas)
  && Array.isArray(reporte.respuestas.lista)
  && typeof reporte.respuestas.texto === 'string'
  && Array.isArray(reporte.puntuacionPorPregunta)
  && Array.isArray(reporte.justificacionesIA)
  && esObjeto(reporte.calificacionFinal)
  && typeof reporte.calificacionFinal.notaSobre100 === 'number'
  && typeof reporte.calificacionFinal.letra === 'string'
  && typeof reporte.calificacionFinal.justificacionDocente === 'string'
  && esObjeto(reporte.organizacion)
  && typeof reporte.organizacion.materiaNormalizada === 'string'
  && typeof reporte.organizacion.materiaFolderId === 'string';

const repararReporte = (reporte) => {
  if (!esObjeto(reporte)) return null;

  const base = {
    ...reporte,
    id: typeof reporte.id === 'string' ? reporte.id : null,
    creadoEn: typeof reporte.creadoEn === 'string' ? reporte.creadoEn : null,
    examen: esObjeto(reporte.examen) ? reporte.examen : null,
    estudiante: esObjeto(reporte.estudiante) ? reporte.estudiante : null,
    respuestas: esObjeto(reporte.respuestas) ? reporte.respuestas : null,
    puntuacionPorPregunta: Array.isArray(reporte.puntuacionPorPregunta) ? reporte.puntuacionPorPregunta : [],
    justificacionesIA: Array.isArray(reporte.justificacionesIA) ? reporte.justificacionesIA : null,
    calificacionFinal: esObjeto(reporte.calificacionFinal) ? reporte.calificacionFinal : null
  };

  if (
    !base.id
    || !base.creadoEn
    || !base.examen
    || !base.estudiante
    || !base.respuestas
    || !base.calificacionFinal
  ) {
    return null;
  }

  const puntuacionPorPregunta = base.puntuacionPorPregunta
    .map((pregunta, indice) => {
      if (!esObjeto(pregunta)) return null;
      return {
        ...pregunta,
        numero: typeof pregunta.numero === 'number' ? pregunta.numero : indice + 1,
        desglose: normalizarDesglosePregunta(pregunta.desglose || {})
      };
    })
    .filter(Boolean);

  const justificacionesIA = base.justificacionesIA
    || base.puntuacionPorPregunta
      .filter((pregunta) => esObjeto(pregunta)
        && typeof pregunta.numero === 'number'
        && typeof pregunta.justificacionIA === 'string')
      .map((pregunta) => ({
        pregunta: pregunta.numero,
        justificacion: pregunta.justificacionIA,
        desglose: normalizarDesglosePregunta(pregunta.desglose || {})
      }));
  const materiaNormalizada = normalizarNombreMateria(base.examen.materia);
  const materiaFolderId = crearMateriaFolderId(materiaNormalizada);

  const reporteReparado = {
    ...base,
    respuestas: {
      lista: Array.isArray(base.respuestas.lista) ? base.respuestas.lista : [],
      texto: typeof base.respuestas.texto === 'string' ? base.respuestas.texto : ''
    },
    examen: {
      materia: normalizarTextoBase(base.examen.materia),
      grupo: typeof base.examen.grupo === 'string' ? base.examen.grupo : '',
      fecha: typeof base.examen.fecha === 'string' ? base.examen.fecha : '',
      totalPreguntas: typeof base.examen.totalPreguntas === 'number' ? base.examen.totalPreguntas : 0,
      claveRespuestas: typeof base.examen.claveRespuestas === 'string' ? base.examen.claveRespuestas : ''
    },
    estudiante: {
      nombre: typeof base.estudiante.nombre === 'string' ? base.estudiante.nombre : '',
      matricula: typeof base.estudiante.matricula === 'string' ? base.estudiante.matricula : ''
    },
    calificacionFinal: {
      notaSobre100: typeof base.calificacionFinal.notaSobre100 === 'number' ? base.calificacionFinal.notaSobre100 : 0,
      letra: typeof base.calificacionFinal.letra === 'string' ? base.calificacionFinal.letra : '',
      justificacionDocente: typeof base.calificacionFinal.justificacionDocente === 'string'
        ? base.calificacionFinal.justificacionDocente
        : ''
    },
    organizacion: {
      materiaNormalizada,
      materiaFolderId
    },
    puntuacionPorPregunta,
    justificacionesIA: justificacionesIA.map((item, indice) => ({
      pregunta: typeof item?.pregunta === 'number' ? item.pregunta : indice + 1,
      justificacion: typeof item?.justificacion === 'string' ? item.justificacion : '',
      desglose: normalizarDesglosePregunta(item?.desglose || {})
    }))
  };

  return esReporteValido(reporteReparado) ? reporteReparado : null;
};

const extraerReportesVersionados = (valor) => {
  if (Array.isArray(valor)) {
    return { schemaVersion: 1, data: valor };
  }

  if (
    esObjeto(valor)
    && typeof valor.schemaVersion === 'number'
    && Array.isArray(valor.data)
  ) {
    return { schemaVersion: valor.schemaVersion, data: valor.data };
  }

  return null;
};

const extraerOperacionesImportacionVersionadas = (valor) => {
  if (Array.isArray(valor)) {
    return { schemaVersion: 1, data: valor };
  }

  if (
    esObjeto(valor)
    && typeof valor.schemaVersion === 'number'
    && Array.isArray(valor.data)
  ) {
    return { schemaVersion: valor.schemaVersion, data: valor.data };
  }

  return null;
};

const migrarReportes = (versionInicial, dataInicial) => {
  let version = versionInicial;
  let data = Array.isArray(dataInicial) ? dataInicial : [];

  while (version < SCHEMA_VERSION_REPORTES) {
    if (version === 1) {
      data = data.map((reporte) => repararReporte(reporte)).filter(Boolean);
      version = 2;
      continue;
    }
    if (version === 2) {
      data = data.map((reporte) => repararReporte(reporte)).filter(Boolean);
      version = 3;
      continue;
    }
    if (version === 3) {
      data = data.map((reporte) => repararReporte(reporte)).filter(Boolean);
      version = 4;
      continue;
    }

    return null;
  }

  const reportesValidados = data.map((reporte) => repararReporte(reporte)).filter(Boolean);

  return {
    schemaVersion: SCHEMA_VERSION_REPORTES,
    data: reportesValidados
  };
};

const migrarOperacionesImportacion = (versionInicial, dataInicial) => {
  let version = versionInicial;
  let data = Array.isArray(dataInicial) ? dataInicial : [];

  while (version < SCHEMA_VERSION_OPERACIONES_IMPORTACION) {
    return null;
  }

  const operacionesValidadas = data
    .map((operacion) => repararOperacionImportacion(operacion))
    .filter(Boolean)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    schemaVersion: SCHEMA_VERSION_OPERACIONES_IMPORTACION,
    data: operacionesValidadas
  };
};

export const leerDecisionFinal = () => {
  const crudo = window.localStorage.getItem(STORAGE_DECISION_FINAL);
  if (!crudo) return decisionFinalInicial;

  try {
    const parseado = JSON.parse(crudo);
    const payload = extraerDecisionFinalVersionada(parseado);
    if (!payload) return decisionFinalInicial;

    const migrado = migrarDecisionFinal(payload.schemaVersion, payload.data);
    return migrado?.data ?? decisionFinalInicial;
  } catch {
    return decisionFinalInicial;
  }
};

export const guardarDecisionFinal = (decisionFinal) => {
  const data = repararDecisionFinal(decisionFinal) ?? decisionFinalInicial;
  window.localStorage.setItem(STORAGE_DECISION_FINAL, JSON.stringify({
    schemaVersion: SCHEMA_VERSION_DECISION_FINAL,
    data
  }));
};

// =========================
// Fallback local (offline / desarrollo)
// =========================

export const leerReportesLocalFallback = () => {
  const crudo = window.localStorage.getItem(STORAGE_REPORTES);
  if (!crudo) return [];

  try {
    const parseado = JSON.parse(crudo);
    const payload = extraerReportesVersionados(parseado);
    if (!payload) return [];

    const migrado = migrarReportes(payload.schemaVersion, payload.data);
    return migrado?.data ?? [];
  } catch {
    return [];
  }
};

export const guardarReportesLocalFallback = (reportes) => {
  const data = (Array.isArray(reportes) ? reportes : []).map((reporte) => repararReporte(reporte)).filter(Boolean);
  window.localStorage.setItem(STORAGE_REPORTES, JSON.stringify({
    schemaVersion: SCHEMA_VERSION_REPORTES,
    data
  }));
};

export const leerOperacionesImportacion = () => {
  const crudo = window.localStorage.getItem(STORAGE_OPERACIONES_IMPORTACION);
  if (!crudo) return [];

  try {
    const parseado = JSON.parse(crudo);
    const payload = extraerOperacionesImportacionVersionadas(parseado);
    if (!payload) return [];

    const migrado = migrarOperacionesImportacion(payload.schemaVersion, payload.data);
    return migrado?.data ?? [];
  } catch {
    return [];
  }
};

export const guardarOperacionesImportacion = (operaciones) => {
  const data = (Array.isArray(operaciones) ? operaciones : [])
    .map((operacion) => repararOperacionImportacion(operacion))
    .filter(Boolean)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  window.localStorage.setItem(STORAGE_OPERACIONES_IMPORTACION, JSON.stringify({
    schemaVersion: SCHEMA_VERSION_OPERACIONES_IMPORTACION,
    data
  }));
};

// Alias de compatibilidad para consumidores existentes.
export const leerReportes = leerReportesLocalFallback;
export const guardarReportes = guardarReportesLocalFallback;


class StorageServiceApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'StorageServiceApiError';
    this.status = status;
    this.code = code;
  }
}

const construirMensajeErrorApi = (status, fallback = 'No se pudo completar la operación de reportes en backend.') => {
  if (status === 401) {
    return 'Tu sesión expiró o es inválida. Inicia sesión nuevamente para consultar reportes.';
  }

  if (status === 403) {
    return 'No tienes permisos suficientes para acceder a reportes.';
  }

  return fallback;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const construirUrlApi = (path) => `${API_BASE_URL}${path}`;

// =========================
// Persistencia backend (producción)
// =========================

export const listarReportesApi = async () => {
  const response = await fetch(construirUrlApi('/api/reportes'), {
    headers: buildAuthHeaders()
  });

  if (!response.ok) {
    throw new StorageServiceApiError(construirMensajeErrorApi(response.status, 'No se pudieron listar reportes en backend.'), {
      status: response.status
    });
  }

  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
};

export const guardarReporteApi = async (reporte, actor = 'frontend_tecnico') => {
  const response = await fetch(construirUrlApi('/api/reportes'), {
    method: 'POST',
    headers: buildAuthHeaders({
      'Content-Type': 'application/json',
      'x-actor': actor
    }),
    body: JSON.stringify(reporte)
  });

  if (!response.ok) {
    throw new StorageServiceApiError(construirMensajeErrorApi(response.status, 'No se pudo guardar el reporte en backend.'), {
      status: response.status
    });
  }

  return response.json();
};

export const obtenerReporteApi = async (reporteId) => {
  const response = await fetch(construirUrlApi(`/api/reportes/${encodeURIComponent(reporteId)}`), {
    headers: buildAuthHeaders()
  });

  if (!response.ok) {
    throw new StorageServiceApiError(construirMensajeErrorApi(response.status, 'No se pudo obtener el reporte solicitado.'), {
      status: response.status
    });
  }

  return response.json();
};

export const exportarReporteApi = async (reporteId) => {
  const response = await fetch(construirUrlApi(`/api/reportes/${encodeURIComponent(reporteId)}/export`), {
    headers: buildAuthHeaders()
  });

  if (!response.ok) {
    throw new StorageServiceApiError(construirMensajeErrorApi(response.status, 'No se pudo exportar el reporte solicitado.'), {
      status: response.status
    });
  }

  return response.json();
};
const esOperacionImportacionValida = (operacion) => esObjeto(operacion)
  && typeof operacion.id === 'string'
  && typeof operacion.timestamp === 'string'
  && typeof operacion.strategy === 'string'
  && Array.isArray(operacion.affectedMatriculas)
  && operacion.affectedMatriculas.every((item) => typeof item === 'string');

const repararOperacionImportacion = (operacion) => {
  if (!esObjeto(operacion)) return null;

  const reparada = {
    id: typeof operacion.id === 'string' ? operacion.id : crypto.randomUUID(),
    timestamp: typeof operacion.timestamp === 'string' ? operacion.timestamp : new Date().toISOString(),
    strategy: typeof operacion.strategy === 'string' ? operacion.strategy : 'omitir_existentes',
    affectedMatriculas: Array.isArray(operacion.affectedMatriculas)
      ? operacion.affectedMatriculas.map((item) => String(item || '').trim()).filter(Boolean)
      : []
  };

  return esOperacionImportacionValida(reparada) ? reparada : null;
};
