import { applyMigrations } from './migrate.js';
import { getReportsStorageInfo } from './database.js';

const run = async () => {
  const migrationResult = await applyMigrations();
  const info = await getReportsStorageInfo();
  const appliedLabel = migrationResult.applied.length
    ? migrationResult.applied.map((m) => `v${m.version}:${m.name}`).join(', ')
    : 'sin cambios';

  process.stdout.write(
    `Migraciones aplicadas (${appliedLabel}). Versión actual: v${migrationResult.latestVersion}. Modo ${info.mode} (${info.filePath}).\n`
  );
};

run().catch((error) => {
  process.stderr.write(`Error aplicando migraciones: ${error?.message || error}\n`);
  process.exitCode = 1;
});
