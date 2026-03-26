#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createBackupCopy,
  validateIntegrity
} from './backupUtils.js';

const execFileAsync = promisify(execFile);

const run = async () => {
  const artifactsDir = path.resolve('artifacts/restore-drill');
  await mkdir(artifactsDir, { recursive: true });

  const sourceDbPath = path.resolve(artifactsDir, 'drill-source.sqlite');
  const backupPath = path.resolve(artifactsDir, 'drill-backup.sqlite');
  const restorePath = path.resolve(artifactsDir, 'drill-restore.sqlite');
  const schemaPath = path.resolve('backend/db/schema.sql');
  await execFileAsync('sqlite3', [sourceDbPath, `.read ${schemaPath}`], {
    timeout: 20_000,
    maxBuffer: 5 * 1024 * 1024
  });
  const now = new Date().toISOString();
  const insertProbeSql = `
    INSERT INTO reports (id, created_at, updated_at, payload_json)
    VALUES ('probe_report', '${now}', '${now}', '{"probe":true,"scope":"restore-drill"}');

    INSERT INTO audit_logs (id, report_id, action, actor, created_at, metadata_json)
    VALUES ('probe_audit', 'probe_report', 'restore_drill_probe', 'system.ci', '${now}', '{"source":"ci"}');
  `;
  await execFileAsync('sqlite3', [sourceDbPath, insertProbeSql], { timeout: 20_000, maxBuffer: 5 * 1024 * 1024 });

  const sourceValidation = await validateIntegrity(sourceDbPath);
  await createBackupCopy({ sourceDbPath, backupPath });
  const backupValidation = await validateIntegrity(backupPath);
  await createBackupCopy({ sourceDbPath: backupPath, backupPath: restorePath });
  const restoredValidation = await validateIntegrity(restorePath);

  const countsMatch =
    JSON.stringify(sourceValidation.counts) === JSON.stringify(backupValidation.counts) &&
    JSON.stringify(backupValidation.counts) === JSON.stringify(restoredValidation.counts);

  if (!countsMatch) {
    throw new Error('Restore drill inválido: los conteos entre source/backup/restore no coinciden.');
  }

  const evidence = {
    timestamp: now,
    status: 'ok',
    sourceDbPath,
    backupPath,
    restorePath,
    sourceValidation,
    backupValidation,
    restoredValidation
  };

  const evidencePath = path.resolve(artifactsDir, 'restore-drill-evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf-8');
  process.stdout.write(`Restore drill completado. Evidencia: ${evidencePath}\n`);
};

run().catch((error) => {
  process.stderr.write(`Error en restore drill: ${error?.message || error}\n`);
  process.exitCode = 1;
});
