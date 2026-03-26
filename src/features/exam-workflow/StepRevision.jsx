function StepRevision({ resultadoRevision, mapearLetraPucmm, sugerirCalificacionConIA, iaEstado, desglosePreguntas }) {
  return (
    <div className="paso">
      <h2>Revisión de calificaciones</h2>
      <div className="resumen">
        <p>Aciertos: {resultadoRevision.aciertos}</p>
        <p>Errores: {resultadoRevision.errores}</p>
        <p>Porcentaje: {resultadoRevision.porcentaje.toFixed(2)}%</p>
        <p>Puntaje: {resultadoRevision.puntaje.toFixed(2)} / 100</p>
        <p>Letra PUCMM: {mapearLetraPucmm(resultadoRevision.puntaje)}</p>
      </div>

      <button type="button" onClick={sugerirCalificacionConIA} disabled={iaEstado.cargando}>
        {iaEstado.cargando ? 'Consultando IA...' : 'Sugerir calificación con IA'}
      </button>

      {iaEstado.error && <p className="error">{iaEstado.error}</p>}

      <table className="tabla-respuestas">
        <thead>
          <tr>
            <th>Pregunta</th>
            <th>Correcta</th>
            <th>Estudiante</th>
            <th>Estado</th>
            <th>Confianza OCR</th>
            <th>Fuente OCR</th>
            <th>Puntaje</th>
            <th>Razonamiento (expandible)</th>
          </tr>
        </thead>
        <tbody>
          {desglosePreguntas.map((item) => (
            <tr key={item.numero} className={item.bajaConfianza ? 'fila-baja-confianza' : ''}>
              <td>{item.numero}</td>
              <td>{item.respuestaCorrecta || '-'}</td>
              <td>{item.respuestaEstudiante || '-'}</td>
              <td>{item.correcta ? 'Correcta' : 'Incorrecta'}</td>
              <td>{item.confianzaOCR === null ? '-' : `${item.confianzaOCR.toFixed(1)}%`}</td>
              <td>{item.fuenteOCR || '-'}</td>
              <td>{item.puntaje.toFixed(2)}</td>
              <td>
                <details>
                  <summary>Ver desglose</summary>
                  <p><strong>Criterio:</strong> {item.desglose.criterioAplicado}</p>
                  <p>
                    <strong>Evidencia:</strong>{' '}
                    clave={item.desglose.evidencia.clave || '-'}, respuesta={item.desglose.evidencia.respuestaEstudiante || '-'}, estado={item.desglose.evidencia.estado}, confianza={item.desglose.evidencia.confianzaOCR === null ? '-' : `${item.desglose.evidencia.confianzaOCR.toFixed(1)}%`}, fuente={item.desglose.evidencia.fuente || '-'}.
                  </p>
                  <p><strong>Resultado:</strong> {item.desglose.resultado}</p>
                  <p><strong>Recomendación:</strong> {item.desglose.recomendacion}</p>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="detalle">Las filas resaltadas indican baja confianza OCR y requieren revisión docente.</p>
    </div>
  );
}

export default StepRevision;
