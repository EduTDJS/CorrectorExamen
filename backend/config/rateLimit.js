const asPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const RATE_LIMIT_CONFIG = {
  windowMs: asPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  defaultMaxRequests: asPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 20),
  keyStrategy: (process.env.RATE_LIMIT_KEY_STRATEGY || 'authenticated_or_token_or_ip').toLowerCase(),
  nearThresholdRatio: Number(process.env.RATE_LIMIT_NEAR_THRESHOLD_RATIO || 0.8),
  roleLimits: {
    docente: asPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS_DOCENTE, 20),
    coordinador: asPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS_COORDINADOR, 30),
    admin: asPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS_ADMIN, 40)
  }
};

const getRateLimitPolicy = (role = '') => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const maxRequests = RATE_LIMIT_CONFIG.roleLimits[normalizedRole] || RATE_LIMIT_CONFIG.defaultMaxRequests;

  return {
    maxRequests,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
    nearThresholdRatio: RATE_LIMIT_CONFIG.nearThresholdRatio
  };
};

export { RATE_LIMIT_CONFIG, getRateLimitPolicy };
