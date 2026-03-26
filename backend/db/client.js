import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DbConnectionError, DbQueryError, DbTimeoutError } from './errors.js';

const execFileAsync = promisify(execFile);
const DEFAULT_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 1500);

const runSqlite = async ({ dbFilePath, sql, json = false, timeoutMs = DEFAULT_QUERY_TIMEOUT_MS }) => {
  try {
    const args = [];
    if (json) {
      args.push('-json');
    }
    args.push(dbFilePath, `\n${sql}`);

    const { stdout } = await execFileAsync('sqlite3', args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    });

    return stdout;
  } catch (error) {
    if (error?.killed && error?.signal === 'SIGTERM') {
      throw new DbTimeoutError(`Timeout de consulta excedido (${timeoutMs}ms).`);
    }
    throw new DbQueryError('No se pudo ejecutar consulta SQLite.', { cause: error });
  }
};

export const sqlLiteral = (value) => {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return `'${raw.replaceAll("'", "''")}'`;
};

export const createSqliteClient = async (dbFilePath) => {
  try {
    await mkdir(path.dirname(dbFilePath), { recursive: true });
    await runSqlite({
      dbFilePath,
      sql: 'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000; PRAGMA foreign_keys = ON;'
    });

    return {
      filePath: dbFilePath,
      async exec(sql, timeoutMs) {
        await runSqlite({ dbFilePath, sql, timeoutMs });
      },
      async run(sql, timeoutMs) {
        await runSqlite({ dbFilePath, sql, timeoutMs });
      },
      async get(sql, timeoutMs) {
        const stdout = await runSqlite({ dbFilePath, sql, json: true, timeoutMs });
        const rows = stdout?.trim() ? JSON.parse(stdout) : [];
        return rows[0] || null;
      },
      async all(sql, timeoutMs) {
        const stdout = await runSqlite({ dbFilePath, sql, json: true, timeoutMs });
        return stdout?.trim() ? JSON.parse(stdout) : [];
      },
      close() {}
    };
  } catch (error) {
    throw new DbConnectionError('No se pudo inicializar SQLite.', { cause: error });
  }
};
