import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const TABLES_TO_CHECK = ['reports', 'audit_logs', 'submissions', 'grades'];

export const parseArgs = (argv) => {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    i += 1;
  }
  return options;
};

export const ensureFileExists = async (filePath, label) => {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error(`${label} no es un archivo regular: ${filePath}`);
    }
  } catch (error) {
    throw new Error(`${label} no encontrado: ${filePath}. ${error.message}`);
  }
};

const runSqlite = async (dbFilePath, sql) => {
  const { stdout } = await execFileAsync('sqlite3', ['-json', dbFilePath, sql], {
    timeout: 10_000,
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout?.trim() ? JSON.parse(stdout) : [];
};

export const validateIntegrity = async (dbFilePath) => {
  const pragmaRows = await runSqlite(dbFilePath, 'PRAGMA integrity_check;');
  const pragmaResult = pragmaRows?.[0]?.integrity_check || '';
  if (pragmaResult.toLowerCase() !== 'ok') {
    throw new Error(`PRAGMA integrity_check falló en ${dbFilePath}: ${pragmaResult}`);
  }

  const counts = {};
  for (const table of TABLES_TO_CHECK) {
    const existsRows = await runSqlite(
      dbFilePath,
      `SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}') AS exists_flag;`
    );
    const existsFlag = Number(existsRows?.[0]?.exists_flag || 0) === 1;
    if (!existsFlag) {
      counts[table] = null;
      continue;
    }
    const countRows = await runSqlite(dbFilePath, `SELECT COUNT(*) AS total FROM ${table};`);
    counts[table] = Number(countRows?.[0]?.total || 0);
  }

  return {
    pragma: pragmaResult,
    counts
  };
};

export const createBackupCopy = async ({ sourceDbPath, backupPath }) => {
  await mkdir(path.dirname(backupPath), { recursive: true });
  await execFileAsync('sqlite3', [sourceDbPath, `.backup '${backupPath}'`], {
    timeout: 20_000,
    maxBuffer: 5 * 1024 * 1024
  });
};

export const nowForFile = () => new Date().toISOString().replaceAll(':', '').replaceAll('.', '').replace('T', '-').replace('Z', '');
