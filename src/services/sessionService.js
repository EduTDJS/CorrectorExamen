export const STORAGE_SESSION = 'corrector_session_v1';

let tokenSesionMemoria = '';

const leerTokenPersistido = () => {
  if (typeof window === 'undefined') return '';

  const storage = window.localStorage;
  const crudo = storage.getItem(STORAGE_SESSION);
  if (!crudo) return '';

  try {
    const payload = JSON.parse(crudo);
    if (typeof payload?.token === 'string') {
      return payload.token.trim();
    }
  } catch {
    return '';
  }

  return '';
};

export const establecerTokenSesion = (token = '') => {
  tokenSesionMemoria = String(token || '').trim();

  if (typeof window === 'undefined') return;

  if (!tokenSesionMemoria) {
    window.localStorage.removeItem(STORAGE_SESSION);
    return;
  }

  window.localStorage.setItem(STORAGE_SESSION, JSON.stringify({ token: tokenSesionMemoria }));
};

export const obtenerTokenSesion = () => {
  if (tokenSesionMemoria) return tokenSesionMemoria;

  tokenSesionMemoria = leerTokenPersistido();
  return tokenSesionMemoria;
};

export const limpiarSesion = () => {
  establecerTokenSesion('');
};

export const buildAuthHeaders = (headersBase = {}) => {
  const token = obtenerTokenSesion();
  const headers = { ...headersBase };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};
