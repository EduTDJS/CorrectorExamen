import { useEffect, useMemo, useState } from 'react';
import Tesseract from 'tesseract.js';

const pasos = [
  'Configuración del examen',
  'Ingreso de respuestas',
  'Revisión de calificaciones',
  'Reporte final y exportación'
];

const STORAGE_API_KEY = 'corrector_anthropic_api_key';
const STORAGE_DECISION_FINAL = 'corrector_decision_final';

const formularioInicial = {
  materia: '',
  grupo: '',
  fecha: '',
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

  useEffect(() => {
    setApiKeyTemporal(leerApiKey());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_DECISION_FINAL, JSON.stringify(decisionFinal));
  }, [decisionFinal]);

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

  const resultadoRevision = useMemo(() => {
    if (!claveLimpia || !respuestasLimpias) {
      return { aciertos: 0, errores: 0, porcentaje: 0, puntaje: 0 };
    }

    const total = Math.min(claveLimpia.length, respuestasLimpias.length);
    let aciertos = 0;

    for (let i = 0; i < total; i += 1) {
      if (claveLimpia[i] === respuestasLimpias[i]) {
        aciertos += 1;
      }
    }

    const erroresConteo = total - aciertos;
    const porcentaje = total > 0 ? (aciertos / total) * 100 : 0;

    return {
      aciertos,
      errores: erroresConteo,
      porcentaje,
      puntaje: aciertos * puntosPorPregunta
    };
  }, [claveLimpia, respuestasLimpias, puntosPorPregunta]);

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

      const totalPreguntas = Number(datos.totalPreguntas);
      if (!totalPreguntas || totalPreguntas <= 0) {
        nuevosErrores.totalPreguntas = 'Ingrese un total de preguntas válido.';
      } else {
        const sumaPuntos = totalPreguntas * (100 / totalPreguntas);
        if (Math.round(sumaPuntos) !== 100) {
          nuevosErrores.totalPreguntas = 'La suma de puntos debe ser igual a 100.';
        }
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

    if (indice === 2) {
      if (!claveLimpia || !respuestasLimpias) {
        nuevosErrores.revision =
          'Se necesitan clave y respuestas del estudiante para revisar calificaciones.';
      }
    }

    if (indice === 3) {
      if (!datos.materia || !datos.grupo || !datos.fecha) {
        nuevosErrores.reporte =
          'Complete los datos de configuración para generar el reporte final.';
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
    try {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (pasoActual < pasos.length - 1) {
        setPasoActual((previo) => previo + 1);
      }
    } catch (error) {
      cambiarEstadoPaso(pasoActual, {
        error: 'Ocurrió un error al continuar. Inténtelo nuevamente.'
      });
    } finally {
      cambiarEstadoPaso(pasoActual, { cargando: false });
    }
  };

  const retrocederPaso = () => {
    setErrores({});
    if (pasoActual > 0) {
      setPasoActual((previo) => previo - 1);
    }
  };

  const exportarReporte = async () => {
    cambiarEstadoPaso(3, { cargando: true, error: '' });
    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      window.alert('Reporte exportado correctamente en formato PDF (simulado).');
    } catch (error) {
      cambiarEstadoPaso(3, { error: 'No se pudo exportar el reporte final.' });
    } finally {
      cambiarEstadoPaso(3, { cargando: false });
    }
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
            <label>
              Materia
              <input
                value={datos.materia}
                onChange={(e) => actualizarDato('materia', e.target.value)}
              />
              {errores.materia && <span className="error">{errores.materia}</span>}
            </label>

            <label>
              Grupo
              <input
                value={datos.grupo}
                onChange={(e) => actualizarDato('grupo', e.target.value)}
              />
              {errores.grupo && <span className="error">{errores.grupo}</span>}
            </label>

            <label>
              Fecha
              <input
                type="date"
                value={datos.fecha}
                onChange={(e) => actualizarDato('fecha', e.target.value)}
              />
              {errores.fecha && <span className="error">{errores.fecha}</span>}
            </label>

            <label>
              Total de preguntas
              <input
                type="number"
                min="1"
                value={datos.totalPreguntas}
                onChange={(e) => {
                  actualizarDato('totalPreguntas', e.target.value);
                  setRespuestasLista((previo) => convertirTextoALista(previo.join(''), e.target.value));
                }}
              />
              {errores.totalPreguntas && (
                <span className="error">{errores.totalPreguntas}</span>
              )}
            </label>

            <label>
              Clave de respuestas (solo A/B/C/D)
              <input
                value={datos.claveRespuestas}
                onChange={(e) => actualizarDato('claveRespuestas', e.target.value)}
                placeholder="Ejemplo: ABCDABCD"
              />
              {errores.claveRespuestas && (
                <span className="error">{errores.claveRespuestas}</span>
              )}
            </label>
            <p className="detalle">Cada pregunta vale {puntosPorPregunta.toFixed(2)} puntos.</p>
          </div>
        )}

        {pasoActual === 1 && (
          <div className="paso">
            <h2>Ingreso de respuestas</h2>
            <label>
              Método de ingreso
              <select
                value={datos.modoIngreso}
                onChange={(e) => actualizarDato('modoIngreso', e.target.value)}
              >
                <option value="transcripcion">Transcripción manual</option>
                <option value="imagen">Carga de imagen</option>
              </select>
            </label>

            {datos.modoIngreso === 'transcripcion' ? (
              <label>
                Respuestas del estudiante (A/B/C/D)
                <textarea
                  rows="4"
                  value={textoManual}
                  onChange={(e) => setRespuestasLista(convertirTextoALista(e.target.value, totalPreguntasNumero))}
                  placeholder="Ejemplo: ABCCDA"
                />
                {errores.respuestasEstudiante && (
                  <span className="error">{errores.respuestasEstudiante}</span>
                )}
              </label>
            ) : (
              <>
                <label>
                  Foto o escaneo de respuestas
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => actualizarDato('archivoImagen', e.target.files?.[0] || null)}
                  />
                </label>

                <button
                  type="button"
                  onClick={procesarImagenConOCR}
                  disabled={!datos.archivoImagen || ocrEstado.procesando}
                >
                  {ocrEstado.procesando ? 'Procesando OCR...' : 'Procesar imagen con OCR'}
                </button>

                {ocrEstado.procesando && (
                  <div className="progreso-ocr">
                    <progress value={ocrEstado.progreso} max="100" />
                    <span>{ocrEstado.progreso}% completado</span>
                  </div>
                )}

                {ocrEstado.error && <p className="error">{ocrEstado.error}</p>}
                {errores.archivoImagen && <span className="error">{errores.archivoImagen}</span>}
                {errores.respuestasEstudiante && (
                  <span className="error">{errores.respuestasEstudiante}</span>
                )}
              </>
            )}

            <div>
              <h3>Respuestas extraídas / editables</h3>
              <table className="tabla-respuestas">
                <thead>
                  <tr>
                    <th>Pregunta</th>
                    <th>Respuesta</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: totalFilasTabla }, (_, indice) => (
                    <tr key={`pregunta-${indice + 1}`}>
                      <td>{indice + 1}</td>
                      <td>
                        <select
                          value={respuestasLista[indice] || ''}
                          onChange={(e) => actualizarRespuesta(indice, e.target.value)}
                        >
                          <option value="">Sin marcar</option>
                          {letrasValidas.map((letra) => (
                            <option key={letra} value={letra}>
                              {letra}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {ocrEstado.textoDetectado && (
              <details>
                <summary>Ver texto bruto detectado por OCR</summary>
                <pre className="ocr-texto">{ocrEstado.textoDetectado}</pre>
              </details>
            )}
          </div>
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
        )}
      </section>

      {estadoActual.cargando && <p className="info">Procesando paso...</p>}
      {estadoActual.error && <p className="error">{estadoActual.error}</p>}

      <footer className="acciones">
        <button type="button" onClick={retrocederPaso} disabled={pasoActual === 0 || estadoActual.cargando}>
          Anterior
        </button>
        <button
          type="button"
          onClick={avanzarPaso}
          disabled={pasoActual === pasos.length - 1 || estadoActual.cargando}
        >
          {estadoActual.cargando ? 'Cargando...' : 'Siguiente'}
        </button>
      </footer>
    </main>
  );
}

export default App;
