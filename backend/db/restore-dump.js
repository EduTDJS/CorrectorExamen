#!/usr/bin/env node
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  createBackupCopy,
  ensureFileExists,
  parseArgs,
  validateIntegrity
} from './backupUtils.js';

const run = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.backup) {
    throw new Error('Debe indicar --backup <ruta-al-backup.sqlite>.');
  }

  const backupPath = path.resolve(options.backup);
  const restoreTarget = path.resolve(options.target || 'backend/db/restore-target.sqlite');

  await ensureFileExists(backupPath, 'Backup');
  await mkdir(path.dirname(restoreTarget), { recursive: true });

  const backupValidation = await validateIntegrity(backupPath);
  await createBackupCopy({ sourceDbPath: backupPath, backupPath: restoreTarget });
  const restoredValidation = await validateIntegrity(restoreTarget);

  if (JSON.stringify(backupValidation.counts) !== JSON.stringify(restoredValidation.counts)) {
    throw new Error('La validación de restore falló: conteos entre backup y restore no coinciden.');
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    backupPath,
    restoreTarget,
    backupValidation,
    restoredValidation
  };

  await writeFile(`${restoreTarget}.evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf-8');
  process.stdout.write(`Restore validado en: ${restoreTarget}\n`);
  process.stdout.write(`Evidencia: ${restoreTarget}.evidence.json\n`);
};

run().catch((error) => {
  process.stderr.write(`Error en restore: ${error?.message || error}\n`);
  process.exitCode = 1;
});
