function StepIndicator({ pasos, pasoActual }) {
  return (
    <nav aria-label="Progreso del flujo de corrección">
      <ol className="pasos">
        {pasos.map((paso, indice) => (
          <li key={paso} className={indice === pasoActual ? 'activo' : ''} aria-current={indice === pasoActual ? 'step' : undefined}>
            {indice + 1}. {paso}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default StepIndicator;
