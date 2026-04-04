function StepConfiguracion({
  datos,
  errores,
  actualizarDato,
  setRespuestasLista,
  convertirTextoALista,
  puntosPorPregunta,
  rubricas,
  rubricaSeleccionadaId,
  onSeleccionarRubrica,
  estadoRubricas,
  rosters,
  rosterSeleccionadoId,
  onSeleccionarRoster,
  estadoRosters,
  estudiantesRoster,
  estudianteRosterSeleccionado,
  onSeleccionarEstudianteRoster,
}) {
  return (
    <div className="paso">
      <h2>Configuración del examen</h2>
      <label>
        Plantilla de rúbrica
        <select
          value={rubricaSeleccionadaId}
          onChange={(e) => onSeleccionarRubrica(e.target.value)}
        >
          <option value="">Sin plantilla</option>
          {rubricas.map((rubrica) => (
            <option key={rubrica.id} value={rubrica.id}>
              {rubrica.materia} · {rubrica.grado} · v{rubrica.version}
            </option>
          ))}
        </select>
      </label>
      {estadoRubricas.error && (
        <p className="detalle">{estadoRubricas.error}</p>
      )}
      {estadoRubricas.cargando && (
        <p className="detalle">Cargando plantillas de rúbrica…</p>
      )}
      <label>
        Materia
        <input
          value={datos.materia}
          onChange={(e) => actualizarDato("materia", e.target.value)}
        />
        {errores.materia && <span className="error">{errores.materia}</span>}
      </label>
      <label>
        Grupo
        <input
          value={datos.grupo}
          onChange={(e) => actualizarDato("grupo", e.target.value)}
        />
        {errores.grupo && <span className="error">{errores.grupo}</span>}
      </label>
      <label>
        Periodo académico
        <input
          value={datos.periodo || ""}
          onChange={(e) => actualizarDato("periodo", e.target.value)}
          placeholder="Ejemplo: 2026-T1"
        />
      </label>
      <label>
        Seleccionar lista del grupo
        <select
          value={rosterSeleccionadoId}
          onChange={(e) => onSeleccionarRoster(e.target.value)}
        >
          <option value="">Sin lista seleccionada</option>
          {rosters.map((roster) => (
            <option key={roster.id} value={roster.id}>
              {roster.group} · {roster.term}
            </option>
          ))}
        </select>
      </label>
      {estadoRosters.error && <p className="detalle">{estadoRosters.error}</p>}
      {estadoRosters.cargando && (
        <p className="detalle">Cargando listas del grupo…</p>
      )}
      {rosterSeleccionadoId && (
        <label>
          Estudiante de la lista
          <select
            value={estudianteRosterSeleccionado}
            onChange={(e) => onSeleccionarEstudianteRoster(e.target.value)}
          >
            <option value="">Seleccionar estudiante</option>
            {estudiantesRoster.map((student) => (
              <option
                key={student.id || student.matricula}
                value={student.id || student.matricula}
              >
                {student.nombre} · {student.matricula}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Fecha
        <input
          type="date"
          value={datos.fecha}
          onChange={(e) => actualizarDato("fecha", e.target.value)}
        />
        {errores.fecha && <span className="error">{errores.fecha}</span>}
      </label>
      <label>
        Nombre estudiante
        <input
          value={datos.estudianteNombre}
          onChange={(e) => actualizarDato("estudianteNombre", e.target.value)}
        />
        {errores.estudianteNombre && (
          <span className="error">{errores.estudianteNombre}</span>
        )}
      </label>
      <label>
        Matrícula estudiante
        <input
          value={datos.estudianteMatricula}
          onChange={(e) =>
            actualizarDato("estudianteMatricula", e.target.value)
          }
        />
        {errores.estudianteMatricula && (
          <span className="error">{errores.estudianteMatricula}</span>
        )}
      </label>
      <label>
        {" "}
        Total de preguntas
        <input
          type="number"
          min="1"
          value={datos.totalPreguntas}
          onChange={(e) => {
            actualizarDato("totalPreguntas", e.target.value);
            setRespuestasLista((previo) =>
              convertirTextoALista(previo, e.target.value),
            );
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
          onChange={(e) => actualizarDato("claveRespuestas", e.target.value)}
          placeholder="Ejemplo: ABCDABCD"
        />
        {errores.claveRespuestas && (
          <span className="error">{errores.claveRespuestas}</span>
        )}
      </label>
      <p className="detalle">
        Cada pregunta vale {puntosPorPregunta.toFixed(2)} puntos.
      </p>
    </div>
  );
}

export default StepConfiguracion;
