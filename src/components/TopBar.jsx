function TopBar({ panelAjustesAbierto, onToggleAjustes }) {
  return (
    <div className="barra-superior">
      <div>
        <h1>Corrector de Exámenes</h1>
        <p className="subtitulo">Flujo guiado de evaluación automática</p>
      </div>
      <button type="button" onClick={onToggleAjustes}>
        {panelAjustesAbierto ? 'Cerrar ajustes' : 'Ajustes API'}
      </button>
    </div>
  );
}

export default TopBar;
