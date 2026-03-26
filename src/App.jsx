import { useEffect, useMemo, useState } from 'react';
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
import { guardarDecisionFinal, leerDecisionFinal } from './services/storageService';
import {
  convertirTextoALista,
  letrasValidas,
  limpiarRespuestas,
  mapearLetraPucmm
} from './utils/examUtils';

const pasos = [
  'Configuración del examen',
  'Ingreso de respuestas',
  'Revisión de calificaciones',
  'Reporte final y exportación'
];

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
  const [ocrEstado, setOcrEstado] = useState({ procesando: false, progreso: 0, error: '', textoDetectado: '' });
  const [panelAjustesAbierto, setPanelAjustesAbierto] = useState(false);
  const [decisionFinal, setDecisionFinal] = useState(() => leerDecisionFinal());
  const [iaEstado, setIaEstado] = useState({ cargando: false, error: '', sugerencia: null });

  const { reportes, setReportes, filtrosHistorial, setFiltrosHistorial, reportesFiltrados } = useReportes();
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

  const respuestasLimpias = useMemo(() => limpiarRespuestas(respuestasLista.join('')), [respuestasLista]);

  const claveLimpia = useMemo(() => limpiarRespuestas(datos.claveRespuestas), [datos.claveRespuestas]);

  const desglosePreguntas = useMemo(() => {
    const total = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(claveLimpia.length, respuestasLimpias.length);
    return Array.from({ length: total }, (_, indice) => {
      const correcta = claveLimpia[indice] || '';
      const estudiante = respuestasLista[indice] || '';
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
          : 'No coincide con la clave oficial; requiere reforzar procedimiento y conceptos.'
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

  const estadisticasGrupo = useMemo(() => {
    const distribucion = { A: 0, 'B+': 0, B: 0, 'C+': 0, C: 0, D: 0, F: 0 };
    reportesFiltrados.forEach((rep) => { distribucion[rep.calificacionFinal.letra] += 1; });
    return distribucion;
  }, [reportesFiltrados]);

  const actualizarDato = (campo, valor) => setDatos((previo) => ({ ...previo, [campo]: valor }));

  const actualizarRespuesta = (indice, valor) => {
    setRespuestasLista((previo) => {
      const longitud = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(previo.length, indice + 1);
      const copia = Array.from({ length: longitud }, (_, i) => previo[i] || '');
      copia[indice] = valor;
      return copia;
    });
  };

  const validarPaso = (indice) => {
    const nuevosErrores = {};
    if (indice === 0) {
      if (!datos.materia.trim()) nuevosErrores.materia = 'La materia es obligatoria.';
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

  const generarReporteActual = () => {
    const reporte = {
      id: crypto.randomUUID(),
      creadoEn: new Date().toISOString(),
      examen: { materia: datos.materia, grupo: datos.grupo, fecha: datos.fecha, totalPreguntas: totalPreguntasNumero, claveRespuestas: claveLimpia },
      estudiante: { nombre: datos.estudianteNombre, matricula: datos.estudianteMatricula },
      respuestas: { lista: respuestasLista, texto: respuestasLimpias },
      puntuacionPorPregunta: desglosePreguntas,
      justificacionesIA: desglosePreguntas.map((item) => ({ pregunta: item.numero, justificacion: item.justificacionIA })),
      calificacionFinal: { notaSobre100: notaFinalNumerica, letra: letraFinal, justificacionDocente: decisionFinal.justificacion }
    };

    setReportes((previo) => [reporte, ...previo]);
    return reporte;
  };

  const guardarYExportar = (tipo) => {
    if (!validarPaso(3)) return;
    const reporte = generarReporteActual();
    if (tipo === 'pdf') exportarIndividualPDF(reporte);
    if (tipo === 'csv') exportarIndividualCSV(reporte);
  };

  const textoManual = respuestasLista.join('');
  const totalFilasTabla = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(respuestasLista.length, 1);

  return (
    <main className="contenedor">
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
          />
        )}
        {pasoActual === 2 && (
          <StepRevision
            resultadoRevision={resultadoRevision}
            mapearLetraPucmm={mapearLetraPucmm}
            sugerirCalificacionConIA={sugerirCalificacionConIA}
            iaEstado={iaEstado}
            desglosePreguntas={desglosePreguntas}
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
            guardarYExportar={guardarYExportar}
            filtrosHistorial={filtrosHistorial}
            setFiltrosHistorial={setFiltrosHistorial}
            reportesFiltrados={reportesFiltrados}
            estadisticasGrupo={estadisticasGrupo}
            exportarGrupoCSV={() => exportarGrupoCSV(reportesFiltrados)}
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
