import { obtenerRespuestaTexto } from './examUtils';

export const CONTRATO_DESGLOSE_PREGUNTA = Object.freeze({
  criterioAplicado: 'Comparación directa clave oficial vs respuesta del estudiante',
  evidencia: {
    clave: '',
    respuestaEstudiante: '',
    estado: 'incorrecta',
    confianzaOCR: null,
    fuente: ''
  },
  resultado: '',
  recomendacion: ''
});

const construirResultado = ({ esCorrecta, clave, respuestaEstudiante, puntaje }) => {
  if (esCorrecta) {
    return `Respuesta correcta: coincide con la clave (${clave}) y suma ${puntaje.toFixed(2)} puntos.`;
  }

  if (!respuestaEstudiante) {
    return `Pregunta sin respuesta marcada. Se esperaba ${clave || 'una opción válida'} y no se asignan puntos.`;
  }

  return `Respuesta incorrecta: se esperaba ${clave || '-'} y se recibió ${respuestaEstudiante}. Puntaje asignado: 0.00.`;
};

const construirRecomendacion = ({ esCorrecta, bajaConfianza, respuestaEstudiante }) => {
  if (esCorrecta && !bajaConfianza) {
    return 'Mantener criterio; no requiere ajuste docente.';
  }

  if (bajaConfianza) {
    return 'Verificar visualmente la marca en el examen por baja confianza OCR antes de confirmar la nota.';
  }

  if (!respuestaEstudiante) {
    return 'Confirmar si la pregunta fue omitida o si hubo fallo de lectura OCR.';
  }

  return 'Retroalimentar el criterio evaluado y practicar ejercicios similares de la clave oficial.';
};

export const crearDesglosePregunta = ({ numero, respuestaCorrecta, respuestaData, puntosPorPregunta, umbralBajaConfianza }) => {
  const respuestaEstudiante = obtenerRespuestaTexto(respuestaData);
  const confianzaOCR = typeof respuestaData?.confianza === 'number' ? respuestaData.confianza : null;
  const fuenteOCR = respuestaData?.fuenteLinea || '';
  const esCorrecta = Boolean(respuestaCorrecta && respuestaEstudiante && respuestaCorrecta === respuestaEstudiante);
  const puntaje = esCorrecta ? puntosPorPregunta : 0;
  const bajaConfianza = confianzaOCR !== null && confianzaOCR < umbralBajaConfianza;

  const desglose = {
    criterioAplicado: CONTRATO_DESGLOSE_PREGUNTA.criterioAplicado,
    evidencia: {
      clave: respuestaCorrecta || '',
      respuestaEstudiante: respuestaEstudiante || '',
      estado: esCorrecta ? 'correcta' : 'incorrecta',
      confianzaOCR,
      fuente: fuenteOCR
    },
    resultado: construirResultado({
      esCorrecta,
      clave: respuestaCorrecta,
      respuestaEstudiante,
      puntaje
    }),
    recomendacion: construirRecomendacion({
      esCorrecta,
      bajaConfianza,
      respuestaEstudiante
    })
  };

  return {
    numero,
    respuestaCorrecta: respuestaCorrecta || '',
    respuestaEstudiante: respuestaEstudiante || '',
    correcta: esCorrecta,
    puntaje,
    confianzaOCR,
    fuenteOCR,
    bajaConfianza,
    justificacionIA: `${desglose.resultado} ${desglose.recomendacion}`,
    desglose
  };
};

export const normalizarDesglosePregunta = (entrada = {}) => ({
  criterioAplicado: typeof entrada?.criterioAplicado === 'string'
    ? entrada.criterioAplicado
    : CONTRATO_DESGLOSE_PREGUNTA.criterioAplicado,
  evidencia: {
    clave: typeof entrada?.evidencia?.clave === 'string' ? entrada.evidencia.clave : '',
    respuestaEstudiante: typeof entrada?.evidencia?.respuestaEstudiante === 'string'
      ? entrada.evidencia.respuestaEstudiante
      : '',
    estado: entrada?.evidencia?.estado === 'correcta' ? 'correcta' : 'incorrecta',
    confianzaOCR: typeof entrada?.evidencia?.confianzaOCR === 'number' ? entrada.evidencia.confianzaOCR : null,
    fuente: typeof entrada?.evidencia?.fuente === 'string' ? entrada.evidencia.fuente : ''
  },
  resultado: typeof entrada?.resultado === 'string' ? entrada.resultado : '',
  recomendacion: typeof entrada?.recomendacion === 'string' ? entrada.recomendacion : ''
});
