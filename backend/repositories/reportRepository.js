import crypto from 'node:crypto';
import { readDatabase, writeDatabase } from '../db/database.js';

const nowIso = () => new Date().toISOString();
const createId = (prefix) => {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const sortByCreatedAtDesc = (items) => [...items].sort((a, b) => {
  const aDate = a?.payload?.creadoEn || a?.created_at || '';
  const bDate = b?.payload?.creadoEn || b?.created_at || '';
  return bDate.localeCompare(aDate);
});

const appendAuditLog = (db, { reportId, action, actor, metadata = {} }) => {
  db.audit_logs.push({
    id: createId('audit'),
    report_id: reportId,
    action,
    actor,
    created_at: nowIso(),
    metadata
  });
};

export const createReport = async (reportPayload, { actor = 'sistema_backend' } = {}) => {
  const db = await readDatabase();
  const timestamp = nowIso();
  const reportId = String(reportPayload.id || createId('report'));

  const record = {
    id: reportId,
    created_at: reportPayload.creadoEn || timestamp,
    updated_at: timestamp,
    payload: {
      ...reportPayload,
      id: reportId,
      creadoEn: reportPayload.creadoEn || timestamp
    }
  };

  db.reports.push(record);
  appendAuditLog(db, {
    reportId,
    action: 'report_created',
    actor,
    metadata: { source: 'api', id: reportId }
  });

  await writeDatabase(db);
  return record.payload;
};

export const updateReport = async (reportId, reportPayload, { actor = 'sistema_backend' } = {}) => {
  const db = await readDatabase();
  const index = db.reports.findIndex((report) => report.id === reportId);
  if (index === -1) {
    return null;
  }

  const current = db.reports[index];
  const updated = {
    ...current,
    updated_at: nowIso(),
    payload: {
      ...reportPayload,
      id: reportId,
      creadoEn: current.payload?.creadoEn || current.created_at
    }
  };

  db.reports[index] = updated;
  appendAuditLog(db, {
    reportId,
    action: 'report_updated',
    actor,
    metadata: { source: 'api', id: reportId }
  });

  await writeDatabase(db);
  return updated.payload;
};

export const getReportById = async (reportId) => {
  const db = await readDatabase();
  const found = db.reports.find((report) => report.id === reportId);
  return found?.payload || null;
};

export const listReports = async () => {
  const db = await readDatabase();
  return sortByCreatedAtDesc(db.reports).map((report) => report.payload);
};

export const listAuditLogs = async () => {
  const db = await readDatabase();
  return [...db.audit_logs].sort((a, b) => b.created_at.localeCompare(a.created_at));
};
