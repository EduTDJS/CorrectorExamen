export const CONTRATO_RUBRICA_MINIMO = Object.freeze({
  id: '',
  materia: '',
  grado: '',
  criterios: [],
  reglasPenalizacionBonificacion: {
    penalizacionSinRespuesta: 0,
    bonificacionPorRachaCorrecta: {
      minimoConsecutivas: 0,
      puntosExtra: 0
    }
  },
  version: 1
});

const normalizarCriterio = (criterio = {}, indice = 0) => ({
  pregunta: Number(criterio.pregunta || indice + 1),
  descripcion: String(criterio.descripcion || `Criterio ${indice + 1}`).trim(),
  respuestaCorrecta: String(criterio.respuestaCorrecta || '').trim().toUpperCase(),
  peso: Number.isFinite(Number(criterio.peso)) ? Number(criterio.peso) : 1
});

export const normalizarRubrica = (entrada = {}) => ({
  id: String(entrada.id || '').trim(),
  materia: String(entrada.materia || '').trim(),
  grado: String(entrada.grado || '').trim(),
  criterios: Array.isArray(entrada.criterios) ? entrada.criterios.map((item, indice) => normalizarCriterio(item, indice)) : [],
  reglasPenalizacionBonificacion: {
    penalizacionSinRespuesta: Number(entrada?.reglasPenalizacionBonificacion?.penalizacionSinRespuesta || 0),
    bonificacionPorRachaCorrecta: {
      minimoConsecutivas: Number(entrada?.reglasPenalizacionBonificacion?.bonificacionPorRachaCorrecta?.minimoConsecutivas || 0),
      puntosExtra: Number(entrada?.reglasPenalizacionBonificacion?.bonificacionPorRachaCorrecta?.puntosExtra || 0)
    }
  },
  version: Number(entrada.version || 1)
});

export const construirClaveDesdeCriterios = (criterios = []) => criterios
  .slice()
  .sort((a, b) => Number(a.pregunta || 0) - Number(b.pregunta || 0))
  .map((item) => String(item.respuestaCorrecta || '').toUpperCase())
  .join('');

export const RUBRICAS_SEMILLA = Object.freeze([
  normalizarRubrica({
    id: 'rubrica-matematicas-6to-v1',
    materia: 'Matemáticas',
    grado: '6to primaria',
    version: 1,
    criterios: [
      { pregunta: 1, descripcion: 'Operaciones básicas', respuestaCorrecta: 'A', peso: 1 },
      { pregunta: 2, descripcion: 'Fracciones', respuestaCorrecta: 'B', peso: 1 },
      { pregunta: 3, descripcion: 'Problemas verbales', respuestaCorrecta: 'C', peso: 1 },
      { pregunta: 4, descripcion: 'Geometría', respuestaCorrecta: 'D', peso: 1 }
    ],
    reglasPenalizacionBonificacion: {
      penalizacionSinRespuesta: 0,
      bonificacionPorRachaCorrecta: {
        minimoConsecutivas: 0,
        puntosExtra: 0
      }
    }
  }),
  normalizarRubrica({
    id: 'rubrica-lengua-2do-sec-v1',
    materia: 'Lengua Española',
    grado: '2do secundaria',
    version: 1,
    criterios: [
      { pregunta: 1, descripcion: 'Comprensión literal', respuestaCorrecta: 'B', peso: 1.2 },
      { pregunta: 2, descripcion: 'Comprensión inferencial', respuestaCorrecta: 'D', peso: 1.2 },
      { pregunta: 3, descripcion: 'Ortografía', respuestaCorrecta: 'A', peso: 0.8 },
      { pregunta: 4, descripcion: 'Sintaxis', respuestaCorrecta: 'C', peso: 0.8 }
    ],
    reglasPenalizacionBonificacion: {
      penalizacionSinRespuesta: 0.25,
      bonificacionPorRachaCorrecta: {
        minimoConsecutivas: 3,
        puntosExtra: 1
      }
    }
  })
]);
