function StepIndicator({ pasos, pasoActual }) {
  return (
    <ol className="pasos">
      {pasos.map((paso, indice) => (
        <li key={paso} className={indice === pasoActual ? 'activo' : ''}>
          {indice + 1}. {paso}
        </li>
      ))}
    </ol>
  );
}

export default StepIndicator;
