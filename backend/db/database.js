import { applyMigrations } from './migrate.js';
import { getDatabasePath, getDbPoolClient } from './pool.js';
import { createJsonFallbackAdapter } from './jsonFallbackAdapter.js';
import { sqlLiteral } from './client.js';

const shouldUseJsonFallback = () => {
  const enabled = String(process.env.REPORTS_STORAGE_DEV_FALLBACK || '').toLowerCase();
  return process.env.NODE_ENV === 'development' && (enabled === '1' || enabled === 'true');
};

let adapter;

const createSqlAdapter = async () => {
  await applyMigrations();
  const client = await getDbPoolClient();

  return {
    mode: 'sqlite',
    filePath: getDatabasePath(),
    async createReportRecord(record, auditLog) {
      await client.exec(`
        BEGIN IMMEDIATE TRANSACTION;
        INSERT INTO reports (id, created_at, updated_at, payload_json)
        VALUES (${sqlLiteral(record.id)}, ${sqlLiteral(record.created_at)}, ${sqlLiteral(record.updated_at)}, ${sqlLiteral(record.payload_json)});
        INSERT INTO audit_logs (id, report_id, action, actor, created_at, metadata_json)
        VALUES (${sqlLiteral(auditLog.id)}, ${sqlLiteral(auditLog.report_id)}, ${sqlLiteral(auditLog.action)}, ${sqlLiteral(auditLog.actor)}, ${sqlLiteral(auditLog.created_at)}, ${sqlLiteral(auditLog.metadata_json)});
        COMMIT;
      `);
      return record;
    },
    async updateReportRecord(reportId, record, auditLog) {
      const existing = await client.get(`SELECT id FROM reports WHERE id = ${sqlLiteral(reportId)};`);
      if (!existing) {
        return null;
      }

      await client.exec(`
        BEGIN IMMEDIATE TRANSACTION;
        UPDATE reports
        SET updated_at = ${sqlLiteral(record.updated_at)},
            payload_json = ${sqlLiteral(record.payload_json)}
        WHERE id = ${sqlLiteral(reportId)};
        INSERT INTO audit_logs (id, report_id, action, actor, created_at, metadata_json)
        VALUES (${sqlLiteral(auditLog.id)}, ${sqlLiteral(auditLog.report_id)}, ${sqlLiteral(auditLog.action)}, ${sqlLiteral(auditLog.actor)}, ${sqlLiteral(auditLog.created_at)}, ${sqlLiteral(auditLog.metadata_json)});
        COMMIT;
      `);
      return record;
    },
    async getReportRecordById(reportId) {
      const row = await client.get(
        `SELECT id, created_at, updated_at, payload_json
         FROM reports
         WHERE id = ${sqlLiteral(reportId)};`
      );
      return row || null;
    },
    async listReportRecords() {
      return client.all(
        `SELECT id, created_at, updated_at, payload_json
         FROM reports
         ORDER BY created_at DESC;`
      );
    },
    async listAuditLogs() {
      return client.all(
        `SELECT id, report_id, action, actor, created_at, metadata_json
         FROM audit_logs
         ORDER BY created_at DESC;`
      );
    }
  };
};

export const getReportsStorageAdapter = async () => {
  if (adapter) {
    return adapter;
  }

  adapter = shouldUseJsonFallback() ? createJsonFallbackAdapter() : await createSqlAdapter();
  return adapter;
};

export const getReportsStorageInfo = async () => {
  const active = await getReportsStorageAdapter();
  return { mode: active.mode, filePath: active.filePath };
};
