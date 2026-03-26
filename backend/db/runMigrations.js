import { applyMigrations } from './migrate.js';
import { getReportsStorageInfo } from './database.js';

const run = async () => {
  await applyMigrations();
  const info = await getReportsStorageInfo();
  process.stdout.write(`Migraciones aplicadas en modo ${info.mode} (${info.filePath}).\n`);
};

run().catch((error) => {
  process.stderr.write(`Error aplicando migraciones: ${error?.message || error}\n`);
  process.exitCode = 1;
});
