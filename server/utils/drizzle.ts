import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, or, inArray, isNull, isNotNull, lt, desc } from 'drizzle-orm';
import * as schema from '#server/database/schema';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  // We don't throw immediately here to allow build/prepare steps to run if needed,
  // but we should warn in a real app.
}

let pgPool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

function getPgPool() {
  if (pgPool) {
    return pgPool;
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL connection.');
  }

  pgPool = new Pool({
    connectionString: databaseUrl,
    // Add any necessary production pool settings here
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  return pgPool;
}

export type DrizzleDatabase = NodePgDatabase<typeof schema>;

export function usePool(): Pool {
  return getPgPool();
}

export function useDrizzle(): DrizzleDatabase {
  if (!db) {
    db = drizzle(getPgPool(), { schema });
  }
  return db;
}

export const tables = schema.tables;

export { eq, and, or, inArray, isNull, isNotNull, lt, desc };
