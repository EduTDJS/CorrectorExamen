export class DbError extends Error {
  constructor(message, { code = 'db_error', cause } = {}) {
    super(message, { cause });
    this.name = 'DbError';
    this.code = code;
  }
}

export class DbTimeoutError extends DbError {
  constructor(message = 'La operación de base de datos excedió el tiempo máximo.', options = {}) {
    super(message, { code: 'db_timeout', ...options });
    this.name = 'DbTimeoutError';
  }
}

export class DbConnectionError extends DbError {
  constructor(message = 'No se pudo abrir conexión a la base de datos.', options = {}) {
    super(message, { code: 'db_connection_error', ...options });
    this.name = 'DbConnectionError';
  }
}

export class DbQueryError extends DbError {
  constructor(message = 'Error ejecutando consulta SQL.', options = {}) {
    super(message, { code: 'db_query_error', ...options });
    this.name = 'DbQueryError';
  }
}
