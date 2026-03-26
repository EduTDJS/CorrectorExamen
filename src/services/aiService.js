import { buildAuthHeaders } from './sessionService';

class AIServiceError extends Error {
  constructor(message, { status, code, provider } = {}) {
    super(message);
    this.name = 'AIServiceError';
    this.status = status;
    this.code = code;
    this.provider = provider;
  }
}

const mapearErrorIntegracion = ({ status, code, provider, fallbackMessage }) => {
  if (code === 'provider_config_error') {
    return `Configuración incompleta del proveedor ${provider || 'IA'} en servidor.`;
  }

  if (code === 'provider_timeout') {
    return `El proveedor ${provider || 'IA'} superó el tiempo límite de respuesta.`;
  }

  if (code === 'provider_contract_error') {
    return `El proveedor ${provider || 'IA'} respondió con un formato inválido.`;
  }

  if (status === 401) {
    return 'Tu sesión expiró o es inválida. Inicia sesión nuevamente para continuar.';
  }

  if (status === 403) {
    return 'No tienes permisos suficientes para solicitar sugerencias de IA.';
  }

  if (status === 429) {
    return `Límite de cuota o tasa alcanzado en ${provider || 'el proveedor de IA'}.`;
  }

  return fallbackMessage || 'Error inesperado al consultar el backend de IA.';
};

export const obtenerProveedorIA = async () => {
  const response = await fetch('/api/calificacion/proveedor');
  const data = await response.json();

  if (!response.ok) {
    throw new AIServiceError(data?.error?.message || 'No se pudo obtener el proveedor de IA activo.', {
      status: response.status,
      code: data?.error?.code,
      provider: data?.error?.provider
    });
  }

  return {
    proveedor: data?.proveedor || 'desconocido',
    modelo: data?.modelo || 'desconocido',
    timeoutMs: Number(data?.timeoutMs || 0)
  };
};

export const sugerirCalificacionIA = async ({ datos, puntaje }) => {
  const response = await fetch('/api/calificacion/sugerir', {
    method: 'POST',
    headers: buildAuthHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify({ datos, puntaje })
  });

  const data = await response.json();

  if (!response.ok) {
    const fallbackMessage = data?.error?.message || 'Error inesperado al consultar el backend de IA.';
    throw new AIServiceError(mapearErrorIntegracion({
      status: response.status,
      code: data?.error?.code,
      provider: data?.error?.provider,
      fallbackMessage
    }), {
      status: response.status,
      code: data?.error?.code,
      provider: data?.error?.provider
    });
  }

  const puntuacion = Number(data?.puntuacion);
  const justificacion = String(data?.justificacion || '').trim();

  if (!Number.isFinite(puntuacion) || puntuacion < 0 || puntuacion > 100 || !justificacion) {
    throw new AIServiceError('El backend devolvió una sugerencia de IA inválida.', {
      code: 'backend_contract_error',
      provider: data?.proveedor
    });
  }

  return {
    puntuacion: puntuacion.toFixed(2),
    justificacion,
    proveedor: data?.proveedor || 'desconocido',
    modelo: data?.modelo || 'desconocido'
  };
};
