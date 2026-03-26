function StepConfiguracion({ datos, errores, actualizarDato, setRespuestasLista, convertirTextoALista, puntosPorPregunta }) {
  return (
    <div className="paso">
      <h2>Configuración del examen</h2>
      <label>Materia<input value={datos.materia} onChange={(e) => actualizarDato('materia', e.target.value)} />{errores.materia && <span className="error">{errores.materia}</span>}</label>
      <label>Grupo<input value={datos.grupo} onChange={(e) => actualizarDato('grupo', e.target.value)} />{errores.grupo && <span className="error">{errores.grupo}</span>}</label>
      <label>Fecha<input type="date" value={datos.fecha} onChange={(e) => actualizarDato('fecha', e.target.value)} />{errores.fecha && <span className="error">{errores.fecha}</span>}</label>
      <label>Nombre estudiante<input value={datos.estudianteNombre} onChange={(e) => actualizarDato('estudianteNombre', e.target.value)} />{errores.estudianteNombre && <span className="error">{errores.estudianteNombre}</span>}</label>
      <label>Matrícula estudiante<input value={datos.estudianteMatricula} onChange={(e) => actualizarDato('estudianteMatricula', e.target.value)} />{errores.estudianteMatricula && <span className="error">{errores.estudianteMatricula}</span>}</label>
      <label> Total de preguntas
        <input type="number" min="1" value={datos.totalPreguntas} onChange={(e) => { actualizarDato('totalPreguntas', e.target.value); setRespuestasLista((previo) => convertirTextoALista(previo, e.target.value)); }} />
        {errores.totalPreguntas && (<span className="error">{errores.totalPreguntas}</span>)}
      </label>
      <label>Clave de respuestas (solo A/B/C/D)
        <input value={datos.claveRespuestas} onChange={(e) => actualizarDato('claveRespuestas', e.target.value)} placeholder="Ejemplo: ABCDABCD" />
        {errores.claveRespuestas && (<span className="error">{errores.claveRespuestas}</span>)}
      </label>
      <p className="detalle">Cada pregunta vale {puntosPorPregunta.toFixed(2)} puntos.</p>
    </div>
  );
}

export default StepConfiguracion;
