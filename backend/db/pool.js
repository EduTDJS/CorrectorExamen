import path from 'node:path';
import { createSqliteClient } from './client.js';

const DEFAULT_DB_FILE = path.resolve(process.cwd(), 'backend/db/data.sqlite');
const clients = new Map();

const resolveDbFile = () => process.env.REPORTS_DB_FILE || DEFAULT_DB_FILE;

export const getDbPoolClient = async () => {
  const dbFile = resolveDbFile();
  if (clients.has(dbFile)) {
    return clients.get(dbFile);
  }

  const client = await createSqliteClient(dbFile);
  clients.set(dbFile, client);
  return client;
};

export const closeDbPool = () => {
  for (const client of clients.values()) {
    client.close();
  }
  clients.clear();
};

export const getDatabasePath = resolveDbFile;
