import { useEffect, useMemo, useState } from "react";
import TopBar from "./components/TopBar";
import StepIndicator from "./components/StepIndicator";
import StepConfiguracion from "./features/exam-workflow/StepConfiguracion";
import StepIngresoRespuestas from "./features/exam-workflow/StepIngresoRespuestas";
import StepReporteFinal from "./features/exam-workflow/StepReporteFinal";
import StepRevision from "./features/exam-workflow/StepRevision";
import { useExamWorkflow } from "./hooks/useExamWorkflow";
import { useReportes } from "./hooks/useReportes";
import {
  obtenerProveedorIA,
  sugerirCalificacionIA,
} from "./services/aiService";
import {
  exportarGrupoCSV,
  exportarIndividualCSV,
  exportarIndividualPDF,
  exportarOperacionesImportacionCSV,
} from "./services/exportService";
import { procesarImagenOCR } from "./services/ocrService";
import {
  parsearArchivoImportacion,
  parsearTextoImportacion,
} from "./services/importService";
import {
  guardarDecisionFinal,
  leerDecisionFinal,
  normalizarNombreMateria,
} from "./services/storageService";
import {
  convertirTextoALista,
  letrasValidas,
  limpiarRespuestas,
  obtenerRespuestaTexto,
  REGLAS_NORMALIZACION_VERSION,
  mapearLetraPucmm,
} from "./utils/examUtils";
import { crearDesglosePregunta } from "./utils/questionBreakdown";
import { detectarMatriculasDuplicadas } from "./hooks/useReportes";
import { construirClaveDesdeCriterios } from "./features/rubrics/rubricModel";
import { calcularPuntajeRubrica } from "./utils/rubricScoring";

const pasos = [
  "Configuración del examen",
  "Ingreso de respuestas",
  "Revisión de calificaciones",
  "Reporte final y exportación",
];

const UMBRAL_BAJA_CONFIANZA = 65;
const ESTRATEGIAS_CONFLICTO_IMPORTACION = {
  OMITIR_EXISTENTES: "omitir_existentes",
  SOBRESCRIBIR_POR_MATRICULA: "sobrescribir_por_matricula",
  CREAR_SOLO_NUEVOS: "crear_solo_nuevos",
};

const formularioInicial = {
  materia: "",
  grupo: "",
  periodo: "",
  fecha: "",
  estudianteNombre: "",
  estudianteMatricula: "",
  totalPreguntas: "",
  claveRespuestas: "",
  modoIngreso: "transcripcion",
  archivoImagen: null,
};

function App() {
  const [datos, setDatos] = useState(formularioInicial);
  const [errores, setErrores] = useState({});
  const [respuestasLista, setRespuestasLista] = useState([]);
  const [panelAjustesAbierto, setPanelAjustesAbierto] = useState(false);
  const [ocrEstado, setOcrEstado] = useState({
    procesando: false,
    progreso: 0,
    error: "",
    textoDetectado: "",
  });
  const [decisionFinal, setDecisionFinal] = useState(() => leerDecisionFinal());
  const [iaEstado, setIaEstado] = useState({
    cargando: false,
    error: "",
    sugerencia: null,
    proveedorActivo: "desconocido",
    modeloActivo: "desconocido",
    timeoutMs: 0,
  });
  const [reporteActualRef, setReporteActualRef] = useState({
    id: null,
    firma: null,
  });
  const [errorSesionUi, setErrorSesionUi] = useState("");
  const [overridesDocente, setOverridesDocente] = useState({});
  const [checklistRevisionBajaConfianza, setChecklistRevisionBajaConfianza] =
    useState({});
  const [importacionEstado, setImportacionEstado] = useState({
    filas: [],
    errores: [],
    duplicados: [],
    duplicadosEnHistorial: [],
    resumen: null,
    contrato: null,
    error: "",
  });
  const [resumenRegistroLote, setResumenRegistroLote] = useState(null);
  const [estrategiaConflictoImportacion, setEstrategiaConflictoImportacion] =
    useState(ESTRATEGIAS_CONFLICTO_IMPORTACION.OMITIR_EXISTENTES);

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
    seleccionarRubrica,
    rosters,
    rosterSeleccionadoId,
    estadoRosters,
    cargarRosters,
    seleccionarRoster,
  } = useExamWorkflow(pasos);
  const {
    reportes,
    guardarReporte: guardarReportePersistente,
    filtrosHistorial,
    setFiltrosHistorial,
    reportesFiltrados,
    reportesAgrupadosPorMateria,
    errorSesion: errorSesionReportes,
    operacionesImportacion,
    guardarOperacionImportacion,
  } = useReportes();

  useEffect(() => {
    guardarDecisionFinal(decisionFinal);
  }, [decisionFinal]);

  useEffect(() => {
    const cargarProveedor = async () => {
      try {
        const proveedor = await obtenerProveedorIA();
        setErrorSesionUi("");
        setIaEstado((previo) => ({
          ...previo,
          proveedorActivo: proveedor.proveedor,
          modeloActivo: proveedor.modelo,
          timeoutMs: proveedor.timeoutMs,
          error: "",
        }));
      } catch (error) {
        setIaEstado((previo) => ({
          ...previo,
          error:
            error?.message ||
            "No se pudo obtener la configuración del proveedor de IA activo.",
        }));
      }
    };

    cargarProveedor();
  }, []);

  useEffect(() => {
    cargarRubricas();
  }, [cargarRubricas]);

  useEffect(() => {
    cargarRosters({
      group: datos.grupo.trim(),
      term: datos.periodo?.trim() || "",
    });
  }, [cargarRosters, datos.grupo, datos.periodo]);

  const [estudiantesRoster, setEstudiantesRoster] = useState([]);
  const [estudianteRosterSeleccionado, setEstudianteRosterSeleccionado] =
    useState("");

  useEffect(() => {
    const cargarDetalleRoster = async () => {
      if (!rosterSeleccionadoId) {
        setEstudiantesRoster([]);
        setEstudianteRosterSeleccionado("");
        return;
      }
      try {
        const response = await fetch(
          `/api/rosters/${encodeURIComponent(rosterSeleccionadoId)}`,
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(
            payload?.error?.message ||
              "No se pudo cargar la lista seleccionada.",
          );
        }
        setEstudiantesRoster(
          Array.isArray(payload?.data?.students) ? payload.data.students : [],
        );
      } catch {
        setEstudiantesRoster([]);
      }
      setEstudianteRosterSeleccionado("");
    };

    cargarDetalleRoster();
  }, [rosterSeleccionadoId]);

  useEffect(() => {
    if (!rubricaSeleccionada) return;

    const claveSugerida = construirClaveDesdeCriterios(
      rubricaSeleccionada.criterios,
    );
    setDatos((previo) => ({
      ...previo,
      materia: rubricaSeleccionada.materia,
      totalPreguntas: String(rubricaSeleccionada.criterios.length),
      claveRespuestas: claveSugerida,
    }));
    setRespuestasLista((previo) =>
      convertirTextoALista(previo, rubricaSeleccionada.criterios.length),
    );
  }, [rubricaSeleccionada]);

  const totalPreguntasNumero = Number(datos.totalPreguntas);

  const puntosPorPregunta = useMemo(() => {
    if (!totalPreguntasNumero || totalPreguntasNumero <= 0) return 0;
    return 100 / totalPreguntasNumero;
  }, [totalPreguntasNumero]);

  const claveLimpia = useMemo(
    () => limpiarRespuestas(datos.claveRespuestas),
    [datos.claveRespuestas],
  );
  const respuestasLimpias = useMemo(
    () => limpiarRespuestas(respuestasLista),
    [respuestasLista],
  );

  const desgloseBase = useMemo(() => {
    const total =
      totalPreguntasNumero > 0
        ? totalPreguntasNumero
        : Math.max(claveLimpia.length, respuestasLimpias.length);
    return Array.from({ length: total }, (_, indice) =>
      crearDesglosePregunta({
        numero: indice + 1,
        respuestaCorrecta: claveLimpia[indice] || "",
        respuestaData: respuestasLista[indice] || {},
        puntosPorPregunta,
        umbralBajaConfianza: UMBRAL_BAJA_CONFIANZA,
      }),
    );
  }, [
    claveLimpia,
    puntosPorPregunta,
    respuestasLimpias.length,
    respuestasLista,
    totalPreguntasNumero,
  ]);

  const desglosePreguntas = useMemo(
    () =>
      calcularPuntajeRubrica({
        desgloseBase,
        rubrica: rubricaSeleccionada,
        overridesDocente,
      }),
    [desgloseBase, overridesDocente, rubricaSeleccionada],
  );

  const resultadoRevision = useMemo(() => {
    const aciertos = desglosePreguntas.filter((item) => item.correcta).length;
    const total = desglosePreguntas.length;
    return {
      aciertos,
      errores: total - aciertos,
      porcentaje: total > 0 ? (aciertos / total) * 100 : 0,
      puntaje: desglosePreguntas.reduce((acc, item) => acc + item.puntaje, 0),
    };
  }, [desglosePreguntas]);

  const preguntasBajaConfianza = useMemo(
    () =>
      desglosePreguntas.filter(
        (item) => item.bajaConfianza && typeof item.confianzaOCR === "number",
      ),
    [desglosePreguntas],
  );

  const estaBajaConfianzaRevisada = (numeroPregunta) => {
    if (checklistRevisionBajaConfianza[numeroPregunta]) {
      return true;
    }
    const override = overridesDocente[numeroPregunta];
    return override !== undefined && String(override).trim() !== "";
  };

  const resumenBajaConfianzaRevision = useMemo(() => {
    const total = preguntasBajaConfianza.length;
    const revisadas = preguntasBajaConfianza.filter((item) =>
      estaBajaConfianzaRevisada(item.numero),
    ).length;
    return {
      total,
      revisadas,
      pendientes: Math.max(total - revisadas, 0),
    };
  }, [checklistRevisionBajaConfianza, overridesDocente, preguntasBajaConfianza]);

  useEffect(() => {
    if (preguntasBajaConfianza.length === 0) {
      setChecklistRevisionBajaConfianza({});
      return;
    }

    const numerosActuales = new Set(
      preguntasBajaConfianza.map((item) => item.numero),
    );
    setChecklistRevisionBajaConfianza((previo) => {
      const siguiente = {};
      Object.entries(previo).forEach(([numero, valor]) => {
        if (numerosActuales.has(Number(numero))) {
          siguiente[numero] = valor;
        }
      });
      return siguiente;
    });
  }, [preguntasBajaConfianza]);

  const notaFinalNumerica = Number(
    decisionFinal.puntuacion || resultadoRevision.puntaje || 0,
  );
  const letraFinal = mapearLetraPucmm(notaFinalNumerica);

  const firmaReporteActual = useMemo(
    () =>
      JSON.stringify({
        examen: {
          materia: datos.materia,
          grupo: datos.grupo,
          fecha: datos.fecha,
          totalPreguntas: totalPreguntasNumero,
          claveRespuestas: claveLimpia,
        },
        estudiante: {
          nombre: datos.estudianteNombre,
          matricula: datos.estudianteMatricula,
        },
        respuestas: respuestasLimpias,
        puntuacionPorPregunta: desglosePreguntas,
        calificacionFinal: {
          notaSobre100: notaFinalNumerica,
          letra: letraFinal,
          justificacionDocente: decisionFinal.justificacion,
        },
      }),
    [
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
      totalPreguntasNumero,
    ],
  );

  const reporteActualGuardado =
    reporteActualRef.id !== null &&
    reporteActualRef.firma === firmaReporteActual;

  const estadisticasGrupo = useMemo(() => {
    const distribucion = { A: 0, "B+": 0, B: 0, "C+": 0, C: 0, D: 0, F: 0 };
    reportesFiltrados.forEach((rep) => {
      distribucion[rep.calificacionFinal.letra] += 1;
    });
    return distribucion;
  }, [reportesFiltrados]);

  const actualizarDato = (campo, valor) =>
    setDatos((previo) => ({ ...previo, [campo]: valor }));

  const aplicarFilaImportada = (fila) => {
    actualizarDato("estudianteNombre", fila.estudianteNombre);
    actualizarDato("estudianteMatricula", fila.estudianteMatricula);
    setRespuestasLista(fila.respuestasLista);
    setErrores((previo) => ({ ...previo, respuestasEstudiante: "" }));
  };

  const seleccionarEstudianteDesdeRoster = (studentId) => {
    setEstudianteRosterSeleccionado(studentId);
    const student = estudiantesRoster.find(
      (item) => String(item.id || item.matricula) === String(studentId),
    );
    if (!student) {
      return;
    }
    actualizarDato("estudianteNombre", student.nombre || "");
    actualizarDato("estudianteMatricula", student.matricula || "");
  };

  const calcularDesgloseParaRespuestas = (listaRespuestas) => {
    const respuestasTexto = limpiarRespuestas(listaRespuestas);
    const total =
      totalPreguntasNumero > 0
        ? totalPreguntasNumero
        : Math.max(claveLimpia.length, respuestasTexto.length);
    const desgloseBaseFila = Array.from({ length: total }, (_, indice) =>
      crearDesglosePregunta({
        numero: indice + 1,
        respuestaCorrecta: claveLimpia[indice] || "",
        respuestaData: listaRespuestas[indice] || {},
        puntosPorPregunta,
        umbralBajaConfianza: UMBRAL_BAJA_CONFIANZA,
      }),
    );

    return calcularPuntajeRubrica({
      desgloseBase: desgloseBaseFila,
      rubrica: rubricaSeleccionada,
      overridesDocente,
    });
  };

  const generarReporteDesdeFilaImportada = (fila, meta = {}) => {
    const desgloseFila = calcularDesgloseParaRespuestas(fila.respuestasLista);
    const puntajeFila = desgloseFila.reduce(
      (acc, item) => acc + item.puntaje,
      0,
    );
    const letraFila = mapearLetraPucmm(puntajeFila);

    return {
      id: meta.id || crypto.randomUUID(),
      creadoEn: meta.creadoEn || new Date().toISOString(),
      examen: {
        materia: obtenerMateriaCanonica(datos.materia),
        grupo: datos.grupo,
        fecha: datos.fecha,
        totalPreguntas: totalPreguntasNumero,
        claveRespuestas: claveLimpia,
      },
      estudiante: {
        nombre: fila.estudianteNombre,
        matricula: fila.estudianteMatricula,
      },
      respuestas: {
        lista: fila.respuestasLista,
        texto: limpiarRespuestas(fila.respuestasLista),
      },
      ocrTrazabilidad: fila.respuestasLista.map((respuestaData, indice) => ({
        pregunta: indice + 1,
        ocrOriginalGuess:
          String(respuestaData?.ocrOriginalGuess || "").trim() ||
          obtenerRespuestaTexto(respuestaData),
        ocrOriginalConfidence:
          typeof respuestaData?.ocrOriginalConfidence === "number"
            ? respuestaData.ocrOriginalConfidence
            : typeof respuestaData?.confianza === "number"
              ? respuestaData.confianza
              : null,
        finalConfirmedAnswer: obtenerRespuestaTexto(respuestaData),
        reglasNormalizacionVersion:
          respuestaData?.reglasNormalizacionVersion ||
          REGLAS_NORMALIZACION_VERSION,
      })),
      puntuacionPorPregunta: desgloseFila,
      justificacionesIA: desgloseFila.map((item) => ({
        pregunta: item.numero,
        justificacion: item.justificacionIA,
        desglose: item.desglose,
      })),
      calificacionFinal: {
        notaSobre100: puntajeFila,
        letra: letraFila,
        justificacionDocente:
          decisionFinal.justificacion ||
          "Registro automático desde importación por lote.",
      },
    };
  };

  const importarArchivoRespuestas = async (file) => {
    setResumenRegistroLote(null);
    if (!file) {
      setImportacionEstado((previo) => ({
        ...previo,
        error: "",
        filas: [],
        errores: [],
        resumen: null,
        duplicados: [],
        duplicadosEnHistorial: [],
      }));
      return;
    }

    try {
      const resultado = await parsearArchivoImportacion({
        file,
        totalPreguntas: totalPreguntasNumero,
      });
      const duplicadosEnHistorial = detectarMatriculasDuplicadas(
        reportes,
        resultado.filas.map((fila) => fila.estudianteMatricula),
      );
      setImportacionEstado({
        ...resultado,
        duplicadosEnHistorial,
        error: "",
      });
      setEstrategiaConflictoImportacion(
        ESTRATEGIAS_CONFLICTO_IMPORTACION.OMITIR_EXISTENTES,
      );
    } catch (error) {
      setImportacionEstado((previo) => ({
        ...previo,
        error: error?.message || "No se pudo importar el archivo.",
      }));
    }
  };

  const importarTextoRespuestas = async (text) => {
    setResumenRegistroLote(null);

    try {
      const resultado = await parsearTextoImportacion({
        text,
        totalPreguntas: totalPreguntasNumero,
      });
      const duplicadosEnHistorial = detectarMatriculasDuplicadas(
        reportes,
        resultado.filas.map((fila) => fila.estudianteMatricula),
      );
      setImportacionEstado({
        ...resultado,
        duplicadosEnHistorial,
        error: "",
      });
      setEstrategiaConflictoImportacion(
        ESTRATEGIAS_CONFLICTO_IMPORTACION.OMITIR_EXISTENTES,
      );
    } catch (error) {
      setImportacionEstado((previo) => ({
        ...previo,
        error: error?.message || "No se pudo importar el texto pegado.",
      }));
    }
  };

  const registrarFilasImportadas = async (filasSeleccionadas = null) => {
    const filasObjetivo = Array.isArray(filasSeleccionadas)
      ? filasSeleccionadas
      : importacionEstado.filas;
    if (!filasObjetivo.length || !validarPaso(0)) return;

    const estadisticas = {
      creados: 0,
      actualizados: 0,
      omitidos: 0,
      fallidos: 0,
    };
    const procesadasEnLote = new Set();
    const existentesPorMatricula = new Map(
      reportes
        .filter(
          (reporte) =>
            reporte.examen?.materia === obtenerMateriaCanonica(datos.materia),
        )
        .map((reporte) => [
          String(reporte?.estudiante?.matricula || "").trim(),
          reporte,
        ]),
    );
    const matriculasAfectadas = [];

    for (const fila of filasObjetivo) {
      const matricula = String(fila?.estudianteMatricula || "").trim();
      if (!matricula || procesadasEnLote.has(matricula)) {
        estadisticas.omitidos += 1;
        continue;
      }

      procesadasEnLote.add(matricula);
      const previo = existentesPorMatricula.get(matricula);
      if (
        estrategiaConflictoImportacion ===
          ESTRATEGIAS_CONFLICTO_IMPORTACION.CREAR_SOLO_NUEVOS &&
        previo
      ) {
        continue;
      }
      if (
        estrategiaConflictoImportacion ===
          ESTRATEGIAS_CONFLICTO_IMPORTACION.OMITIR_EXISTENTES &&
        previo
      ) {
        estadisticas.omitidos += 1;
        continue;
      }
      const reporte = generarReporteDesdeFilaImportada(fila, {
        id:
          estrategiaConflictoImportacion ===
          ESTRATEGIAS_CONFLICTO_IMPORTACION.SOBRESCRIBIR_POR_MATRICULA
            ? previo?.id
            : undefined,
        creadoEn: previo?.creadoEn,
      });

      try {
        await guardarReportePersistente(reporte);
        setErrorSesionUi("");
        if (
          previo &&
          estrategiaConflictoImportacion ===
            ESTRATEGIAS_CONFLICTO_IMPORTACION.SOBRESCRIBIR_POR_MATRICULA
        ) {
          estadisticas.actualizados += 1;
        } else {
          estadisticas.creados += 1;
        }
        matriculasAfectadas.push(matricula);
      } catch {
        estadisticas.fallidos += 1;
      }
    }

    setResumenRegistroLote(estadisticas);
    guardarOperacionImportacion({
      timestamp: new Date().toISOString(),
      strategy: estrategiaConflictoImportacion,
      affectedMatriculas: matriculasAfectadas,
    });
  };

  const resumenEstrategiaImportacion = useMemo(() => {
    const filas = importacionEstado.filas || [];
    const materiaNormalizada = normalizarNombreMateria(datos.materia);
    const existentes = new Set(
      reportes
        .filter(
          (reporte) =>
            normalizarNombreMateria(reporte.examen?.materia) ===
            materiaNormalizada,
        )
        .map((reporte) => String(reporte?.estudiante?.matricula || "").trim())
        .filter(Boolean),
    );

    const unicas = Array.from(
      new Set(
        filas
          .map((fila) => String(fila?.estudianteMatricula || "").trim())
          .filter(Boolean),
      ),
    );
    const existentesEnImportacion = unicas.filter((matricula) =>
      existentes.has(matricula),
    ).length;
    const nuevos = unicas.length - existentesEnImportacion;

    if (
      estrategiaConflictoImportacion ===
      ESTRATEGIAS_CONFLICTO_IMPORTACION.SOBRESCRIBIR_POR_MATRICULA
    ) {
      return {
        creados: nuevos,
        actualizados: existentesEnImportacion,
        omitidos: 0,
      };
    }
    if (
      estrategiaConflictoImportacion ===
      ESTRATEGIAS_CONFLICTO_IMPORTACION.CREAR_SOLO_NUEVOS
    ) {
      return {
        creados: nuevos,
        actualizados: 0,
        omitidos: 0,
      };
    }

    return {
      creados: nuevos,
      actualizados: 0,
      omitidos: existentesEnImportacion,
    };
  }, [
    datos.materia,
    estrategiaConflictoImportacion,
    importacionEstado.filas,
    reportes,
  ]);

  const actualizarRespuesta = (indice, valor) => {
    setRespuestasLista((previo) => {
      const longitud =
        totalPreguntasNumero > 0
          ? totalPreguntasNumero
          : Math.max(previo.length, indice + 1);
      const copia = Array.from(
        { length: longitud },
        (_, i) =>
          previo[i] || { respuesta: "", confianza: null, fuenteLinea: "" },
      );
      copia[indice] = {
        ...copia[indice],
        respuesta: valor,
        confianza: null,
        fuenteLinea: "Ajuste manual",
      };
      return copia;
    });
  };

  const actualizarOverrideDocente = (numeroPregunta, valor) => {
    setOverridesDocente((previo) => ({
      ...previo,
      [numeroPregunta]: valor,
    }));
  };

  const confirmarRevisionBajaConfianza = (numeroPregunta) => {
    setChecklistRevisionBajaConfianza((previo) => ({
      ...previo,
      [numeroPregunta]: true,
    }));
    setErrores((previo) => ({ ...previo, revisionBajaConfianza: "" }));
  };

  const validarPaso = (indice) => {
    const nuevosErrores = {};

    if (indice === 0) {
      const materiaNormalizada = normalizarNombreMateria(datos.materia);
      if (!materiaNormalizada)
        nuevosErrores.materia = "La materia es obligatoria.";
      if (!datos.grupo.trim()) nuevosErrores.grupo = "El grupo es obligatorio.";
      if (!datos.fecha) nuevosErrores.fecha = "La fecha es obligatoria.";
      if (!datos.estudianteNombre.trim())
        nuevosErrores.estudianteNombre =
          "El nombre del estudiante es obligatorio.";
      if (!datos.estudianteMatricula.trim())
        nuevosErrores.estudianteMatricula =
          "La matrícula del estudiante es obligatoria.";
      if (!totalPreguntasNumero || totalPreguntasNumero <= 0)
        nuevosErrores.totalPreguntas = "Ingrese un total de preguntas válido.";
      if (!claveLimpia)
        nuevosErrores.claveRespuestas =
          "La clave de respuestas es obligatoria.";
      if (claveLimpia && claveLimpia.length !== totalPreguntasNumero) {
        nuevosErrores.claveRespuestas =
          "La clave debe tener el mismo largo que el total de preguntas.";
      }
    }

    if (indice === 1) {
      if (!respuestasLimpias)
        nuevosErrores.respuestasEstudiante =
          "Debe cargar o transcribir respuestas válidas del estudiante (A, B, C o D).";
      if (datos.modoIngreso === "imagen" && !datos.archivoImagen)
        nuevosErrores.archivoImagen =
          "Debe seleccionar una imagen de respuestas.";
    }

    if (indice === 3) {
      if (resumenBajaConfianzaRevision.pendientes > 0) {
        nuevosErrores.revisionBajaConfianza =
          "Debe confirmar o editar cada pregunta de baja confianza antes de guardar/exportar.";
      }
      if (!decisionFinal.puntuacion || !decisionFinal.justificacion.trim()) {
        nuevosErrores.decisionFinal =
          "Debe registrar puntuación y justificación final de la profesora.";
      }
    }

    if (indice === 2 && resumenBajaConfianzaRevision.pendientes > 0) {
      nuevosErrores.revisionBajaConfianza =
        "Debe confirmar o editar cada pregunta de baja confianza antes de continuar.";
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const procesarImagenConOCR = async () => {
    if (!datos.archivoImagen) return;

    setOcrEstado({
      procesando: true,
      progreso: 0,
      error: "",
      textoDetectado: "",
    });
    try {
      const { textoDetectado, respuestasParseadas } = await procesarImagenOCR({
        archivoImagen: datos.archivoImagen,
        totalPreguntas: totalPreguntasNumero,
        onProgress: (progreso) =>
          setOcrEstado((previo) => ({ ...previo, progreso })),
      });
      setRespuestasLista(respuestasParseadas);
      setOcrEstado({
        procesando: false,
        progreso: 100,
        error: "",
        textoDetectado,
      });
    } catch (error) {
      setOcrEstado({
        procesando: false,
        progreso: 0,
        error: error?.message || "No se pudo procesar la imagen.",
        textoDetectado: "",
      });
    }
  };

  const sugerirCalificacionConIA = async () => {
    setIaEstado((previo) => ({
      ...previo,
      cargando: true,
      error: "",
      sugerencia: null,
    }));
    try {
      const sugerencia = await sugerirCalificacionIA({
        datos,
        puntaje: resultadoRevision.puntaje,
      });
      setIaEstado((previo) => ({
        ...previo,
        cargando: false,
        error: "",
        sugerencia,
        proveedorActivo: sugerencia.proveedor || previo.proveedorActivo,
        modeloActivo: sugerencia.modelo || previo.modeloActivo,
      }));
      setDecisionFinal(sugerencia);
      setErrores((previo) => ({ ...previo, decisionFinal: "" }));
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        setErrorSesionUi(
          error.message || "Tu sesión no es válida para esta operación.",
        );
      }

      setIaEstado((previo) => ({
        ...previo,
        cargando: false,
        error: error?.message || "No se pudo obtener sugerencia de IA.",
        sugerencia: null,
      }));
    }
  };

  const obtenerMateriaCanonica = (materiaCruda) => {
    const materiaNormalizada = normalizarNombreMateria(materiaCruda);
    const materiaExistente = reportes.find(
      (rep) => rep.organizacion?.materiaNormalizada === materiaNormalizada,
    );
    return (
      materiaExistente?.examen.materia ||
      materiaCruda.trim().replace(/\s+/g, " ")
    );
  };

  const generarReporteActual = (meta = {}) => ({
    id: meta.id || crypto.randomUUID(),
    creadoEn: meta.creadoEn || new Date().toISOString(),
    examen: {
      materia: obtenerMateriaCanonica(datos.materia),
      grupo: datos.grupo,
      fecha: datos.fecha,
      totalPreguntas: totalPreguntasNumero,
      claveRespuestas: claveLimpia,
    },
    estudiante: {
      nombre: datos.estudianteNombre,
      matricula: datos.estudianteMatricula,
    },
    respuestas: { lista: respuestasLista, texto: respuestasLimpias },
    ocrTrazabilidad: respuestasLista.map((respuestaData, indice) => ({
      pregunta: indice + 1,
      ocrOriginalGuess:
        String(respuestaData?.ocrOriginalGuess || "").trim() ||
        obtenerRespuestaTexto(respuestaData),
      ocrOriginalConfidence:
        typeof respuestaData?.ocrOriginalConfidence === "number"
          ? respuestaData.ocrOriginalConfidence
          : typeof respuestaData?.confianza === "number"
            ? respuestaData.confianza
            : null,
      finalConfirmedAnswer: obtenerRespuestaTexto(respuestaData),
      reglasNormalizacionVersion:
        respuestaData?.reglasNormalizacionVersion || REGLAS_NORMALIZACION_VERSION,
    })),
    puntuacionPorPregunta: desglosePreguntas,
    justificacionesIA: desglosePreguntas.map((item) => ({
      pregunta: item.numero,
      justificacion: item.justificacionIA,
      desglose: item.desglose,
    })),
    calificacionFinal: {
      notaSobre100: notaFinalNumerica,
      letra: letraFinal,
      justificacionDocente: decisionFinal.justificacion,
    },
  });

  const guardarReporte = async () => {
    if (!validarPaso(3)) return;

    const reporteGuardadoPrevio = reporteActualRef.id
      ? reportes.find((rep) => rep.id === reporteActualRef.id)
      : null;
    const reporte = generarReporteActual({
      id: reporteGuardadoPrevio?.id,
      creadoEn: reporteGuardadoPrevio?.creadoEn,
    });

    try {
      const guardado = await guardarReportePersistente(reporte);
      setErrorSesionUi("");
      setReporteActualRef({ id: guardado.id, firma: firmaReporteActual });
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        setErrorSesionUi(
          error.message || "Tu sesión no es válida para guardar reportes.",
        );
      }
    }
  };

  const exportarReporteActual = (tipo) => {
    if (!validarPaso(3)) return;

    const reportePersistido =
      reporteActualGuardado && reporteActualRef.id
        ? reportes.find((rep) => rep.id === reporteActualRef.id)
        : null;
    const reporte = reportePersistido || generarReporteActual();

    if (tipo === "pdf") exportarIndividualPDF(reporte);
    if (tipo === "csv") exportarIndividualCSV(reporte);
  };

  const exportarCarpetaMateriaCSV = (materiaFolderId) => {
    const reportesCarpeta = reportesFiltrados.filter(
      (rep) => rep.organizacion?.materiaFolderId === materiaFolderId,
    );
    exportarGrupoCSV(reportesCarpeta);
  };

  const exportarOperacionesImportacion = () => {
    exportarOperacionesImportacionCSV(operacionesImportacion);
  };

  const textoManual = respuestasLimpias;
  const totalFilasTabla =
    totalPreguntasNumero > 0
      ? totalPreguntasNumero
      : Math.max(respuestasLista.length, 1);

  return (
    <main className="contenedor">
      <TopBar
        panelAjustesAbierto={panelAjustesAbierto}
        onToggleAjustes={() => setPanelAjustesAbierto((previo) => !previo)}
      />

      {panelAjustesAbierto && (
        <section className="panel ajustes">
          <h2>Ajustes</h2>
          <p className="detalle">
            Proveedor IA activo: <strong>{iaEstado.proveedorActivo}</strong> (
            {iaEstado.modeloActivo}). Timeout backend:{" "}
            {iaEstado.timeoutMs > 0
              ? `${Math.round(iaEstado.timeoutMs / 1000)}s`
              : "N/D"}
            .
          </p>
          <p className="detalle">
            La integración de IA usa un endpoint backend interno. Las API keys
            se gestionan solo en el servidor.
          </p>
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
            rosters={rosters}
            rosterSeleccionadoId={rosterSeleccionadoId}
            onSeleccionarRoster={seleccionarRoster}
            estadoRosters={estadoRosters}
            estudiantesRoster={estudiantesRoster}
            estudianteRosterSeleccionado={estudianteRosterSeleccionado}
            onSeleccionarEstudianteRoster={seleccionarEstudianteDesdeRoster}
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
            onTextoImportacion={importarTextoRespuestas}
        onAplicarFilaImportada={aplicarFilaImportada}
        onRegistrarFilasImportadas={registrarFilasImportadas}
        resumenRegistroLote={resumenRegistroLote}
        estrategiaConflictoImportacion={estrategiaConflictoImportacion}
        onCambiarEstrategiaConflicto={setEstrategiaConflictoImportacion}
        resumenEstrategiaImportacion={resumenEstrategiaImportacion}
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
            checklistBajaConfianza={checklistRevisionBajaConfianza}
            onConfirmarRevisionBajaConfianza={confirmarRevisionBajaConfianza}
            onEditarRespuestaBajaConfianza={() => retrocederPaso(() => setErrores({}))}
            resumenBajaConfianzaRevision={resumenBajaConfianzaRevision}
            errorRevisionBajaConfianza={errores.revisionBajaConfianza}
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
            bloqueoRevisionBajaConfianza={resumenBajaConfianzaRevision.pendientes > 0}
            resumenBajaConfianzaRevision={resumenBajaConfianzaRevision}
            filtrosHistorial={filtrosHistorial}
            setFiltrosHistorial={setFiltrosHistorial}
            reportesFiltrados={reportesFiltrados}
            reportesAgrupadosPorMateria={reportesAgrupadosPorMateria}
            estadisticasGrupo={estadisticasGrupo}
            exportarGrupoCSV={() => exportarGrupoCSV(reportesFiltrados)}
        exportarCarpetaMateriaCSV={exportarCarpetaMateriaCSV}
        errorSesion={errorSesionUi || errorSesionReportes}
        operacionesImportacion={operacionesImportacion}
        exportarOperacionesImportacion={exportarOperacionesImportacion}
      />
        )}
      </section>

      {estadoActual.cargando && <p className="info">Procesando paso...</p>}

      <footer className="acciones">
        <button
          type="button"
          onClick={() => retrocederPaso(() => setErrores({}))}
          disabled={pasoActual === 0 || estadoActual.cargando}
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => avanzarPaso(validarPaso)}
          disabled={pasoActual === pasos.length - 1 || estadoActual.cargando}
        >
          {estadoActual.cargando ? "Cargando..." : "Siguiente"}
        </button>
      </footer>
    </main>
  );
}

export default App;
