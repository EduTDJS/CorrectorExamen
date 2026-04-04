import { obtenerRespuestaTexto } from '../../utils/examUtils';

function StepIngresoRespuestas({
  datos,
  errores,
  actualizarDato,
  textoManual,
  setRespuestasLista,
  convertirTextoALista,
  totalPreguntasNumero,
  procesarImagenConOCR,
  ocrEstado,
  totalFilasTabla,
  respuestasLista,
  actualizarRespuesta,
  letrasValidas,
  umbralBajaConfianza,
  importacionEstado,
  onArchivoImportacion,
  onAplicarFilaImportada,
  onRegistrarFilasImportadas,
  resumenRegistroLote
}) {
  const esDispositivoMovil = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

  return (
    <div className="paso">
      <h2>Ingreso de respuestas</h2>
      <label>Método de ingreso
        <select value={datos.modoIngreso} onChange={(e) => actualizarDato('modoIngreso', e.target.value)}>
          <option value="transcripcion">Transcripción manual</option>
          <option value="imagen">Carga de imagen</option>
        </select>
      </label>

      {datos.modoIngreso === 'transcripcion' ? (
        <>
          <label>Respuestas del estudiante (A/B/C/D)
            <textarea rows="4" value={textoManual} onChange={(e) => setRespuestasLista(convertirTextoALista(e.target.value, totalPreguntasNumero))} placeholder="Ejemplo: ABCCDA" />
            {errores.respuestasEstudiante && (<span className="error">{errores.respuestasEstudiante}</span>)}
          </label>

          <div className="importacion-bloque">
            <h3>Importar lote (CSV/Excel)</h3>
            <p className="detalle">Campos requeridos: estudianteNombre, estudianteMatricula, respuestas.</p>
            <label>
              Archivo de importación
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => onArchivoImportacion(e.target.files?.[0] || null)}
              />
            </label>
            {importacionEstado.error && <p className="error">{importacionEstado.error}</p>}
            {importacionEstado.resumen && (
              <p className="detalle">
                Leídas: {importacionEstado.resumen.totalLeidas} · Válidas: {importacionEstado.resumen.totalValidas}
                {' '}· Errores: {importacionEstado.resumen.totalErrores} · Duplicados: {importacionEstado.resumen.totalDuplicados}
              </p>
            )}
            {importacionEstado.duplicadosEnHistorial.length > 0 && (
              <p className="detalle baja-confianza-resumen">
                Matrículas ya existentes en historial: {importacionEstado.duplicadosEnHistorial.join(', ')}
              </p>
            )}

            {importacionEstado.filas.length > 0 && (
              <>
                <div className="acciones-importacion-lote">
                  <button type="button" onClick={() => onRegistrarFilasImportadas()} aria-label="Registrar todas las filas válidas importadas">
                    Registrar todas las válidas
                  </button>
                  <button type="button" onClick={() => onRegistrarFilasImportadas(importacionEstado.filas.slice(0, 15))} aria-label="Registrar solo las filas mostradas en la vista previa">
                    Registrar seleccionadas
                  </button>
                </div>
                <table className="tabla-respuestas">
                  <caption>Vista previa de filas importadas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fila</th>
                      <th scope="col">Matrícula</th>
                      <th scope="col">Nombre</th>
                      <th scope="col">Respuestas</th>
                      <th scope="col">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importacionEstado.filas.slice(0, 15).map((fila) => (
                      <tr key={`import-row-${fila.fila}`}>
                        <td>{fila.fila}</td>
                        <td>{fila.estudianteMatricula}</td>
                        <td>{fila.estudianteNombre}</td>
                        <td>{fila.respuestasTexto}</td>
                        <td>
                          <button type="button" onClick={() => onAplicarFilaImportada(fila)} aria-label={`Cargar fila ${fila.fila} de ${fila.estudianteNombre} en el formulario`}>
                            Cargar en formulario
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {resumenRegistroLote && (
              <p className="resumen-importacion-lote" role="status">
                Registro por lote completado — Creados: {resumenRegistroLote.creados} · Actualizados: {resumenRegistroLote.actualizados}
                {' '}· Omitidos: {resumenRegistroLote.omitidos} · Fallidos: {resumenRegistroLote.fallidos}
              </p>
            )}

            {importacionEstado.errores.length > 0 && (
              <>
                <h4>Errores por registro</h4>
                <ul className="error-lista">
                  {importacionEstado.errores.slice(0, 20).map((item) => (
                    <li key={`err-${item.fila}-${item.matricula}`}>
                      Fila {item.fila} ({item.matricula || 'sin matrícula'}): {item.errores.join(' | ')}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <label>
            Foto o escaneo de respuestas
            <input
              type="file"
              accept="image/*"
              capture={esDispositivoMovil ? 'environment' : undefined}
              onChange={(e) => actualizarDato('archivoImagen', e.target.files?.[0] || null)}
            />
          </label>
          <div className="ocr-ayuda">
            <p className="detalle"><strong>Antes de tomar la foto:</strong></p>
            <ul>
              <li>Use buena iluminación y evite sombras sobre la hoja.</li>
              <li>Toque la pantalla para asegurar el enfoque antes de capturar.</li>
              <li>Encuadre toda la hoja en vertical, sin recortes.</li>
            </ul>
          </div>
          <button type="button" onClick={procesarImagenConOCR} disabled={!datos.archivoImagen || ocrEstado.procesando}>{ocrEstado.procesando ? 'Procesando OCR...' : 'Procesar imagen con OCR'}</button>
          {ocrEstado.procesando && (<div className="progreso-ocr"><progress value={ocrEstado.progreso} max="100" /><span>{ocrEstado.progreso}% completado</span></div>)}
          {ocrEstado.error && <p className="error">{ocrEstado.error}</p>}
          {errores.archivoImagen && <span className="error">{errores.archivoImagen}</span>}
        </>
      )}

      <div>
        <h3>Respuestas extraídas / editables</h3>
        <p className="detalle">Priorice revisar primero las filas resaltadas: tienen confianza OCR menor a {umbralBajaConfianza}%.</p>
        <table className="tabla-respuestas">
          <caption>Respuestas extraídas y edición manual</caption>
          <thead>
            <tr>
              <th scope="col">Pregunta</th>
              <th scope="col">Respuesta</th>
              <th scope="col">Confianza OCR</th>
              <th scope="col">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalFilasTabla }, (_, indice) => {
              const respuestaData = respuestasLista[indice] || {};
              const confianza = typeof respuestaData.confianza === 'number' ? respuestaData.confianza : null;
              const bajaConfianza = confianza !== null && confianza < umbralBajaConfianza;

              return (
                <tr key={`pregunta-${indice + 1}`} className={bajaConfianza ? 'fila-baja-confianza' : ''}>
                  <td>{indice + 1}</td>
                  <td>
                    <select
                      aria-label={`Respuesta de la pregunta ${indice + 1}`}
                      value={obtenerRespuestaTexto(respuestaData) || ''}
                      onChange={(e) => actualizarRespuesta(indice, e.target.value)}
                    >
                      <option value="">Sin marcar</option>
                      {letrasValidas.map((letra) => (<option key={letra} value={letra}>{letra}</option>))}
                    </select>
                  </td>
                  <td>{confianza === null ? '-' : `${confianza.toFixed(1)}%`}</td>
                  <td>{respuestaData.fuenteLinea || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default StepIngresoRespuestas;
