function StepReporteFinal({
  datos,
  notaFinalNumerica,
  letraFinal,
  decisionFinal,
  setDecisionFinal,
  errores,
  guardarReporte,
  exportarReporteActual,
  reporteActualGuardado,
  filtrosHistorial,
  setFiltrosHistorial,
  reportesFiltrados,
  reportesAgrupadosPorMateria,
  estadisticasGrupo,
  exportarGrupoCSV,
  exportarCarpetaMateriaCSV,
  errorSesion,
  operacionesImportacion,
  exportarOperacionesImportacion
}) {
  return (
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

      <div className="resumen">
        <p>
          Estado del reporte actual:{' '}
          <strong>{reporteActualGuardado ? 'Guardado' : 'No guardado'}</strong>
        </p>
      </div>

      <div className="acciones-ajustes">
        <button type="button" onClick={guardarReporte}>Guardar reporte</button>
        <button type="button" onClick={() => exportarReporteActual('pdf')}>Exportar PDF</button>
        <button type="button" onClick={() => exportarReporteActual('csv')}>Exportar CSV</button>
      </div>

      {errorSesion && <p className="error">{errorSesion}</p>}

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

      {reportesAgrupadosPorMateria.map((carpeta) => (
        <details key={carpeta.materiaFolderId} open>
          <summary>
            {carpeta.materia} ({carpeta.totalReportes} registro{carpeta.totalReportes === 1 ? '' : 's'})
          </summary>
          <div className="acciones-ajustes">
            <button type="button" onClick={() => exportarCarpetaMateriaCSV(carpeta.materiaFolderId)}>
              Exportar carpeta CSV
            </button>
            <span>Registros en carpeta: <strong>{carpeta.totalReportes}</strong></span>
          </div>
          <table className="tabla-respuestas">
            <caption>Historial de reportes por materia</caption>
            <thead>
              <tr>
                <th scope="col">Estudiante</th>
                <th scope="col">Matrícula</th>
                <th scope="col">Materia</th>
                <th scope="col">Grupo</th>
                <th scope="col">Fecha</th>
                <th scope="col">Nota</th>
                <th scope="col">Letra</th>
              </tr>
            </thead>
            <tbody>
              {carpeta.reportes.map((rep) => (
                <tr key={rep.id}><td>{rep.estudiante.nombre}</td><td>{rep.estudiante.matricula}</td><td>{rep.examen.materia}</td><td>{rep.examen.grupo}</td><td>{rep.examen.fecha}</td><td>{rep.calificacionFinal.notaSobre100.toFixed(2)}</td><td>{rep.calificacionFinal.letra}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
      {reportesFiltrados.length === 0 && <p className="detalle">No hay registros para los filtros aplicados.</p>}

      <div className="resumen">
        <p>Distribución de letras: A ({estadisticasGrupo.A}), B+ ({estadisticasGrupo['B+']}), B ({estadisticasGrupo.B}), C+ ({estadisticasGrupo['C+']}), C ({estadisticasGrupo.C}), D ({estadisticasGrupo.D}), F ({estadisticasGrupo.F})</p>
      </div>

      <button type="button" onClick={exportarGrupoCSV}>Exportar CSV grupal</button>
      <div className="resumen">
        <h4>Trazabilidad de importaciones por lote</h4>
        <button type="button" onClick={exportarOperacionesImportacion}>Exportar operaciones de importación (CSV)</button>
        {operacionesImportacion.length === 0 && <p className="detalle">Aún no hay operaciones registradas.</p>}
        {operacionesImportacion.length > 0 && (
          <ul>
            {operacionesImportacion.slice(0, 10).map((operacion) => (
              <li key={operacion.id}>
                {new Date(operacion.timestamp).toLocaleString()} · {operacion.strategy} · Matrículas: {operacion.affectedMatriculas.join(', ') || 'ninguna'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default StepReporteFinal;
