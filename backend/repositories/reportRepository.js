import crypto from 'node:crypto';
import { getReportsStorageAdapter } from '../db/database.js';

const nowIso = () => new Date().toISOString();
const createId = (prefix) => {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const parseJson = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const toRecord = (reportPayload, { reportId, createdAt, updatedAt }) => ({
  id: reportId,
  created_at: createdAt,
  updated_at: updatedAt,
  payload_json: JSON.stringify({
    ...reportPayload,
    id: reportId,
    creadoEn: reportPayload.creadoEn || createdAt
  })
});

const toAuditLog = ({ reportId, action, actor, metadata = {} }) => ({
  id: createId('audit'),
  report_id: reportId,
  action,
  actor,
  created_at: nowIso(),
  metadata_json: JSON.stringify(metadata)
});

const fromRecord = (record) => parseJson(record?.payload_json, null);

export const createReport = async (reportPayload, { actor = 'sistema_backend' } = {}) => {
  const storage = await getReportsStorageAdapter();
  const timestamp = nowIso();
  const reportId = String(reportPayload.id || createId('report'));

  const record = toRecord(reportPayload, {
    reportId,
    createdAt: reportPayload.creadoEn || timestamp,
    updatedAt: timestamp
  });

  await storage.createReportRecord(
    record,
    toAuditLog({
      reportId,
      action: 'report_created',
      actor,
      metadata: { source: 'api', id: reportId }
    })
  );

  return fromRecord(record);
};

export const updateReport = async (reportId, reportPayload, { actor = 'sistema_backend' } = {}) => {
  const storage = await getReportsStorageAdapter();
  const current = await storage.getReportRecordById(reportId);
  if (!current) {
    return null;
  }

  const currentPayload = fromRecord(current) || {};
  const updated = toRecord(reportPayload, {
    reportId,
    createdAt: currentPayload.creadoEn || current.created_at,
    updatedAt: nowIso()
  });

  const saved = await storage.updateReportRecord(
    reportId,
    updated,
    toAuditLog({
      reportId,
      action: 'report_updated',
      actor,
      metadata: { source: 'api', id: reportId }
    })
  );

  return saved ? fromRecord(saved) : null;
};

export const getReportById = async (reportId) => {
  const storage = await getReportsStorageAdapter();
  const found = await storage.getReportRecordById(reportId);
  return fromRecord(found);
};

export const listReports = async () => {
  const storage = await getReportsStorageAdapter();
  const rows = await storage.listReportRecords();
  return rows.map((row) => fromRecord(row)).filter(Boolean);
};

export const listAuditLogs = async () => {
  const storage = await getReportsStorageAdapter();
  const rows = await storage.listAuditLogs();

  return rows.map((row) => ({
    id: row.id,
    report_id: row.report_id,
    action: row.action,
    actor: row.actor,
    created_at: row.created_at,
    metadata: parseJson(row.metadata_json, {})
  }));
};
