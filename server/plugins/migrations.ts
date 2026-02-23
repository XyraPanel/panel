import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { useDrizzle, usePool } from '#server/utils/drizzle';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import type { Pool } from 'pg';

async function baselineIfNeeded(pool: Pool, migrationsFolder: string) {
  const client = await pool.connect();
  try {
    const trackingRes = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'drizzle'
        AND table_name = '__drizzle_migrations'
      ) AS exists
    `);
    if (trackingRes.rows[0]?.exists) return;

    const usersRes = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      ) AS exists
    `);
    if (!usersRes.rows[0]?.exists) return;

    console.log('[migrations] Baselining existing database...');
    await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    interface MigrationJournal {
      entries: Array<{ tag: string; when: number }>;
    }
    const journalRaw: MigrationJournal = JSON.parse(
      readFileSync(resolve(migrationsFolder, 'meta/_journal.json'), 'utf-8'),
    );

    for (const entry of journalRaw.entries) {
      const existing = await client.query(
        `SELECT id FROM drizzle.__drizzle_migrations WHERE hash = $1`,
        [entry.tag],
      );
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
          [entry.tag, entry.when],
        );
      }
    }

    console.log('[migrations] Baseline complete.');
  } finally {
    client.release();
  }
}

export default defineNitroPlugin(async () => {
  if (process.env.NODE_ENV !== 'production') return;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const candidates = [
    resolve(__dirname, '../database/migrations'),
    resolve(__dirname, '../../server/database/migrations'),
    resolve(process.cwd(), 'server/database/migrations'),
    resolve(process.cwd(), 'migrations'),
    '/app/migrations',
  ];

  const { existsSync } = await import('fs');
  const migrationsFolder = candidates.find((p) => existsSync(p));

  if (!migrationsFolder) {
    console.error('[migrations] Could not locate migrations folder. Tried:', candidates);
    throw new Error('Migrations folder not found.');
  }

  try {
    const db = useDrizzle();
    await baselineIfNeeded(usePool(), migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log('[migrations] Migrations complete.');
  } catch (err) {
    console.error('[migrations] Migration failed:', err);
    throw err;
  }
});
