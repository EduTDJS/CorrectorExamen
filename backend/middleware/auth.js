import crypto from 'node:crypto';

const AUTH_ERRORS = {
  UNAUTHORIZED: 'auth_unauthorized'
};

const ROLE_ALIASES = {
  administrador: 'admin'
};

class AuthError extends Error {
  constructor(message, { status = 401, code = AUTH_ERRORS.UNAUTHORIZED } = {}) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized.padEnd(normalized.length + (4 - padding), '=') : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
};

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AuthError('Token de sesión inválido: payload no parseable.');
  }
};

const getTokenFromRequest = (req, headerName = 'authorization') => {
  const headerValue = String(req.headers[headerName] || '').trim();
  if (!headerValue.toLowerCase().startsWith('bearer ')) {
    throw new AuthError('No autorizado: falta header Authorization Bearer.');
  }

  return headerValue.slice(7).trim();
};

const verifyToken = (token, secret) => {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new AuthError('Token de sesión inválido: formato incorrecto.');
  }

  const [version, payloadEncoded, signature] = tokenParts;
  if (version !== 'v1') {
    throw new AuthError('Token de sesión inválido: versión no soportada.');
  }

  const signedMessage = `${version}.${payloadEncoded}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedMessage)
    .digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new AuthError('Token de sesión inválido: firma incorrecta.');
  }

  return safeJsonParse(base64UrlDecode(payloadEncoded));
};

const validateIdentityPayload = (payload) => {
  const userId = String(payload?.sub || '').trim();
  const role = normalizeRole(payload?.role);
  const institution = String(payload?.institution || '').trim();
  const tenantId = String(payload?.tenantId || institution || '').trim();
  const sessionId = String(payload?.sessionId || '').trim();
  const exp = Number(payload?.exp);

  if (!userId || !role || !institution || !sessionId || !tenantId || !Number.isFinite(exp)) {
    throw new AuthError('Token de sesión inválido: identidad incompleta.');
  }

  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  if (exp <= nowEpochSeconds) {
    throw new AuthError('Token de sesión expirado.');
  }

  return {
    userId,
    role,
    institution,
    tenantId,
    sessionId,
    tokenVersion: 'v1',
    exp
  };
};

const normalizeRole = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[normalizedRole] || normalizedRole;
};

const authenticate = (req, options = {}) => {
  const sessionTokenSecret = String(options.sessionTokenSecret || process.env.SESSION_TOKEN_SECRET || '').trim();
  if (!sessionTokenSecret) {
    throw new AuthError('SESSION_TOKEN_SECRET no está configurada en el servidor.', {
      status: 500,
      code: 'auth_config_error'
    });
  }

  const token = getTokenFromRequest(req, options.headerName || 'authorization');
  const payload = verifyToken(token, sessionTokenSecret);
  req.user = validateIdentityPayload(payload);
  return req.user;
};

export { AUTH_ERRORS, AuthError, authenticate, normalizeRole };
