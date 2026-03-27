import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DB_FILE = process.env.REPORTS_JSON_FALLBACK_FILE || path.resolve(process.cwd(), 'backend/db/data.fallback.json');

const emptyDatabase = () => ({
  schemaVersion: 3,
  reports: [],
  audit_logs: [],
  report_versions: []
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
      schemaVersion: 3,
      reports: Array.isArray(parsed?.reports) ? parsed.reports : [],
      audit_logs: Array.isArray(parsed?.audit_logs) ? parsed.audit_logs : [],
      report_versions: Array.isArray(parsed?.report_versions) ? parsed.report_versions : []
    };
  } catch {
    return emptyDatabase();
  }
};

const writeDatabase = async (db) => {
  const safeDb = {
    schemaVersion: 3,
    reports: Array.isArray(db?.reports) ? db.reports : [],
    audit_logs: Array.isArray(db?.audit_logs) ? db.audit_logs : [],
    report_versions: Array.isArray(db?.report_versions) ? db.report_versions : []
  };

  await ensureDbFile();
  await writeFile(DB_FILE, JSON.stringify(safeDb, null, 2), 'utf-8');
};

const getById = (db, reportId) => db.reports.find((report) => report.id === reportId) || null;

export const createJsonFallbackAdapter = () => ({
  mode: 'json_fallback',
  filePath: DB_FILE,
  async upsertReportGraph(reportRecord, _normalizedRecord, auditLogs = [], reportVersion = null) {
    const db = await readDatabase();
    const index = db.reports.findIndex((report) => report.id === reportRecord.id);

    if (index === -1) {
      db.reports.push(reportRecord);
    } else {
      db.reports[index] = reportRecord;
    }

    db.audit_logs.push(...auditLogs);
    if (reportVersion) {
      const currentVersion = db.report_versions
        .filter((version) => version.report_id === reportVersion.reportId)
        .reduce((max, version) => Math.max(max, Number(version.version_number) || 0), 0);
      db.report_versions.push({
        id: `rver_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
        report_id: reportVersion.reportId,
        version_number: currentVersion + 1,
        snapshot_json: reportVersion.snapshotJson,
        diff_json: reportVersion.diffJson,
        actor: reportVersion.actor,
        created_at: reportVersion.createdAt
      });
    }
    await writeDatabase(db);
    return reportRecord;
  },
  async deleteReportGraph(reportId, auditLogs = []) {
    const db = await readDatabase();
    const index = db.reports.findIndex((report) => report.id === reportId);
    if (index === -1) {
      return false;
    }

    db.reports.splice(index, 1);
    db.audit_logs.push(...auditLogs);
    await writeDatabase(db);
    return true;
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
  },
  async listReportVersions(reportId) {
    const db = await readDatabase();
    return db.report_versions
      .filter((version) => version.report_id === reportId)
      .sort((a, b) => Number(b.version_number) - Number(a.version_number));
  },
  async getReportVersion(reportId, versionNumber) {
    const db = await readDatabase();
    return db.report_versions.find((version) => (
      version.report_id === reportId && Number(version.version_number) === Number(versionNumber)
    )) || null;
  }
});
