import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDbPoolClient } from './pool.js';

const SCHEMA_FILE = path.resolve(process.cwd(), 'backend/db/schema.sql');
let migrated = false;

export const applyMigrations = async () => {
  if (migrated) {
    return;
  }

  const client = await getDbPoolClient();
  const schemaSql = await readFile(SCHEMA_FILE, 'utf-8');
  await client.exec(schemaSql);
  migrated = true;
};

export const resetMigrationStateForTests = () => {
  migrated = false;
};
