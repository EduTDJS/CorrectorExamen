export const STORAGE_DECISION_FINAL = 'corrector_decision_final';
export const STORAGE_REPORTES = 'corrector_historial_reportes_v1';

const decisionFinalInicial = {
  puntuacion: '',
  justificacion: ''
};

export const leerDecisionFinal = () => {
  const crudo = window.localStorage.getItem(STORAGE_DECISION_FINAL);
  if (!crudo) return decisionFinalInicial;

  try {
    const parseado = JSON.parse(crudo);
    return {
      puntuacion: parseado?.puntuacion || '',
      justificacion: parseado?.justificacion || ''
    };
  } catch {
    return decisionFinalInicial;
  }
};

export const guardarDecisionFinal = (decisionFinal) => {
  window.localStorage.setItem(STORAGE_DECISION_FINAL, JSON.stringify(decisionFinal));
};

export const leerReportes = () => {
  const crudo = window.localStorage.getItem(STORAGE_REPORTES);
  if (!crudo) return [];
  try {
    const parseado = JSON.parse(crudo);
    return Array.isArray(parseado) ? parseado : [];
  } catch {
    return [];
  }
};

export const guardarReportes = (reportes) => {
  window.localStorage.setItem(STORAGE_REPORTES, JSON.stringify(reportes));
};
