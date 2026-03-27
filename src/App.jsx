import { useEffect, useMemo, useState } from 'react';
import TopBar from './components/TopBar';
import StepIndicator from './components/StepIndicator';
import StepConfiguracion from './features/exam-workflow/StepConfiguracion';
import StepIngresoRespuestas from './features/exam-workflow/StepIngresoRespuestas';
import StepReporteFinal from './features/exam-workflow/StepReporteFinal';
import StepRevision from './features/exam-workflow/StepRevision';
import { useExamWorkflow } from './hooks/useExamWorkflow';
import { useReportes } from './hooks/useReportes';
import { obtenerProveedorIA, sugerirCalificacionIA } from './services/aiService';
import { exportarGrupoCSV, exportarIndividualCSV, exportarIndividualPDF } from './services/exportService';
import { procesarImagenOCR } from './services/ocrService';
import { parsearArchivoImportacion } from './services/importService';
import { guardarDecisionFinal, leerDecisionFinal, normalizarNombreMateria } from './services/storageService';
import { convertirTextoALista, letrasValidas, limpiarRespuestas, mapearLetraPucmm } from './utils/examUtils';
import { crearDesglosePregunta } from './utils/questionBreakdown';
import { detectarMatriculasDuplicadas } from './hooks/useReportes';
import { construirClaveDesdeCriterios } from './features/rubrics/rubricModel';
import { calcularPuntajeRubrica } from './utils/rubricScoring';

const pasos = [
  'Configuración del examen',
  'Ingreso de respuestas',
  'Revisión de calificaciones',
  'Reporte final y exportación'
];

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

function App() {
  const [datos, setDatos] = useState(formularioInicial);
  const [errores, setErrores] = useState({});
  const [respuestasLista, setRespuestasLista] = useState([]);
  const [panelAjustesAbierto, setPanelAjustesAbierto] = useState(false);
  const [ocrEstado, setOcrEstado] = useState({ procesando: false, progreso: 0, error: '', textoDetectado: '' });
  const [decisionFinal, setDecisionFinal] = useState(() => leerDecisionFinal());
  const [iaEstado, setIaEstado] = useState({
    cargando: false,
    error: '',
    sugerencia: null,
    proveedorActivo: 'desconocido',
    modeloActivo: 'desconocido',
    timeoutMs: 0
  });
  const [reporteActualRef, setReporteActualRef] = useState({ id: null, firma: null });
  const [errorSesionUi, setErrorSesionUi] = useState('');
  const [overridesDocente, setOverridesDocente] = useState({});
  const [importacionEstado, setImportacionEstado] = useState({
    filas: [],
    errores: [],
    duplicados: [],
    duplicadosEnHistorial: [],
    resumen: null,
    contrato: null,
    error: ''
  });

  const {
    pasoActual,
    estadoActual,
    avanzarPaso,
    retrocederPaso,
    rubricas,
    rubricaSeleccionada,
    rubricaSeleccionadaId,
    estadoRubricas,
    cargarRubricas,
    seleccionarRubrica
  } = useExamWorkflow(pasos);
  const {
    reportes,
    guardarReporte: guardarReportePersistente,
    filtrosHistorial,
    setFiltrosHistorial,
    reportesFiltrados,
    reportesAgrupadosPorMateria,
    errorSesion: errorSesionReportes
  } = useReportes();

  useEffect(() => {
    guardarDecisionFinal(decisionFinal);
  }, [decisionFinal]);

  useEffect(() => {
    const cargarProveedor = async () => {
      try {
        const proveedor = await obtenerProveedorIA();
        setErrorSesionUi('');
        setIaEstado((previo) => ({
          ...previo,
          proveedorActivo: proveedor.proveedor,
          modeloActivo: proveedor.modelo,
          timeoutMs: proveedor.timeoutMs,
          error: ''
        }));
      } catch (error) {
        setIaEstado((previo) => ({
          ...previo,
          error: error?.message || 'No se pudo obtener la configuración del proveedor de IA activo.'
        }));
      }
    };

    cargarProveedor();
  }, []);

  useEffect(() => {
    cargarRubricas();
  }, [cargarRubricas]);

  useEffect(() => {
    if (!rubricaSeleccionada) return;

    const claveSugerida = construirClaveDesdeCriterios(rubricaSeleccionada.criterios);
    setDatos((previo) => ({
      ...previo,
      materia: rubricaSeleccionada.materia,
      totalPreguntas: String(rubricaSeleccionada.criterios.length),
      claveRespuestas: claveSugerida
    }));
    setRespuestasLista((previo) => convertirTextoALista(previo, rubricaSeleccionada.criterios.length));
  }, [rubricaSeleccionada]);

  const totalPreguntasNumero = Number(datos.totalPreguntas);

  const puntosPorPregunta = useMemo(() => {
    if (!totalPreguntasNumero || totalPreguntasNumero <= 0) return 0;
    return 100 / totalPreguntasNumero;
  }, [totalPreguntasNumero]);

  const claveLimpia = useMemo(() => limpiarRespuestas(datos.claveRespuestas), [datos.claveRespuestas]);
  const respuestasLimpias = useMemo(() => limpiarRespuestas(respuestasLista), [respuestasLista]);

  const desgloseBase = useMemo(() => {
    const total = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(claveLimpia.length, respuestasLimpias.length);
    return Array.from({ length: total }, (_, indice) => crearDesglosePregunta({
      numero: indice + 1,
      respuestaCorrecta: claveLimpia[indice] || '',
      respuestaData: respuestasLista[indice] || {},
      puntosPorPregunta,
      umbralBajaConfianza: UMBRAL_BAJA_CONFIANZA
    }));
  }, [claveLimpia, puntosPorPregunta, respuestasLimpias.length, respuestasLista, totalPreguntasNumero]);

  const desglosePreguntas = useMemo(() => calcularPuntajeRubrica({
    desgloseBase,
    rubrica: rubricaSeleccionada,
    overridesDocente
  }), [desgloseBase, overridesDocente, rubricaSeleccionada]);

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
    respuestas: respuestasLimpias,
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
    totalPreguntasNumero
  ]);

  const reporteActualGuardado = reporteActualRef.id !== null && reporteActualRef.firma === firmaReporteActual;

  const estadisticasGrupo = useMemo(() => {
    const distribucion = { A: 0, 'B+': 0, B: 0, 'C+': 0, C: 0, D: 0, F: 0 };
    reportesFiltrados.forEach((rep) => {
      distribucion[rep.calificacionFinal.letra] += 1;
    });
    return distribucion;
  }, [reportesFiltrados]);

  const actualizarDato = (campo, valor) => setDatos((previo) => ({ ...previo, [campo]: valor }));

  const aplicarFilaImportada = (fila) => {
    actualizarDato('estudianteNombre', fila.estudianteNombre);
    actualizarDato('estudianteMatricula', fila.estudianteMatricula);
    setRespuestasLista(fila.respuestasLista);
    setErrores((previo) => ({ ...previo, respuestasEstudiante: '' }));
  };

  const importarArchivoRespuestas = async (file) => {
    if (!file) {
      setImportacionEstado((previo) => ({
        ...previo,
        error: '',
        filas: [],
        errores: [],
        resumen: null,
        duplicados: [],
        duplicadosEnHistorial: []
      }));
      return;
    }

    try {
      const resultado = await parsearArchivoImportacion({ file, totalPreguntas: totalPreguntasNumero });
      const duplicadosEnHistorial = detectarMatriculasDuplicadas(
        reportes,
        resultado.filas.map((fila) => fila.estudianteMatricula)
      );
      setImportacionEstado({
        ...resultado,
        duplicadosEnHistorial,
        error: ''
      });
    } catch (error) {
      setImportacionEstado((previo) => ({
        ...previo,
        error: error?.message || 'No se pudo importar el archivo.'
      }));
    }
  };

  const actualizarRespuesta = (indice, valor) => {
    setRespuestasLista((previo) => {
      const longitud = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(previo.length, indice + 1);
      const copia = Array.from({ length: longitud }, (_, i) => previo[i] || { respuesta: '', confianza: null, fuenteLinea: '' });
      copia[indice] = {
        ...copia[indice],
        respuesta: valor,
        confianza: null,
        fuenteLinea: 'Ajuste manual'
      };
      return copia;
    });
  };

  const actualizarOverrideDocente = (numeroPregunta, valor) => {
    setOverridesDocente((previo) => ({
      ...previo,
      [numeroPregunta]: valor
    }));
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
      if (!totalPreguntasNumero || totalPreguntasNumero <= 0) nuevosErrores.totalPreguntas = 'Ingrese un total de preguntas válido.';
      if (!claveLimpia) nuevosErrores.claveRespuestas = 'La clave de respuestas es obligatoria.';
      if (claveLimpia && claveLimpia.length !== totalPreguntasNumero) {
        nuevosErrores.claveRespuestas = 'La clave debe tener el mismo largo que el total de preguntas.';
      }
    }

    if (indice === 1) {
      if (!respuestasLimpias) nuevosErrores.respuestasEstudiante = 'Debe cargar o transcribir respuestas válidas del estudiante (A, B, C o D).';
      if (datos.modoIngreso === 'imagen' && !datos.archivoImagen) nuevosErrores.archivoImagen = 'Debe seleccionar una imagen de respuestas.';
    }

    if (indice === 3) {
      if (!decisionFinal.puntuacion || !decisionFinal.justificacion.trim()) {
        nuevosErrores.decisionFinal = 'Debe registrar puntuación y justificación final de la profesora.';
      }
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const procesarImagenConOCR = async () => {
    if (!datos.archivoImagen) return;

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
    setIaEstado((previo) => ({ ...previo, cargando: true, error: '', sugerencia: null }));
    try {
      const sugerencia = await sugerirCalificacionIA({ datos, puntaje: resultadoRevision.puntaje });
      setIaEstado((previo) => ({
        ...previo,
        cargando: false,
        error: '',
        sugerencia,
        proveedorActivo: sugerencia.proveedor || previo.proveedorActivo,
        modeloActivo: sugerencia.modelo || previo.modeloActivo
      }));
      setDecisionFinal(sugerencia);
      setErrores((previo) => ({ ...previo, decisionFinal: '' }));
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        setErrorSesionUi(error.message || 'Tu sesión no es válida para esta operación.');
      }

      setIaEstado((previo) => ({
        ...previo,
        cargando: false,
        error: error?.message || 'No se pudo obtener sugerencia de IA.',
        sugerencia: null
      }));
    }
  };

  const obtenerMateriaCanonica = (materiaCruda) => {
    const materiaNormalizada = normalizarNombreMateria(materiaCruda);
    const materiaExistente = reportes.find((rep) => rep.organizacion?.materiaNormalizada === materiaNormalizada);
    return materiaExistente?.examen.materia || materiaCruda.trim().replace(/\s+/g, ' ');
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
    justificacionesIA: desglosePreguntas.map((item) => ({
      pregunta: item.numero,
      justificacion: item.justificacionIA,
      desglose: item.desglose
    })),
    calificacionFinal: {
      notaSobre100: notaFinalNumerica,
      letra: letraFinal,
      justificacionDocente: decisionFinal.justificacion
    }
  });

  const guardarReporte = async () => {
    if (!validarPaso(3)) return;

    const reporteGuardadoPrevio = reporteActualRef.id ? reportes.find((rep) => rep.id === reporteActualRef.id) : null;
    const reporte = generarReporteActual({ id: reporteGuardadoPrevio?.id, creadoEn: reporteGuardadoPrevio?.creadoEn });

    try {
      const guardado = await guardarReportePersistente(reporte);
      setErrorSesionUi('');
      setReporteActualRef({ id: guardado.id, firma: firmaReporteActual });
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        setErrorSesionUi(error.message || 'Tu sesión no es válida para guardar reportes.');
      }
    }
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

  const exportarCarpetaMateriaCSV = (materiaFolderId) => {
    const reportesCarpeta = reportesFiltrados.filter((rep) => rep.organizacion?.materiaFolderId === materiaFolderId);
    exportarGrupoCSV(reportesCarpeta);
  };

  const textoManual = respuestasLimpias;
  const totalFilasTabla = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(respuestasLista.length, 1);

  return (
    <main className="contenedor">
      <TopBar panelAjustesAbierto={panelAjustesAbierto} onToggleAjustes={() => setPanelAjustesAbierto((previo) => !previo)} />

      {panelAjustesAbierto && (
        <section className="panel ajustes">
          <h2>Ajustes</h2>
          <p className="detalle">
            Proveedor IA activo: <strong>{iaEstado.proveedorActivo}</strong> ({iaEstado.modeloActivo}).
            Timeout backend: {iaEstado.timeoutMs > 0 ? `${Math.round(iaEstado.timeoutMs / 1000)}s` : 'N/D'}.
          </p>
          <p className="detalle">La integración de IA usa un endpoint backend interno. Las API keys se gestionan solo en el servidor.</p>
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
            rubricas={rubricas}
            rubricaSeleccionadaId={rubricaSeleccionadaId}
            onSeleccionarRubrica={seleccionarRubrica}
            estadoRubricas={estadoRubricas}
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
            importacionEstado={importacionEstado}
            onArchivoImportacion={importarArchivoRespuestas}
            onAplicarFilaImportada={aplicarFilaImportada}
          />
        )}

        {pasoActual === 2 && (
          <StepRevision
            resultadoRevision={resultadoRevision}
            mapearLetraPucmm={mapearLetraPucmm}
            sugerirCalificacionConIA={sugerirCalificacionConIA}
            iaEstado={iaEstado}
            desglosePreguntas={desglosePreguntas}
            overridesDocente={overridesDocente}
            onOverrideDocente={actualizarOverrideDocente}
          />
        )}

        {pasoActual === 3 && (
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
            errorSesion={errorSesionUi || errorSesionReportes}
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
