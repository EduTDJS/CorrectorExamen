import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DB_FILE = process.env.REPORTS_JSON_FALLBACK_FILE || path.resolve(process.cwd(), 'backend/db/data.fallback.json');

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

const readDatabase = async () => {
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

const writeDatabase = async (db) => {
  const safeDb = {
    schemaVersion: 1,
    reports: Array.isArray(db?.reports) ? db.reports : [],
    audit_logs: Array.isArray(db?.audit_logs) ? db.audit_logs : []
  };

  await ensureDbFile();
  await writeFile(DB_FILE, JSON.stringify(safeDb, null, 2), 'utf-8');
};

const getById = (db, reportId) => db.reports.find((report) => report.id === reportId) || null;

export const createJsonFallbackAdapter = () => ({
  mode: 'json_fallback',
  filePath: DB_FILE,
  async createReportRecord(record, auditLog) {
    const db = await readDatabase();
    db.reports.push(record);
    db.audit_logs.push(auditLog);
    await writeDatabase(db);
    return record;
  },
  async updateReportRecord(reportId, record, auditLog) {
    const db = await readDatabase();
    const index = db.reports.findIndex((report) => report.id === reportId);
    if (index === -1) {
      return null;
    }

    db.reports[index] = record;
    db.audit_logs.push(auditLog);
    await writeDatabase(db);
    return record;
  },
  async getReportRecordById(reportId) {
    const db = await readDatabase();
    return getById(db, reportId);
  },
  async listReportRecords() {
    const db = await readDatabase();
    return [...db.reports].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async listAuditLogs() {
    const db = await readDatabase();
    return [...db.audit_logs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
});
