import crypto from 'node:crypto';

const createRubricId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return `rubrica_${crypto.randomUUID()}`;
  }
  return `rubrica_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizarCriterio = (criterio = {}, indice = 0) => ({
  pregunta: Number(criterio.pregunta || indice + 1),
  descripcion: String(criterio.descripcion || `Criterio ${indice + 1}`).trim(),
  respuestaCorrecta: String(criterio.respuestaCorrecta || '').trim().toUpperCase(),
  peso: Number.isFinite(Number(criterio.peso)) ? Number(criterio.peso) : 1
});

const normalizarRubrica = (payload = {}, { id } = {}) => ({
  id: String(id || payload.id || '').trim() || createRubricId(),
  materia: String(payload.materia || '').trim(),
  grado: String(payload.grado || '').trim(),
  criterios: Array.isArray(payload.criterios) ? payload.criterios.map((item, indice) => normalizarCriterio(item, indice)) : [],
  reglasPenalizacionBonificacion: {
    penalizacionSinRespuesta: Number(payload?.reglasPenalizacionBonificacion?.penalizacionSinRespuesta || 0),
    bonificacionPorRachaCorrecta: {
      minimoConsecutivas: Number(payload?.reglasPenalizacionBonificacion?.bonificacionPorRachaCorrecta?.minimoConsecutivas || 0),
      puntosExtra: Number(payload?.reglasPenalizacionBonificacion?.bonificacionPorRachaCorrecta?.puntosExtra || 0)
    }
  },
  version: Number(payload.version || 1),
  creadoEn: payload.creadoEn || new Date().toISOString()
});

const RUBRICAS_BASE = [
  normalizarRubrica({
    id: 'rubrica-matematicas-6to-v1',
    materia: 'Matemáticas',
    grado: '6to primaria',
    criterios: [
      { pregunta: 1, descripcion: 'Operaciones básicas', respuestaCorrecta: 'A', peso: 1 },
      { pregunta: 2, descripcion: 'Fracciones', respuestaCorrecta: 'B', peso: 1 },
      { pregunta: 3, descripcion: 'Problemas verbales', respuestaCorrecta: 'C', peso: 1 },
      { pregunta: 4, descripcion: 'Geometría', respuestaCorrecta: 'D', peso: 1 }
    ],
    reglasPenalizacionBonificacion: {
      penalizacionSinRespuesta: 0,
      bonificacionPorRachaCorrecta: { minimoConsecutivas: 0, puntosExtra: 0 }
    },
    version: 1
  })
];

let rubricas = [...RUBRICAS_BASE];

export const listRubrics = async () => rubricas.map((item) => ({ ...item }));

const validarRubrica = (payload = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('El payload de rúbrica debe ser un objeto JSON.');
  }
  if (!String(payload.materia || '').trim()) {
    throw new Error('El campo "materia" es obligatorio.');
  }
  if (!String(payload.grado || '').trim()) {
    throw new Error('El campo "grado" es obligatorio.');
  }
  if (!Array.isArray(payload.criterios) || payload.criterios.length === 0) {
    throw new Error('El campo "criterios" debe ser un arreglo con al menos un criterio.');
  }
};

export const createRubric = async (payload = {}) => {
  validarRubrica(payload);
  const rubrica = normalizarRubrica(payload);
  rubricas = [...rubricas, rubrica];
  return { ...rubrica };
};

export const resetRubricsForTests = () => {
  rubricas = [...RUBRICAS_BASE];
};
