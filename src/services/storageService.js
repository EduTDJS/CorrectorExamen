export const STORAGE_DECISION_FINAL = 'corrector_decision_final';
export const STORAGE_REPORTES = 'corrector_historial_reportes_v1';

const SCHEMA_VERSION_REPORTES = 3;
const SCHEMA_VERSION_DECISION_FINAL = 2;

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

  const justificacionesIA = base.justificacionesIA
    || base.puntuacionPorPregunta
      .filter((pregunta) => esObjeto(pregunta)
        && typeof pregunta.numero === 'number'
        && typeof pregunta.justificacionIA === 'string')
      .map((pregunta) => ({ pregunta: pregunta.numero, justificacion: pregunta.justificacionIA }));
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
    justificacionesIA
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

    return null;
  }

  const reportesValidados = data.map((reporte) => repararReporte(reporte)).filter(Boolean);

  return {
    schemaVersion: SCHEMA_VERSION_REPORTES,
    data: reportesValidados
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

export const leerReportes = () => {
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

export const guardarReportes = (reportes) => {
  const data = (Array.isArray(reportes) ? reportes : []).map((reporte) => repararReporte(reporte)).filter(Boolean);
  window.localStorage.setItem(STORAGE_REPORTES, JSON.stringify({
    schemaVersion: SCHEMA_VERSION_REPORTES,
    data
  }));
};
