#!/usr/bin/env node
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { getDatabasePath } from './pool.js';
import {
  createBackupCopy,
  ensureFileExists,
  nowForFile,
  parseArgs,
  validateIntegrity
} from './backupUtils.js';

const run = async () => {
  const options = parseArgs(process.argv.slice(2));
  const sourceDbPath = path.resolve(options.source || getDatabasePath());
  const backupDir = path.resolve(options['output-dir'] || 'backend/db/backups');
  const outputName = options.output || `backup-${nowForFile()}.sqlite`;
  const backupPath = path.resolve(backupDir, outputName);

  await ensureFileExists(sourceDbPath, 'Base de datos origen');
  const sourceValidation = await validateIntegrity(sourceDbPath);
  await createBackupCopy({ sourceDbPath, backupPath });
  const backupValidation = await validateIntegrity(backupPath);

  if (JSON.stringify(sourceValidation.counts) !== JSON.stringify(backupValidation.counts)) {
    throw new Error('La validación de integridad falló: conteos entre origen y backup no coinciden.');
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    sourceDbPath,
    backupPath,
    sourceValidation,
    backupValidation
  };

  await writeFile(`${backupPath}.evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf-8');
  process.stdout.write(`Backup generado y validado: ${backupPath}\n`);
  process.stdout.write(`Evidencia: ${backupPath}.evidence.json\n`);
};

run().catch((error) => {
  process.stderr.write(`Error en backup: ${error?.message || error}\n`);
  process.exitCode = 1;
});
