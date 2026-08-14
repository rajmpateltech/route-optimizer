import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function migrate(): Promise<void> {
  // Compiled (dist) and source layouts both carry schema.sql next to this file.
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file) throw new Error(`schema.sql not found near ${__dirname}`);
  const sql = fs.readFileSync(file, 'utf8');
  await pool.query(sql);
}

export async function closePool(): Promise<void> {
  await pool.end();
}
