import { useState } from 'react';

const estadoAsyncInicial = {
  cargando: false,
  error: ''
};

export const useExamWorkflow = (pasos) => {
  const [pasoActual, setPasoActual] = useState(0);
  const [estadoPaso, setEstadoPaso] = useState(pasos.map(() => ({ ...estadoAsyncInicial })));

  const cambiarEstadoPaso = (indice, nuevoEstado) => {
    setEstadoPaso((previo) => previo.map((estado, i) => (i === indice ? { ...estado, ...nuevoEstado } : estado)));
  };

  const avanzarPaso = async (validarPaso) => {
    if (!validarPaso(pasoActual)) return;
    cambiarEstadoPaso(pasoActual, { cargando: true, error: '' });
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (pasoActual < pasos.length - 1) setPasoActual((previo) => previo + 1);
    } finally {
      cambiarEstadoPaso(pasoActual, { cargando: false });
    }
  };

  const retrocederPaso = (onBack) => {
    if (onBack) onBack();
    if (pasoActual > 0) setPasoActual((previo) => previo - 1);
  };

  return {
    pasoActual,
    pasos,
    estadoPaso,
    estadoActual: estadoPaso[pasoActual],
    avanzarPaso,
    retrocederPaso
  };
};
