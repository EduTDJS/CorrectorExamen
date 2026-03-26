import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DB_FILE = process.env.REPORTS_DB_FILE || path.resolve(process.cwd(), 'backend/db/data.json');

const emptyDatabase = () => ({
  schemaVersion: 1,
  reports: [],
  audit_logs: []
});

const ensureDbFile = async () => {
  await mkdir(path.dirname(DB_FILE), { recursive: true });

  try {
    await readFile(DB_FILE, 'utf-8');
  } catch {
    await writeFile(DB_FILE, JSON.stringify(emptyDatabase(), null, 2), 'utf-8');
  }
};

export const readDatabase = async () => {
  await ensureDbFile();

  try {
    const raw = await readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: 1,
      reports: Array.isArray(parsed?.reports) ? parsed.reports : [],
      audit_logs: Array.isArray(parsed?.audit_logs) ? parsed.audit_logs : []
    };
  } catch {
    return emptyDatabase();
  }
};

export const writeDatabase = async (db) => {
  const safeDb = {
    schemaVersion: 1,
    reports: Array.isArray(db?.reports) ? db.reports : [],
    audit_logs: Array.isArray(db?.audit_logs) ? db.audit_logs : []
  };

  await ensureDbFile();
  await writeFile(DB_FILE, JSON.stringify(safeDb, null, 2), 'utf-8');
};

export const getDatabasePath = () => DB_FILE;
