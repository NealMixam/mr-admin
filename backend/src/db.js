import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { hashPassword, passwordRule, emailRule } from './security.js';

export const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  connectionTimeoutMillis: 5000,
});

db.on('error', (error) => console.error('PostgreSQL pool:', error.message));

export async function transaction(work) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initialize() {
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(70010)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)');
    const directory = new URL('../migrations/', import.meta.url);
    const files = (await readdir(directory)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
    for (const name of files) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    }

    const admins = await client.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
    if (admins.rowCount) return;
    const email = emailRule.parse(process.env.ADMIN_EMAIL);
    const password = passwordRule.parse(process.env.ADMIN_PASSWORD);
    await client.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
      ['Администратор', email, await hashPassword(password)],
    );
  });
}
