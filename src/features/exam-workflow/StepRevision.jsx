function StepRevision({
  resultadoRevision,
  mapearLetraPucmm,
  sugerirCalificacionConIA,
  iaEstado,
  desglosePreguntas,
  overridesDocente,
  onOverrideDocente,
  checklistBajaConfianza,
  onConfirmarRevisionBajaConfianza,
  onEditarRespuestaBajaConfianza,
  resumenBajaConfianzaRevision,
  errorRevisionBajaConfianza
}) {
  const preguntasBajaConfianza = desglosePreguntas
    .filter((item) => item.bajaConfianza && typeof item.confianzaOCR === 'number')
    .sort((a, b) => a.confianzaOCR - b.confianzaOCR);

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
      <p className="detalle">
        Proveedor activo: <strong>{iaEstado.proveedorActivo}</strong> ({iaEstado.modeloActivo})
      </p>

      {iaEstado.error && <p className="error">{iaEstado.error}</p>}

      {preguntasBajaConfianza.length > 0 && (
        <div className="resumen baja-confianza-resumen">
          <p><strong>Revisión manual priorizada:</strong> revise primero estas preguntas con menor confianza OCR.</p>
          <p>
            {preguntasBajaConfianza.map((item) => `#${item.numero} (${item.confianzaOCR.toFixed(1)}%)`).join(' · ')}
          </p>
          <p>
            <strong>Checklist baja confianza:</strong>{' '}
            Revisadas {resumenBajaConfianzaRevision.revisadas} / {resumenBajaConfianzaRevision.total}
            {' '}· Pendientes {resumenBajaConfianzaRevision.pendientes}
          </p>
        </div>
      )}
      {errorRevisionBajaConfianza && <p className="error">{errorRevisionBajaConfianza}</p>}

      <table className="tabla-respuestas">
        <caption>Desglose de revisión por pregunta</caption>
        <thead>
          <tr>
            <th scope="col">Pregunta</th>
            <th scope="col">Correcta</th>
            <th scope="col">Estudiante</th>
            <th scope="col">Estado</th>
            <th scope="col">Confianza OCR</th>
            <th scope="col">Fuente OCR</th>
            <th scope="col">Puntaje</th>
            <th scope="col">Override docente</th>
            <th scope="col">Revisión baja confianza</th>
            <th scope="col">Razonamiento (expandible)</th>
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
                <input
                  aria-label={`Override pregunta ${item.numero}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={overridesDocente[item.numero] ?? ''}
                  onChange={(e) => onOverrideDocente(item.numero, e.target.value)}
                  placeholder="Auto"
                />
              </td>
              <td>
                {item.bajaConfianza ? (
                  <div className="acciones-importacion-lote">
                    <button
                      type="button"
                      onClick={() => onConfirmarRevisionBajaConfianza(item.numero)}
                      disabled={Boolean(checklistBajaConfianza[item.numero])}
                    >
                      {checklistBajaConfianza[item.numero] ? 'Confirmada' : 'Confirm as read'}
                    </button>
                    <button type="button" onClick={() => onEditarRespuestaBajaConfianza(item.numero)}>
                      Editar respuesta
                    </button>
                  </div>
                ) : (
                  '-'
                )}
              </td>
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
      <p className="detalle">Las filas resaltadas indican baja confianza OCR; priorice su revisión manual antes de confirmar la calificación.</p>
    </div>
  );
}

export default StepRevision;
