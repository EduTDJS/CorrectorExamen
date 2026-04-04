function TopBar({
  panelAjustesAbierto,
  onToggleAjustes,
  vistaActual,
  onCambiarVista,
}) {
  return (
    <div className="barra-superior">
      <div>
        <h1>CalificaYa</h1>
        <p className="subtitulo">Flujo guiado de evaluación automática</p>
        <nav className="menu-principal" aria-label="Navegación principal">
          <button
            type="button"
            className={vistaActual === "inicio" ? "activo" : ""}
            onClick={() => onCambiarVista("inicio")}
          >
            Inicio
          </button>
          <button
            type="button"
            className={vistaActual === "correccion" ? "activo" : ""}
            onClick={() => onCambiarVista("correccion")}
          >
            Corrector
          </button>
          <button
            type="button"
            className={vistaActual === "organizacion" ? "activo" : ""}
            onClick={() => onCambiarVista("organizacion")}
          >
            Organización
          </button>
        </nav>
      </div>
      <button type="button" onClick={onToggleAjustes}>
        {panelAjustesAbierto ? "Cerrar ajustes" : "Ajustes API"}
      </button>
    </div>
  );
}

export default TopBar;
