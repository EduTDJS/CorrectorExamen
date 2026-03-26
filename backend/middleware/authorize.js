const AUTHZ_ERRORS = {
  FORBIDDEN: 'auth_forbidden'
};

class AuthorizationError extends Error {
  constructor(message, { status = 403, code = AUTHZ_ERRORS.FORBIDDEN } = {}) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
    this.code = code;
  }
}

const PERMISSIONS_BY_ROLE = {
  admin: new Set(['create_exam', 'correct_exam', 'export_report', 'view_history']),
  docente: new Set(['create_exam', 'correct_exam', 'export_report', 'view_history']),
  coordinador: new Set(['create_exam', 'correct_exam', 'export_report', 'view_history']),
  corrector: new Set(['correct_exam', 'view_history']),
  auditor: new Set(['export_report', 'view_history'])
};

const authorize = (req, action) => {
  const role = String(req.user?.role || '').trim();
  const permissions = PERMISSIONS_BY_ROLE[role];

  if (!permissions || !permissions.has(action)) {
    throw new AuthorizationError(`Acceso denegado para la acción "${action}".`);
  }
};

export { AUTHZ_ERRORS, AuthorizationError, PERMISSIONS_BY_ROLE, authorize };
