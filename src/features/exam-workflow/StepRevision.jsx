function StepRevision({ resultadoRevision, mapearLetraPucmm, sugerirCalificacionConIA, iaEstado, desglosePreguntas }) {
  return (
    <div className="paso">
      <h2>Revisión de calificaciones</h2>
      <div className="resumen"><p>Aciertos: {resultadoRevision.aciertos}</p><p>Errores: {resultadoRevision.errores}</p><p>Porcentaje: {resultadoRevision.porcentaje.toFixed(2)}%</p><p>Puntaje: {resultadoRevision.puntaje.toFixed(2)} / 100</p><p>Letra PUCMM: {mapearLetraPucmm(resultadoRevision.puntaje)}</p></div>
      <button type="button" onClick={sugerirCalificacionConIA} disabled={iaEstado.cargando}>{iaEstado.cargando ? 'Consultando IA...' : 'Sugerir calificación con IA (Anthropic)'}</button>
      {iaEstado.error && <p className="error">{iaEstado.error}</p>}
      <table className="tabla-respuestas">
        <thead><tr><th>Pregunta</th><th>Correcta</th><th>Estudiante</th><th>Confianza</th><th>Fuente OCR</th><th>Puntaje</th><th>Justificación IA</th></tr></thead>
        <tbody>
          {desglosePreguntas.map((item) => (
            <tr key={item.numero} className={item.bajaConfianza ? 'fila-baja-confianza' : ''}>
              <td>{item.numero}</td>
              <td>{item.respuestaCorrecta || '-'}</td>
              <td>{item.respuestaEstudiante || '-'}</td>
              <td>{item.confianzaOCR === null ? '-' : `${item.confianzaOCR.toFixed(1)}%`}</td>
              <td>{item.fuenteOCR || '-'}</td>
              <td>{item.puntaje.toFixed(2)}</td>
              <td>{item.justificacionIA}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="detalle">Las filas resaltadas indican baja confianza OCR y requieren revisión docente.</p>
    </div>
  );
}

export default StepRevision;
