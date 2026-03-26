import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import Tesseract from 'tesseract.js';

const pasos = [
  'Configuración del examen',
  'Ingreso de respuestas',
  'Revisión de calificaciones',
  'Reporte final y exportación'
];

const STORAGE_API_KEY = 'corrector_anthropic_api_key';
const STORAGE_DECISION_FINAL = 'corrector_decision_final';
const STORAGE_REPORTES = 'corrector_historial_reportes_v1';

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

const leerReportes = () => {
  const crudo = window.localStorage.getItem(STORAGE_REPORTES);
  if (!crudo) return [];
  try {
    const parseado = JSON.parse(crudo);
    return Array.isArray(parseado) ? parseado : [];
  } catch {
    return [];
  }
};

const mapearLetraPucmm = (nota) => {
  const n = Number(nota);
  if (n >= 90) return 'A';
  if (n >= 85) return 'B+';
  if (n >= 80) return 'B';
  if (n >= 75) return 'C+';
  if (n >= 70) return 'C';
  if (n >= 65) return 'D';
  return 'F';
};

const escaparCsv = (valor) => {
  const texto = String(valor ?? '');
  if (/[,"\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
};

const descargarArchivo = (contenido, nombre, tipo = 'text/plain;charset=utf-8;') => {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};

function App() {
  const [pasoActual, setPasoActual] = useState(0);
  const [datos, setDatos] = useState(formularioInicial);
  const [errores, setErrores] = useState({});
  const [estadoPaso, setEstadoPaso] = useState(
    pasos.map(() => ({ ...estadoAsyncInicial }))
  );
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
  const [reportes, setReportes] = useState(() => leerReportes());
  const [filtrosHistorial, setFiltrosHistorial] = useState({
    materia: '',
    grupo: '',
    fecha: ''
  });

  useEffect(() => {
    setApiKeyTemporal(leerApiKey());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_DECISION_FINAL, JSON.stringify(decisionFinal));
  }, [decisionFinal]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_REPORTES, JSON.stringify(reportes));
  }, [reportes]);

  const totalPreguntasNumero = Number(datos.totalPreguntas);

  const puntosPorPregunta = useMemo(() => {
    const total = Number(datos.totalPreguntas);
    if (!total || total <= 0) return 0;
    return 100 / total;
  }, [datos.totalPreguntas]);

  const respuestasLimpias = useMemo(() => {
    return respuestasLista.join('').toUpperCase().replace(/[^ABCD]/g, '');
  }, [respuestasLista]);

  const claveLimpia = useMemo(() => {
    return datos.claveRespuestas
      .toUpperCase()
      .replace(/[^ABCD]/g, '');
  }, [datos.claveRespuestas]);

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
    const erroresConteo = total - aciertos;
    const porcentaje = total > 0 ? (aciertos / total) * 100 : 0;

    return {
      aciertos,
      errores: erroresConteo,
      porcentaje,
      puntaje: desglosePreguntas.reduce((acc, item) => acc + item.puntaje, 0)
    };
  }, [desglosePreguntas]);

  const notaFinalNumerica = Number(decisionFinal.puntuacion || resultadoRevision.puntaje || 0);
  const letraFinal = mapearLetraPucmm(notaFinalNumerica);

  const reportesFiltrados = useMemo(() => {
    return reportes.filter((reporte) => {
      const materiaValida = !filtrosHistorial.materia || reporte.examen.materia === filtrosHistorial.materia;
      const grupoValido = !filtrosHistorial.grupo || reporte.examen.grupo === filtrosHistorial.grupo;
      const fechaValida = !filtrosHistorial.fecha || reporte.examen.fecha === filtrosHistorial.fecha;
      return materiaValida && grupoValido && fechaValida;
    });
  }, [reportes, filtrosHistorial]);

  const estadisticasGrupo = useMemo(() => {
    const distribucion = { A: 0, 'B+': 0, B: 0, 'C+': 0, C: 0, D: 0, F: 0 };
    reportesFiltrados.forEach((rep) => {
      distribucion[rep.calificacionFinal.letra] += 1;
    });
    return distribucion;
  }, [reportesFiltrados]);

  const actualizarDato = (campo, valor) => {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  };

  const actualizarRespuesta = (indice, valor) => {
    setRespuestasLista((previo) => {
      const longitud = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(previo.length, indice + 1);
      const copia = Array.from({ length: longitud }, (_, i) => previo[i] || '');
      copia[indice] = valor;
      return copia;
    });
  };

  const cambiarEstadoPaso = (indice, nuevoEstado) => {
    setEstadoPaso((previo) =>
      previo.map((estado, i) => (i === indice ? { ...estado, ...nuevoEstado } : estado))
    );
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
      if (!totalPreguntas || totalPreguntas <= 0) {
        nuevosErrores.totalPreguntas = 'Ingrese un total de preguntas válido.';
      }

      if (!datos.claveRespuestas.trim()) {
        nuevosErrores.claveRespuestas = 'La clave de respuestas es obligatoria.';
      } else if (!/^[ABCD]+$/i.test(datos.claveRespuestas.trim())) {
        nuevosErrores.claveRespuestas = 'Use solo letras A, B, C o D en la clave.';
      }
    }

    if (indice === 1) {
      if (!respuestasLimpias) {
        nuevosErrores.respuestasEstudiante =
          'Debe cargar o transcribir respuestas válidas del estudiante (A, B, C o D).';
      }
      if (datos.modoIngreso === 'imagen' && !datos.archivoImagen) {
        nuevosErrores.archivoImagen = 'Debe seleccionar una imagen de respuestas.';
      }
    }

    if (indice === 3) {
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
      const resultado = await Tesseract.recognize(datos.archivoImagen, 'spa+eng', {
        logger: (mensaje) => {
          if (mensaje.status === 'recognizing text') {
            setOcrEstado((previo) => ({ ...previo, progreso: Math.round((mensaje.progress || 0) * 100) }));
          }
        }
      });

      const textoDetectado = resultado.data?.text || '';
      const respuestasParseadas = parsearOCRPorNumeroPregunta(textoDetectado, totalPreguntasNumero);

      if (!limpiarRespuestas(respuestasParseadas.join(''))) {
        throw new Error('No se detectaron respuestas válidas. Verifique que la imagen sea legible.');
      }

      setRespuestasLista(respuestasParseadas);
      setOcrEstado({
        procesando: false,
        progreso: 100,
        error: '',
        textoDetectado
      });
    } catch (error) {
      setOcrEstado({
        procesando: false,
        progreso: 0,
        error:
          error?.message ||
          'No se pudo procesar la imagen. Intente nuevamente con una foto más nítida y buena iluminación.',
        textoDetectado: ''
      });
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
      const prompt = [
        'Eres una profesora experta en contabilidad y evaluación formativa.',
        `Materia: ${datos.materia}`,
        `Grupo: ${datos.grupo}`,
        `Fecha: ${datos.fecha}`,
        `Total de preguntas: ${datos.totalPreguntas}`,
        `Puntaje automático actual: ${resultadoRevision.puntaje.toFixed(2)} / 100`,
        'Responde SOLO JSON: {"puntuacion_sugerida": number, "justificacion_breve": "texto"}'
      ].join('\n');

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
      if (!response.ok) throw new Error(data?.error?.message || 'Error inesperado al consultar Anthropic.');

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
      setIaEstado({
        cargando: false,
        error: error?.name === 'AbortError' ? 'La solicitud excedió el tiempo límite (20s).' : (error?.message || 'No se pudo obtener sugerencia de IA.'),
        sugerencia: null
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const generarReporteActual = () => {
    const reporte = {
      id: crypto.randomUUID(),
      creadoEn: new Date().toISOString(),
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
      respuestas: {
        lista: respuestasLista,
        texto: respuestasLimpias
      },
      puntuacionPorPregunta: desglosePreguntas,
      justificacionesIA: desglosePreguntas.map((item) => ({
        pregunta: item.numero,
        justificacion: item.justificacionIA
      })),
      calificacionFinal: {
        notaSobre100: notaFinalNumerica,
        letra: letraFinal,
        justificacionDocente: decisionFinal.justificacion
      }
    };

    setReportes((previo) => [reporte, ...previo]);
    return reporte;
  };

  const exportarIndividualCSV = (reporte) => {
    const filas = [
      ['Materia', reporte.examen.materia],
      ['Grupo', reporte.examen.grupo],
      ['Fecha', reporte.examen.fecha],
      ['Estudiante', reporte.estudiante.nombre],
      ['Matrícula', reporte.estudiante.matricula],
      ['Nota', reporte.calificacionFinal.notaSobre100.toFixed(2)],
      ['Letra', reporte.calificacionFinal.letra],
      [],
      ['Pregunta', 'Correcta', 'Estudiante', 'Puntaje', 'Justificación IA']
    ];

    reporte.puntuacionPorPregunta.forEach((item) => {
      filas.push([
        item.numero,
        item.respuestaCorrecta,
        item.respuestaEstudiante,
        item.puntaje.toFixed(2),
        item.justificacionIA
      ]);
    });

    const csv = filas.map((fila) => fila.map(escaparCsv).join(',')).join('\n');
    descargarArchivo(csv, `reporte_${reporte.estudiante.matricula || 'estudiante'}.csv`, 'text/csv;charset=utf-8;');
  };

  const exportarIndividualPDF = (reporte) => {
    const doc = new jsPDF();
    let y = 12;

    doc.setFontSize(14);
    doc.text('Reporte individual de calificación', 14, y);
    y += 8;
    doc.setFontSize(10);

    const encabezado = [
      `Materia: ${reporte.examen.materia}`,
      `Grupo: ${reporte.examen.grupo}`,
      `Fecha: ${reporte.examen.fecha}`,
      `Estudiante: ${reporte.estudiante.nombre} (${reporte.estudiante.matricula})`,
      `Nota final: ${reporte.calificacionFinal.notaSobre100.toFixed(2)} / 100 (${reporte.calificacionFinal.letra})`
    ];

    encabezado.forEach((linea) => {
      doc.text(linea, 14, y);
      y += 6;
    });

    y += 2;
    doc.text('Desglose por pregunta:', 14, y);
    y += 6;

    reporte.puntuacionPorPregunta.forEach((item) => {
      const linea = `P${item.numero}: C=${item.respuestaCorrecta || '-'} E=${item.respuestaEstudiante || '-'} Pts=${item.puntaje.toFixed(2)}`;
      doc.text(linea, 14, y);
      y += 5;
      const justificacion = doc.splitTextToSize(`IA: ${item.justificacionIA}`, 180);
      doc.text(justificacion, 14, y);
      y += justificacion.length * 4 + 2;

      if (y > 270) {
        doc.addPage();
        y = 14;
      }
    });

    doc.save(`reporte_${reporte.estudiante.matricula || 'estudiante'}.pdf`);
  };

  const exportarGrupoCSV = () => {
    const filas = [['Nombre', 'Matrícula', 'Materia', 'Grupo', 'Fecha', 'Nota', 'Letra']];
    reportesFiltrados.forEach((rep) => {
      filas.push([
        rep.estudiante.nombre,
        rep.estudiante.matricula,
        rep.examen.materia,
        rep.examen.grupo,
        rep.examen.fecha,
        rep.calificacionFinal.notaSobre100.toFixed(2),
        rep.calificacionFinal.letra
      ]);
    });
    const csv = filas.map((fila) => fila.map(escaparCsv).join(',')).join('\n');
    descargarArchivo(csv, 'reporte_grupal.csv', 'text/csv;charset=utf-8;');
  };

  const guardarYExportar = (tipo) => {
    if (!validarPaso(3)) return;
    const reporte = generarReporteActual();
    if (tipo === 'pdf') exportarIndividualPDF(reporte);
    if (tipo === 'csv') exportarIndividualCSV(reporte);
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
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (pasoActual < pasos.length - 1) setPasoActual((previo) => previo + 1);
    } finally {
      cambiarEstadoPaso(pasoActual, { cargando: false });
    }
  };

  const retrocederPaso = () => {
    setErrores({});
    if (pasoActual > 0) setPasoActual((previo) => previo - 1);
  };

  const estadoActual = estadoPaso[pasoActual];
  const textoManual = respuestasLista.join('');
  const totalFilasTabla = totalPreguntasNumero > 0 ? totalPreguntasNumero : Math.max(respuestasLista.length, 1);

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

      <ol className="pasos">
        {pasos.map((paso, indice) => (
          <li key={paso} className={indice === pasoActual ? 'activo' : ''}>
            {indice + 1}. {paso}
          </li>
        ))}
      </ol>

      <section className="panel">
        {pasoActual === 0 && (
          <div className="paso">
            <h2>Configuración del examen</h2>
            <label>Materia<input value={datos.materia} onChange={(e) => actualizarDato('materia', e.target.value)} />{errores.materia && <span className="error">{errores.materia}</span>}</label>
            <label>Grupo<input value={datos.grupo} onChange={(e) => actualizarDato('grupo', e.target.value)} />{errores.grupo && <span className="error">{errores.grupo}</span>}</label>
            <label>Fecha<input type="date" value={datos.fecha} onChange={(e) => actualizarDato('fecha', e.target.value)} />{errores.fecha && <span className="error">{errores.fecha}</span>}</label>
            <label>Nombre estudiante<input value={datos.estudianteNombre} onChange={(e) => actualizarDato('estudianteNombre', e.target.value)} />{errores.estudianteNombre && <span className="error">{errores.estudianteNombre}</span>}</label>
            <label>Matrícula estudiante<input value={datos.estudianteMatricula} onChange={(e) => actualizarDato('estudianteMatricula', e.target.value)} />{errores.estudianteMatricula && <span className="error">{errores.estudianteMatricula}</span>}</label>
            <label> Total de preguntas
              <input type="number" min="1" value={datos.totalPreguntas} onChange={(e) => { actualizarDato('totalPreguntas', e.target.value); setRespuestasLista((previo) => convertirTextoALista(previo.join(''), e.target.value)); }} />
              {errores.totalPreguntas && (<span className="error">{errores.totalPreguntas}</span>)}
            </label>
            <label>Clave de respuestas (solo A/B/C/D)
              <input value={datos.claveRespuestas} onChange={(e) => actualizarDato('claveRespuestas', e.target.value)} placeholder="Ejemplo: ABCDABCD" />
              {errores.claveRespuestas && (<span className="error">{errores.claveRespuestas}</span>)}
            </label>
            <p className="detalle">Cada pregunta vale {puntosPorPregunta.toFixed(2)} puntos.</p>
          </div>
        )}

        {pasoActual === 1 && (
          <div className="paso">
            <h2>Ingreso de respuestas</h2>
            <label>Método de ingreso
              <select value={datos.modoIngreso} onChange={(e) => actualizarDato('modoIngreso', e.target.value)}>
                <option value="transcripcion">Transcripción manual</option>
                <option value="imagen">Carga de imagen</option>
              </select>
            </label>

            {datos.modoIngreso === 'transcripcion' ? (
              <label>Respuestas del estudiante (A/B/C/D)
                <textarea rows="4" value={textoManual} onChange={(e) => setRespuestasLista(convertirTextoALista(e.target.value, totalPreguntasNumero))} placeholder="Ejemplo: ABCCDA" />
                {errores.respuestasEstudiante && (<span className="error">{errores.respuestasEstudiante}</span>)}
              </label>
            ) : (
              <>
                <label>Foto o escaneo de respuestas<input type="file" accept="image/*" onChange={(e) => actualizarDato('archivoImagen', e.target.files?.[0] || null)} /></label>
                <button type="button" onClick={procesarImagenConOCR} disabled={!datos.archivoImagen || ocrEstado.procesando}>{ocrEstado.procesando ? 'Procesando OCR...' : 'Procesar imagen con OCR'}</button>
                {ocrEstado.procesando && (<div className="progreso-ocr"><progress value={ocrEstado.progreso} max="100" /><span>{ocrEstado.progreso}% completado</span></div>)}
                {ocrEstado.error && <p className="error">{ocrEstado.error}</p>}
                {errores.archivoImagen && <span className="error">{errores.archivoImagen}</span>}
              </>
            )}

            <div>
              <h3>Respuestas extraídas / editables</h3>
              <table className="tabla-respuestas">
                <thead><tr><th>Pregunta</th><th>Respuesta</th></tr></thead>
                <tbody>
                  {Array.from({ length: totalFilasTabla }, (_, indice) => (
                    <tr key={`pregunta-${indice + 1}`}><td>{indice + 1}</td><td><select value={respuestasLista[indice] || ''} onChange={(e) => actualizarRespuesta(indice, e.target.value)}><option value="">Sin marcar</option>{letrasValidas.map((letra) => (<option key={letra} value={letra}>{letra}</option>))}</select></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pasoActual === 2 && (
          <div className="paso">
            <h2>Revisión de calificaciones</h2>
            <div className="resumen"><p>Aciertos: {resultadoRevision.aciertos}</p><p>Errores: {resultadoRevision.errores}</p><p>Porcentaje: {resultadoRevision.porcentaje.toFixed(2)}%</p><p>Puntaje: {resultadoRevision.puntaje.toFixed(2)} / 100</p><p>Letra PUCMM: {mapearLetraPucmm(resultadoRevision.puntaje)}</p></div>
            <button type="button" onClick={sugerirCalificacionConIA} disabled={iaEstado.cargando}>{iaEstado.cargando ? 'Consultando IA...' : 'Sugerir calificación con IA (Anthropic)'}</button>
            {iaEstado.error && <p className="error">{iaEstado.error}</p>}
            <table className="tabla-respuestas">
              <thead><tr><th>Pregunta</th><th>Correcta</th><th>Estudiante</th><th>Puntaje</th><th>Justificación IA</th></tr></thead>
              <tbody>
                {desglosePreguntas.map((item) => (
                  <tr key={item.numero}><td>{item.numero}</td><td>{item.respuestaCorrecta || '-'}</td><td>{item.respuestaEstudiante || '-'}</td><td>{item.puntaje.toFixed(2)}</td><td>{item.justificacionIA}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pasoActual === 3 && (
          <div className="paso">
            <h2>Reporte final y exportación</h2>
            <ul className="resumen-final">
              <li>Estudiante: {datos.estudianteNombre} ({datos.estudianteMatricula})</li>
              <li>Materia: {datos.materia || 'Sin definir'}</li>
              <li>Grupo: {datos.grupo || 'Sin definir'}</li>
              <li>Fecha: {datos.fecha || 'Sin definir'}</li>
              <li>Puntaje final: {notaFinalNumerica.toFixed(2)} / 100</li>
              <li>Letra final PUCMM: {letraFinal}</li>
            </ul>

            <div className="decision-final">
              <h3>Decisión final de la profesora</h3>
              <label>Puntuación final (0-100)<input type="number" min="0" max="100" step="0.01" value={decisionFinal.puntuacion} onChange={(e) => setDecisionFinal((previo) => ({ ...previo, puntuacion: e.target.value }))} /></label>
              <label>Justificación final<textarea rows="3" value={decisionFinal.justificacion} onChange={(e) => setDecisionFinal((previo) => ({ ...previo, justificacion: e.target.value }))} /></label>
              {errores.decisionFinal && <p className="error">{errores.decisionFinal}</p>}
            </div>

            <div className="acciones-ajustes">
              <button type="button" onClick={() => guardarYExportar('pdf')}>Guardar y exportar PDF</button>
              <button type="button" onClick={() => guardarYExportar('csv')}>Guardar y exportar CSV</button>
            </div>

            <h3>Vista de grupo e historial</h3>
            <div className="filtros-grid">
              <label>Materia
                <input value={filtrosHistorial.materia} onChange={(e) => setFiltrosHistorial((p) => ({ ...p, materia: e.target.value }))} placeholder="Filtrar por materia" />
              </label>
              <label>Grupo
                <input value={filtrosHistorial.grupo} onChange={(e) => setFiltrosHistorial((p) => ({ ...p, grupo: e.target.value }))} placeholder="Filtrar por grupo" />
              </label>
              <label>Fecha
                <input type="date" value={filtrosHistorial.fecha} onChange={(e) => setFiltrosHistorial((p) => ({ ...p, fecha: e.target.value }))} />
              </label>
            </div>

            <table className="tabla-respuestas">
              <thead><tr><th>Estudiante</th><th>Matrícula</th><th>Materia</th><th>Grupo</th><th>Fecha</th><th>Nota</th><th>Letra</th></tr></thead>
              <tbody>
                {reportesFiltrados.map((rep) => (
                  <tr key={rep.id}><td>{rep.estudiante.nombre}</td><td>{rep.estudiante.matricula}</td><td>{rep.examen.materia}</td><td>{rep.examen.grupo}</td><td>{rep.examen.fecha}</td><td>{rep.calificacionFinal.notaSobre100.toFixed(2)}</td><td>{rep.calificacionFinal.letra}</td></tr>
                ))}
              </tbody>
            </table>

            <div className="resumen">
              <p>Distribución de letras: A ({estadisticasGrupo.A}), B+ ({estadisticasGrupo['B+']}), B ({estadisticasGrupo.B}), C+ ({estadisticasGrupo['C+']}), C ({estadisticasGrupo.C}), D ({estadisticasGrupo.D}), F ({estadisticasGrupo.F})</p>
            </div>

            <button type="button" onClick={exportarGrupoCSV}>Exportar CSV grupal</button>
          </div>
        )}
      </section>

      {estadoActual.cargando && <p className="info">Procesando paso...</p>}

      <footer className="acciones">
        <button type="button" onClick={retrocederPaso} disabled={pasoActual === 0 || estadoActual.cargando}>Anterior</button>
        <button type="button" onClick={avanzarPaso} disabled={pasoActual === pasos.length - 1 || estadoActual.cargando}>{estadoActual.cargando ? 'Cargando...' : 'Siguiente'}</button>
      </footer>
    </main>
  );
}

export default App;
