import { useMemo, useState } from 'react';
import Tesseract from 'tesseract.js';

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
  totalPreguntas: '',
  claveRespuestas: '',
  modoIngreso: 'transcripcion',
  archivoImagen: null
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
      <h1>Corrector de Exámenes</h1>
      <p className="subtitulo">Flujo guiado de evaluación automática</p>

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
              <li>Puntaje final: {resultadoRevision.puntaje.toFixed(2)} / 100</li>
            </ul>
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
