import { useMemo, useState } from 'react';
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
  onTextoImportacion,
  onAplicarFilaImportada,
  onRegistrarFilasImportadas,
  resumenRegistroLote,
  estrategiaConflictoImportacion,
  onCambiarEstrategiaConflicto,
  resumenEstrategiaImportacion
}) {
  const [mostrarModalPegado, setMostrarModalPegado] = useState(false);
  const [textoPegado, setTextoPegado] = useState('');
  const [filasPorPagina, setFilasPorPagina] = useState(15);
  const [paginaActual, setPaginaActual] = useState(1);
  const [busquedaFilas, setBusquedaFilas] = useState('');
  const esDispositivoMovil = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

  const normalizarTextoBusqueda = (texto = '') => String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const filasFiltradas = useMemo(() => {
    const termino = normalizarTextoBusqueda(busquedaFilas);
    if (!termino) {
      return importacionEstado.filas;
    }

    return importacionEstado.filas.filter((fila) => {
      const nombre = normalizarTextoBusqueda(fila.estudianteNombre);
      const matricula = normalizarTextoBusqueda(fila.estudianteMatricula);
      return nombre.includes(termino) || matricula.includes(termino);
    });
  }, [busquedaFilas, importacionEstado.filas]);

  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / filasPorPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const inicioPagina = (paginaSegura - 1) * filasPorPagina;
  const filasVisibles = filasFiltradas.slice(inicioPagina, inicioPagina + filasPorPagina);

  const descargarPlantilla = () => {
    const contenido = 'estudianteNombre,estudianteMatricula,respuestas\n';
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'plantilla-importacion-respuestas.csv';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
  };

  const importarDesdeTexto = async () => {
    await onTextoImportacion(textoPegado);
    setMostrarModalPegado(false);
  };

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
              <div className="acciones-entrada-importacion">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => onArchivoImportacion(e.target.files?.[0] || null)}
                />
                <button type="button" onClick={descargarPlantilla} aria-label="Descargar plantilla CSV con encabezados obligatorios">
                  Descargar plantilla
                </button>
                <button type="button" onClick={() => setMostrarModalPegado(true)} aria-label="Abrir modal para pegar datos desde Excel o Google Sheets">
                  Pegar desde Excel/Sheets
                </button>
              </div>
            </label>

            {mostrarModalPegado && (
              <div className="modal-importacion" role="dialog" aria-modal="true" aria-label="Pegar desde Excel o Google Sheets">
                <div className="modal-importacion-contenido">
                  <h4>Pegar desde Excel/Sheets</h4>
                  <p className="detalle">Pegue contenido TSV o CSV con encabezados: estudianteNombre, estudianteMatricula, respuestas.</p>
                  <textarea
                    rows="8"
                    value={textoPegado}
                    onChange={(e) => setTextoPegado(e.target.value)}
                    placeholder={'estudianteNombre\testudianteMatricula\trespuestas\nAna Pérez\t2026001\tABCD'}
                  />
                  <div className="acciones-importacion-lote">
                    <button type="button" onClick={importarDesdeTexto}>Importar texto pegado</button>
                    <button type="button" onClick={() => setMostrarModalPegado(false)}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

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
                  <label>
                    Buscar por matrícula o nombre
                    <input
                      type="search"
                      value={busquedaFilas}
                      onChange={(e) => {
                        setBusquedaFilas(e.target.value);
                        setPaginaActual(1);
                      }}
                      placeholder="Ej: 2026001 o Ana Pérez"
                    />
                  </label>
                  <label>
                    Filas por página
                    <select
                      value={filasPorPagina}
                      onChange={(e) => {
                        setFilasPorPagina(Number(e.target.value));
                        setPaginaActual(1);
                      }}
                    >
                      {[10, 15, 25, 50].map((valor) => (
                        <option key={valor} value={valor}>{valor}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="detalle">
                  Mostrando {filasVisibles.length} de {filasFiltradas.length} filas
                  {busquedaFilas.trim() ? ` (filtradas de ${importacionEstado.filas.length})` : ''}.
                </p>
                <div className="acciones-importacion-lote">
                  <label>
                    Estrategia de conflicto
                    <select
                      value={estrategiaConflictoImportacion}
                      onChange={(e) => onCambiarEstrategiaConflicto(e.target.value)}
                    >
                      <option value="omitir_existentes">omitir existentes</option>
                      <option value="sobrescribir_por_matricula">sobrescribir por matrícula</option>
                      <option value="crear_solo_nuevos">crear solo nuevos</option>
                    </select>
                  </label>
                </div>
                <p className="detalle">
                  Según la estrategia: Creados {resumenEstrategiaImportacion.creados} ·
                  {' '}Actualizados {resumenEstrategiaImportacion.actualizados} ·
                  {' '}Omitidos {resumenEstrategiaImportacion.omitidos}
                </p>
                <div className="acciones-importacion-lote">
                  <button type="button" onClick={() => onRegistrarFilasImportadas()} aria-label="Registrar todas las filas válidas importadas">
                    Registrar todas las válidas
                  </button>
                  <button type="button" onClick={() => onRegistrarFilasImportadas(filasVisibles)} aria-label="Registrar solo las filas mostradas en la vista previa">
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
                    {filasVisibles.map((fila) => (
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
                <div className="acciones-importacion-lote">
                  <button type="button" onClick={() => setPaginaActual((prev) => Math.max(prev - 1, 1))} disabled={paginaSegura === 1}>
                    Página anterior
                  </button>
                  <span className="detalle">Página {paginaSegura} de {totalPaginas}</span>
                  <button type="button" onClick={() => setPaginaActual((prev) => Math.min(prev + 1, totalPaginas))} disabled={paginaSegura === totalPaginas}>
                    Página siguiente
                  </button>
                </div>
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
