import { useEffect, useMemo, useState } from 'react';
import Tesseract from 'tesseract.js';
import TopBar from './components/TopBar';
import StepIndicator from './components/StepIndicator';
import StepConfiguracion from './features/exam-workflow/StepConfiguracion';
import StepIngresoRespuestas from './features/exam-workflow/StepIngresoRespuestas';
import StepRevision from './features/exam-workflow/StepRevision';
import StepReporteFinal from './features/exam-workflow/StepReporteFinal';
import { useExamWorkflow } from './hooks/useExamWorkflow';
import { useReportes } from './hooks/useReportes';
import { sugerirCalificacionIA } from './services/aiService';
import { exportarGrupoCSV, exportarIndividualCSV, exportarIndividualPDF } from './services/exportService';
import { procesarImagenOCR } from './services/ocrService';
import { guardarDecisionFinal, leerDecisionFinal, normalizarNombreMateria } from './services/storageService';
import {
  convertirTextoALista,
  letrasValidas,
  limpiarRespuestas,
  mapearLetraPucmm,
  obtenerRespuestaTexto
} from './utils/examUtils';

const pasos = [
  'Configuración del examen',
  'Ingreso de respuestas',
  'Revisión de calificaciones',
  'Reporte final y exportación'
];

const STORAGE_API_KEY = 'corrector_anthropic_api_key';
const STORAGE_DECISION_FINAL = 'corrector_decision_final';
const UMBRAL_BAJA_CONFIANZA = 65;

const formularioInicial = {
  materia: '',
  grupo: '',
  fecha: '',
  estudianteNombre: '',
  estudianteMatricula: '',
  totalPreguntas: '',
  claveRespuestas: '',
  modoIngreso: 'transcripcion',
  archivoImagen: null
};

const decisionFinalInicial = {
  puntuacion: '',
  justificacion: ''
};

const estadoAsyncInicial = {
  cargando: false,
  error: ''
};

const letrasValidas = ['A', 'B', 'C', 'D'];

const limpiarRespuestas = (texto = '') => texto.toUpperCase().replace(/[^ABCD]/g, '');

const convertirTextoALista = (texto, totalPreguntas) => {
  const letras = limpiarRespuestas(texto).split('');
  const total = Number(totalPreguntas);

  if (!total || total <= 0) return letras;

  const lista = Array(total).fill('');
  for (let i = 0; i < total; i += 1) {
    lista[i] = letras[i] || '';
  }

  return lista;
};

const parsearOCRPorNumeroPregunta = (textoOCR, totalPreguntas) => {
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

const extraerJsonDeTexto = (texto = '') => {
  const bloque = texto.match(/\{[\s\S]*\}/);
  if (!bloque) {
    throw new Error('La IA respondió en un formato no válido.');
  }

  return JSON.parse(bloque[0]);
};

const construirPromptContable = ({
  materia,
  grupo,
  fecha,
  totalPreguntas,
  claveLimpia,
  respuestasLimpias,
  resultadoRevision
}) => {
  return [
    'Eres una profesora experta en contabilidad y evaluación formativa.',
    'Evalúa la resolución de un examen usando criterios contables estrictos y devuelve una sugerencia final.',
    '',
    'Criterios obligatorios de análisis contable:',
    '1) Asientos contables: estructura correcta y cuentas involucradas.',
    '2) Débitos y créditos: naturaleza de las cuentas y equilibrio del registro.',
    '3) Cálculos: exactitud numérica, redondeos y coherencia de resultados.',
    '4) Procedimiento: secuencia lógica y orden de los pasos de resolución.',
    '5) Conceptos: uso correcto de principios y terminología contable.',
    '',
    'Datos del examen:',
    `- Materia: ${materia}`,
    `- Grupo: ${grupo}`,
    `- Fecha: ${fecha}`,
    `- Total de preguntas: ${totalPreguntas}`,
    `- Clave oficial: ${claveLimpia}`,
    `- Respuestas del estudiante: ${respuestasLimpias}`,
    `- Aciertos automáticos detectados: ${resultadoRevision.aciertos}`,
    `- Errores automáticos detectados: ${resultadoRevision.errores}`,
    `- Puntaje automático actual: ${resultadoRevision.puntaje.toFixed(2)} / 100`,
    '',
    'Responde SOLO en JSON válido con este formato exacto:',
    '{"puntuacion_sugerida": number, "justificacion_breve": "texto breve en español"}',
    'La puntuación debe estar entre 0 y 100.'
  ].join('\n');
};

const leerApiKey = () => window.localStorage.getItem(STORAGE_API_KEY) || '';

const leerDecisionFinal = () => {
  const crudo = window.localStorage.getItem(STORAGE_DECISION_FINAL);
  if (!crudo) return decisionFinalInicial;

  try {
    const parseado = JSON.parse(crudo);
    return {
      puntuacion: parseado?.puntuacion || '',
      justificacion: parseado?.justificacion || ''
    };
  } catch {
    return decisionFinalInicial;
  }
};

function App() {
  const [datos, setDatos] = useState(formularioInicial);
  const [errores, setErrores] = useState({});
  const [respuestasLista, setRespuestasLista] = useState([]);
  const [ocrEstado, setOcrEstado] = useState({
    procesando: false,
    progreso: 0,
    error: '',
    textoDetectado: ''
  });
  const [panelAjustesAbierto, setPanelAjustesAbierto] = useState(false);
  const [apiKeyTemporal, setApiKeyTemporal] = useState('');
  const [decisionFinal, setDecisionFinal] = useState(() => leerDecisionFinal());
  const [iaEstado, setIaEstado] = useState({
    cargando: false,
    error: '',
    sugerencia: null
  });

  useEffect(() => {
    setApiKeyTemporal(leerApiKey());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_DECISION_FINAL, JSON.stringify(decisionFinal));
  const [ocrEstado, setOcrEstado] = useState({ procesando: false, progreso: 0, error: '', textoDetectado: '' });
  const [panelAjustesAbierto, setPanelAjustesAbierto] = useState(false);
  const [decisionFinal, setDecisionFinal] = useState(() => leerDecisionFinal());
  const [iaEstado, setIaEstado] = useState({ cargando: false, error: '', sugerencia: null });
  const [reporteActualRef, setReporteActualRef] = useState({ id: null, firma: null });

  const {
    reportes,
    setReportes,
    filtrosHistorial,
    setFiltrosHistorial,
    reportesFiltrados,
    reportesAgrupadosPorMateria
  } = useReportes();
  const { pasoActual, estadoActual, avanzarPaso, retrocederPaso } = useExamWorkflow(pasos);

  useEffect(() => {
    guardarDecisionFinal(decisionFinal);
  }, [decisionFinal]);

  const totalPreguntasNumero = Number(datos.totalPreguntas);

  const puntosPorPregunta = useMemo(() => {
    const total = Number(datos.totalPreguntas);
    if (!total || total <= 0) return 0;
    return 100 / total;
  }, [datos.totalPreguntas]);

  const respuestasTextoLista = useMemo(() => respuestasLista.map((item) => obtenerRespuestaTexto(item) || ''), [respuestasLista]);
  const respuestasLimpias = useMemo(() => limpiarRespuestas(respuestasLista), [respuestasLista]);

  const claveLimpia = useMemo(() => limpiarRespuestas(datos.claveRespuestas), [datos.claveRespuestas]);

  const desglosePreguntas = useMemo(() => {
    const total = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(claveLimpia.length, respuestasLimpias.length);
    return Array.from({ length: total }, (_, indice) => {
      const correcta = claveLimpia[indice] || '';
      const respuestaData = respuestasLista[indice] || {};
      const estudiante = obtenerRespuestaTexto(respuestaData);
      const esCorrecta = Boolean(correcta && estudiante && correcta === estudiante);
      const puntaje = esCorrecta ? puntosPorPregunta : 0;

      return {
        numero: indice + 1,
        respuestaCorrecta: correcta,
        respuestaEstudiante: estudiante,
        correcta: esCorrecta,
        puntaje,
        justificacionIA: esCorrecta
          ? 'Coincide con la clave oficial; mantiene el criterio contable esperado.'
          : 'No coincide con la clave oficial; requiere reforzar procedimiento y conceptos.',
        confianzaOCR: typeof respuestaData.confianza === 'number' ? respuestaData.confianza : null,
        fuenteOCR: respuestaData.fuenteLinea || '',
        bajaConfianza: typeof respuestaData.confianza === 'number' && respuestaData.confianza < UMBRAL_BAJA_CONFIANZA
      };
    });
  }, [totalPreguntasNumero, claveLimpia, respuestasLista, respuestasLimpias.length, puntosPorPregunta]);

  const resultadoRevision = useMemo(() => {
    const aciertos = desglosePreguntas.filter((item) => item.correcta).length;
    const total = desglosePreguntas.length;
    return {
      aciertos,
      errores: total - aciertos,
      porcentaje: total > 0 ? (aciertos / total) * 100 : 0,
      puntaje: desglosePreguntas.reduce((acc, item) => acc + item.puntaje, 0)
    };
  }, [desglosePreguntas]);

  const notaFinalNumerica = Number(decisionFinal.puntuacion || resultadoRevision.puntaje || 0);
  const letraFinal = mapearLetraPucmm(notaFinalNumerica);

  const firmaReporteActual = useMemo(() => JSON.stringify({
    examen: {
      materia: datos.materia,
      grupo: datos.grupo,
      fecha: datos.fecha,
      totalPreguntas: totalPreguntasNumero,
      claveRespuestas: claveLimpia
    },
    estudiante: {
      nombre: datos.estudianteNombre,
      matricula: datos.estudianteMatricula
    },
    respuestasLista,
    respuestasTexto: respuestasLimpias,
    puntuacionPorPregunta: desglosePreguntas,
    calificacionFinal: {
      notaSobre100: notaFinalNumerica,
      letra: letraFinal,
      justificacionDocente: decisionFinal.justificacion
    }
  }), [
    claveLimpia,
    datos.estudianteMatricula,
    datos.estudianteNombre,
    datos.fecha,
    datos.grupo,
    datos.materia,
    decisionFinal.justificacion,
    desglosePreguntas,
    letraFinal,
    notaFinalNumerica,
    respuestasLimpias,
    respuestasLista,
    totalPreguntasNumero
  ]);

  const reporteActualGuardado = reporteActualRef.id !== null && reporteActualRef.firma === firmaReporteActual;

  const estadisticasGrupo = useMemo(() => {
    const distribucion = { A: 0, 'B+': 0, B: 0, 'C+': 0, C: 0, D: 0, F: 0 };
    reportesFiltrados.forEach((rep) => { distribucion[rep.calificacionFinal.letra] += 1; });
    return distribucion;
  }, [reportesFiltrados]);

  const actualizarDato = (campo, valor) => setDatos((previo) => ({ ...previo, [campo]: valor }));
  const obtenerMateriaCanonica = (materiaCruda) => {
    const materiaNormalizada = normalizarNombreMateria(materiaCruda);
    const materiaExistente = reportes.find((rep) => rep.organizacion?.materiaNormalizada === materiaNormalizada);
    return materiaExistente?.examen.materia || materiaCruda.trim().replace(/\s+/g, ' ');
  };

  const actualizarRespuesta = (indice, valor) => {
    setRespuestasLista((previo) => {
      const longitud = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(previo.length, indice + 1);
      const copia = Array.from({ length: longitud }, (_, i) => previo[i] || convertirTextoALista('', 1)[0]);
      copia[indice] = {
        ...copia[indice],
        respuesta: valor,
        confianza: null,
        fuenteLinea: 'Ajuste manual'
      };
      return copia;
    });
  };

  const validarPaso = (indice) => {
    const nuevosErrores = {};
    if (indice === 0) {
      const materiaNormalizada = normalizarNombreMateria(datos.materia);
      if (!materiaNormalizada) nuevosErrores.materia = 'La materia es obligatoria.';
      if (!datos.grupo.trim()) nuevosErrores.grupo = 'El grupo es obligatorio.';
      if (!datos.fecha) nuevosErrores.fecha = 'La fecha es obligatoria.';
      if (!datos.estudianteNombre.trim()) nuevosErrores.estudianteNombre = 'El nombre del estudiante es obligatorio.';
      if (!datos.estudianteMatricula.trim()) nuevosErrores.estudianteMatricula = 'La matrícula del estudiante es obligatoria.';
      const totalPreguntas = Number(datos.totalPreguntas);
      if (!totalPreguntas || totalPreguntas <= 0) nuevosErrores.totalPreguntas = 'Ingrese un total de preguntas válido.';
      if (!datos.claveRespuestas.trim()) nuevosErrores.claveRespuestas = 'La clave de respuestas es obligatoria.';
      else if (!/^[ABCD]+$/i.test(datos.claveRespuestas.trim())) nuevosErrores.claveRespuestas = 'Use solo letras A, B, C o D en la clave.';
    }
    if (indice === 1) {
      if (!respuestasLimpias) nuevosErrores.respuestasEstudiante = 'Debe cargar o transcribir respuestas válidas del estudiante (A, B, C o D).';
      if (datos.modoIngreso === 'imagen' && !datos.archivoImagen) nuevosErrores.archivoImagen = 'Debe seleccionar una imagen de respuestas.';
    }
    if (indice === 3) {
      if (!decisionFinal.puntuacion || !decisionFinal.justificacion.trim()) {
        nuevosErrores.decisionFinal = 'Debe registrar puntuación y justificación final de la profesora.';
      }

      if (!decisionFinal.puntuacion || !decisionFinal.justificacion.trim()) {
        nuevosErrores.decisionFinal =
          'Debe registrar puntuación y justificación final de la profesora.';
      }
    }
    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const procesarImagenConOCR = async () => {
    if (!datos.archivoImagen) {
      setErrores((previo) => ({ ...previo, archivoImagen: 'Seleccione una imagen antes de procesar.' }));
      return;
    }

    setErrores((previo) => ({ ...previo, archivoImagen: '', respuestasEstudiante: '' }));
    setOcrEstado({ procesando: true, progreso: 0, error: '', textoDetectado: '' });

    try {
      const { textoDetectado, respuestasParseadas } = await procesarImagenOCR({
        archivoImagen: datos.archivoImagen,
        totalPreguntas: totalPreguntasNumero,
        onProgress: (progreso) => setOcrEstado((previo) => ({ ...previo, progreso }))
      });

      setRespuestasLista(respuestasParseadas);
      setOcrEstado({ procesando: false, progreso: 100, error: '', textoDetectado });
    } catch (error) {
      setOcrEstado({ procesando: false, progreso: 0, error: error?.message || 'No se pudo procesar la imagen.', textoDetectado: '' });
    }
  };

  const sugerirCalificacionConIA = async () => {
    const apiKey = leerApiKey();

    if (!apiKey) {
      setIaEstado({
        cargando: false,
        error: 'No hay API key configurada. Abra Ajustes y guarde su API key de Anthropic.',
        sugerencia: null
      });
      return;
    }

    setIaEstado({ cargando: true, error: '', sugerencia: null });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const prompt = construirPromptContable({
        materia: datos.materia,
        grupo: datos.grupo,
        fecha: datos.fecha,
        totalPreguntas: datos.totalPreguntas,
        claveLimpia,
        respuestasLimpias,
        resultadoRevision
      });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 250,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });

      const data = await response.json();

      if (!response.ok) {
        const tipoError = data?.error?.type;

        if (response.status === 401 || tipoError === 'authentication_error') {
          throw new Error('API key inválida o sin permisos. Verifique su API key en Ajustes.');
        }

        if (response.status === 429 || tipoError === 'rate_limit_error') {
          throw new Error('Se alcanzó el límite de cuota o tasa de peticiones de Anthropic. Intente más tarde.');
        }

        throw new Error(data?.error?.message || 'Error inesperado al consultar Anthropic.');
      }

      const textoIa = (data?.content || [])
        .filter((bloque) => bloque?.type === 'text')
        .map((bloque) => bloque.text)
        .join('\n');

      const jsonParseado = extraerJsonDeTexto(textoIa);
      const puntuacionNormalizada = Number(jsonParseado.puntuacion_sugerida);

      if (Number.isNaN(puntuacionNormalizada) || puntuacionNormalizada < 0 || puntuacionNormalizada > 100) {
        throw new Error('La IA devolvió una puntuación fuera de rango (0-100).');
      }

      const sugerencia = {
        puntuacion: puntuacionNormalizada.toFixed(2),
        justificacion: String(jsonParseado.justificacion_breve || '').trim()
      };

      setIaEstado({ cargando: false, error: '', sugerencia });
      setDecisionFinal(sugerencia);
      setErrores((previo) => ({ ...previo, decisionFinal: '' }));
    } catch (error) {
      if (error?.name === 'AbortError') {
        setIaEstado({
          cargando: false,
          error: 'La solicitud excedió el tiempo límite (20s). Intente de nuevo.',
          sugerencia: null
        });
      } else {
        setIaEstado({
          cargando: false,
          error: error?.message || 'No se pudo obtener sugerencia de IA.',
          sugerencia: null
        });
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const guardarApiKey = () => {
    window.localStorage.setItem(STORAGE_API_KEY, apiKeyTemporal.trim());
    window.alert('API key guardada localmente en este navegador.');
  };

  const eliminarApiKey = () => {
    window.localStorage.removeItem(STORAGE_API_KEY);
    setApiKeyTemporal('');
    window.alert('API key eliminada.');
  };

  const avanzarPaso = async () => {
    if (!validarPaso(pasoActual)) return;

    cambiarEstadoPaso(pasoActual, { cargando: true, error: '' });
    setIaEstado({ cargando: true, error: '', sugerencia: null });
    try {
      const sugerencia = await sugerirCalificacionIA({ datos, puntaje: resultadoRevision.puntaje });
      setIaEstado({ cargando: false, error: '', sugerencia });
      setDecisionFinal(sugerencia);
      setErrores((previo) => ({ ...previo, decisionFinal: '' }));
    } catch (error) {
      setIaEstado({
        cargando: false,
        error: error?.name === 'AbortError' ? 'La solicitud excedió el tiempo límite (20s).' : (error?.message || 'No se pudo obtener sugerencia de IA.'),
        sugerencia: null
      });
    }
  };

  const generarReporteActual = (meta = {}) => ({
    id: meta.id || crypto.randomUUID(),
    creadoEn: meta.creadoEn || new Date().toISOString(),
    examen: {
      materia: obtenerMateriaCanonica(datos.materia),
      grupo: datos.grupo,
      fecha: datos.fecha,
      totalPreguntas: totalPreguntasNumero,
      claveRespuestas: claveLimpia
    },
    estudiante: { nombre: datos.estudianteNombre, matricula: datos.estudianteMatricula },
    respuestas: { lista: respuestasLista, texto: respuestasLimpias },
    puntuacionPorPregunta: desglosePreguntas,
    justificacionesIA: desglosePreguntas.map((item) => ({ pregunta: item.numero, justificacion: item.justificacionIA })),
    calificacionFinal: { notaSobre100: notaFinalNumerica, letra: letraFinal, justificacionDocente: decisionFinal.justificacion }
  });

  const guardarReporte = () => {
    if (!validarPaso(3)) return;

    const reporteGuardadoPrevio = reporteActualRef.id ? reportes.find((rep) => rep.id === reporteActualRef.id) : null;
    const reporte = generarReporteActual({
      id: reporteGuardadoPrevio?.id,
      creadoEn: reporteGuardadoPrevio?.creadoEn
    });

    setReportes((previo) => {
      if (!reporteGuardadoPrevio) return [reporte, ...previo];
      return previo.map((item) => (item.id === reporte.id ? reporte : item));
    });

    setReporteActualRef({ id: reporte.id, firma: firmaReporteActual });
  };

  const exportarReporteActual = (tipo) => {
    if (!validarPaso(3)) return;

    const reportePersistido = reporteActualGuardado && reporteActualRef.id
      ? reportes.find((rep) => rep.id === reporteActualRef.id)
      : null;
    const reporte = reportePersistido || generarReporteActual();

    if (tipo === 'pdf') exportarIndividualPDF(reporte);
    if (tipo === 'csv') exportarIndividualCSV(reporte);
  };

  const textoManual = respuestasTextoLista.join('');
  const totalFilasTabla = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(respuestasLista.length, 1);
  const exportarCarpetaMateriaCSV = (materiaFolderId) => {
    const reportesCarpeta = reportesFiltrados.filter((rep) => rep.organizacion?.materiaFolderId === materiaFolderId);
    exportarGrupoCSV(reportesCarpeta);
  };

  return (
    <main className="contenedor">
      <div className="barra-superior">
        <div>
          <h1>Corrector de Exámenes</h1>
          <p className="subtitulo">Flujo guiado de evaluación automática</p>
        </div>
        <button type="button" onClick={() => setPanelAjustesAbierto((previo) => !previo)}>
          {panelAjustesAbierto ? 'Cerrar ajustes' : 'Ajustes API'}
        </button>
      </div>

      {panelAjustesAbierto && (
        <section className="panel ajustes">
          <h2>Ajustes</h2>
          <label>
            API key de Anthropic
            <input
              type="password"
              value={apiKeyTemporal}
              onChange={(e) => setApiKeyTemporal(e.target.value)}
              placeholder="sk-ant-..."
            />
          </label>
          <p className="detalle">La API key se guarda en localStorage del navegador, sin hardcodearse.</p>
          <div className="acciones-ajustes">
            <button type="button" onClick={guardarApiKey}>Guardar API key</button>
            <button type="button" onClick={eliminarApiKey}>Eliminar API key</button>
          </div>
        </section>
      )}
      <TopBar panelAjustesAbierto={panelAjustesAbierto} onToggleAjustes={() => setPanelAjustesAbierto((previo) => !previo)} />

      {panelAjustesAbierto && (
        <section className="panel ajustes">
          <h2>Ajustes</h2>
          <p className="detalle">La integración de IA usa un endpoint backend interno. La API key de Anthropic se gestiona solo en el servidor.</p>
        </section>
      )}

      <StepIndicator pasos={pasos} pasoActual={pasoActual} />

      <section className="panel">
        {pasoActual === 0 && (
          <StepConfiguracion
            datos={datos}
            errores={errores}
            actualizarDato={actualizarDato}
            setRespuestasLista={setRespuestasLista}
            convertirTextoALista={convertirTextoALista}
            puntosPorPregunta={puntosPorPregunta}
          />
        )}
        {pasoActual === 1 && (
          <StepIngresoRespuestas
            datos={datos}
            errores={errores}
            actualizarDato={actualizarDato}
            textoManual={textoManual}
            setRespuestasLista={setRespuestasLista}
            convertirTextoALista={convertirTextoALista}
            totalPreguntasNumero={totalPreguntasNumero}
            procesarImagenConOCR={procesarImagenConOCR}
            ocrEstado={ocrEstado}
            totalFilasTabla={totalFilasTabla}
            respuestasLista={respuestasLista}
            actualizarRespuesta={actualizarRespuesta}
            letrasValidas={letrasValidas}
            umbralBajaConfianza={UMBRAL_BAJA_CONFIANZA}
          />
        )}
        {pasoActual === 2 && (
          <div className="paso">
            <h2>Revisión de calificaciones</h2>
            {errores.revision && <p className="error">{errores.revision}</p>}
            <div className="resumen">
              <p>Aciertos: {resultadoRevision.aciertos}</p>
              <p>Errores: {resultadoRevision.errores}</p>
              <p>Porcentaje: {resultadoRevision.porcentaje.toFixed(2)}%</p>
              <p>Puntaje: {resultadoRevision.puntaje.toFixed(2)} / 100</p>
            </div>

            <button type="button" onClick={sugerirCalificacionConIA} disabled={iaEstado.cargando}>
              {iaEstado.cargando ? 'Consultando IA...' : 'Sugerir calificación con IA (Anthropic)'}
            </button>

            {iaEstado.error && <p className="error">{iaEstado.error}</p>}

            {iaEstado.sugerencia && (
              <div className="sugerencia-ia">
                <h3>Sugerencia de IA</h3>
                <p>Puntuación sugerida: {iaEstado.sugerencia.puntuacion}</p>
                <p>Justificación: {iaEstado.sugerencia.justificacion}</p>
              </div>
            )}
          </div>
          <StepRevision
            resultadoRevision={resultadoRevision}
            mapearLetraPucmm={mapearLetraPucmm}
            sugerirCalificacionConIA={sugerirCalificacionConIA}
            iaEstado={iaEstado}
            desglosePreguntas={desglosePreguntas}
          />
        )}
        {pasoActual === 3 && (
          <div className="paso">
            <h2>Reporte final y exportación</h2>
            {errores.reporte && <p className="error">{errores.reporte}</p>}
            <ul className="resumen-final">
              <li>Materia: {datos.materia || 'Sin definir'}</li>
              <li>Grupo: {datos.grupo || 'Sin definir'}</li>
              <li>Fecha: {datos.fecha || 'Sin definir'}</li>
              <li>Puntaje automático: {resultadoRevision.puntaje.toFixed(2)} / 100</li>
            </ul>

            <div className="decision-final">
              <h3>Decisión final de la profesora</h3>
              <label>
                Puntuación final (0-100)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={decisionFinal.puntuacion}
                  onChange={(e) =>
                    setDecisionFinal((previo) => ({ ...previo, puntuacion: e.target.value }))
                  }
                />
              </label>
              <label>
                Justificación final
                <textarea
                  rows="3"
                  value={decisionFinal.justificacion}
                  onChange={(e) =>
                    setDecisionFinal((previo) => ({ ...previo, justificacion: e.target.value }))
                  }
                />
              </label>
              {errores.decisionFinal && <p className="error">{errores.decisionFinal}</p>}
              <p className="detalle">
                Este valor se persiste siempre como decisión final, incluso si se modifica la sugerencia de IA.
              </p>
            </div>

            <button
              type="button"
              onClick={exportarReporte}
              disabled={estadoPaso[3].cargando}
            >
              {estadoPaso[3].cargando ? 'Exportando reporte...' : 'Exportar reporte'}
            </button>
            {estadoPaso[3].error && <p className="error">{estadoPaso[3].error}</p>}
          </div>
          <StepReporteFinal
            datos={datos}
            notaFinalNumerica={notaFinalNumerica}
            letraFinal={letraFinal}
            decisionFinal={decisionFinal}
            setDecisionFinal={setDecisionFinal}
            errores={errores}
            guardarReporte={guardarReporte}
            exportarReporteActual={exportarReporteActual}
            reporteActualGuardado={reporteActualGuardado}
            filtrosHistorial={filtrosHistorial}
            setFiltrosHistorial={setFiltrosHistorial}
            reportesFiltrados={reportesFiltrados}
            reportesAgrupadosPorMateria={reportesAgrupadosPorMateria}
            estadisticasGrupo={estadisticasGrupo}
            exportarGrupoCSV={() => exportarGrupoCSV(reportesFiltrados)}
            exportarCarpetaMateriaCSV={exportarCarpetaMateriaCSV}
          />
        )}
      </section>

      {estadoActual.cargando && <p className="info">Procesando paso...</p>}

      <footer className="acciones">
        <button type="button" onClick={() => retrocederPaso(() => setErrores({}))} disabled={pasoActual === 0 || estadoActual.cargando}>Anterior</button>
        <button type="button" onClick={() => avanzarPaso(validarPaso)} disabled={pasoActual === pasos.length - 1 || estadoActual.cargando}>{estadoActual.cargando ? 'Cargando...' : 'Siguiente'}</button>
      </footer>
    </main>
  );
}

export default App;
