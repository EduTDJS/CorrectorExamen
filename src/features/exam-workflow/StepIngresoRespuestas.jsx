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
  umbralBajaConfianza
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
        <label>Respuestas del estudiante (A/B/C/D)
          <textarea rows="4" value={textoManual} onChange={(e) => setRespuestasLista(convertirTextoALista(e.target.value, totalPreguntasNumero))} placeholder="Ejemplo: ABCCDA" />
          {errores.respuestasEstudiante && (<span className="error">{errores.respuestasEstudiante}</span>)}
        </label>
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
          <thead><tr><th>Pregunta</th><th>Respuesta</th><th>Confianza OCR</th><th>Fuente</th></tr></thead>
          <tbody>
            {Array.from({ length: totalFilasTabla }, (_, indice) => {
              const respuestaData = respuestasLista[indice] || {};
              const confianza = typeof respuestaData.confianza === 'number' ? respuestaData.confianza : null;
              const bajaConfianza = confianza !== null && confianza < umbralBajaConfianza;

              return (
                <tr key={`pregunta-${indice + 1}`} className={bajaConfianza ? 'fila-baja-confianza' : ''}>
                  <td>{indice + 1}</td>
                  <td>
                    <select value={obtenerRespuestaTexto(respuestaData) || ''} onChange={(e) => actualizarRespuesta(indice, e.target.value)}>
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
