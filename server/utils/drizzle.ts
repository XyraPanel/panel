import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'pathe'
import Database from 'better-sqlite3'
import { Pool } from 'pg'
import { drizzle as drizzleSQLite, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3/driver'
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres'
import { and, eq, or, inArray, isNull, isNotNull, lt, desc } from 'drizzle-orm'
import * as schema from '#server/database/schema'

const DIALECT = (process.env.DB_DIALECT ?? 'sqlite').toLowerCase()
const isPostgres = DIALECT === 'postgresql' || DIALECT === 'postgres'

function findProjectRoot(startDir: string): string {
  let current = startDir

  while (true) {
    const hasWorkspaceMarker = existsSync(join(current, 'package.json')) || existsSync(join(current, 'pnpm-workspace.yaml'))

    if (hasWorkspaceMarker) {
      return current
    }

    const parent = resolve(current, '..')
    if (parent === current) {
      return startDir
    }

    current = parent
  }
}

const moduleDir = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = findProjectRoot(moduleDir)
const dataDir = join(projectRoot, 'data')
const databasePath = join(dataDir, 'XyraPanel.sqlite')

let sqlite: ReturnType<typeof Database> | null = null
let pgPool: Pool | null = null

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

let db: DrizzleDatabase | null = null

function getSqliteClient() {
  if (sqlite) {
    return sqlite
  }

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true, mode: 0o755 })
  }

  sqlite = new Database(databasePath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  })
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  return sqlite
}

function getPgPool() {
  if (pgPool) {
    return pgPool
  }

  const connectionString = process.env.DRIZZLE_DATABASE_URL

  if (!connectionString) {
    throw new Error('DRIZZLE_DATABASE_URL is required when DB_DIALECT=postgresql')
  }

  pgPool = new Pool({ connectionString })
  return pgPool
}

function createDatabase(): DrizzleDatabase {
  if (isPostgres) {
    return drizzlePostgres(getPgPool(), { schema }) as unknown as DrizzleDatabase
  }

  return drizzleSQLite(getSqliteClient(), { schema })
}

export function useDrizzle(): DrizzleDatabase {
  if (!db) {
    db = createDatabase()
  }
  return db
}

export const tables = schema
export const isPostgresDialect = isPostgres
export { eq, and, or, inArray, isNull, isNotNull, lt, desc }
