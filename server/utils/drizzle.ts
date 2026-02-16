import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve, dirname } from 'pathe'
import Database from 'better-sqlite3'
import { Pool } from 'pg'
import { drizzle as drizzleSQLite, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3/driver'
import { drizzle as drizzlePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, eq, or, inArray, isNull, isNotNull, lt, desc } from 'drizzle-orm'
import * as schema from '#server/database/schema'

const moduleDir = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = findProjectRoot(moduleDir)
const dataDir = join(projectRoot, 'data')
const defaultSqlitePath = join(dataDir, 'XyraPanel.sqlite')
const defaultSqliteUrl = 'file:./data/XyraPanel.sqlite'

const rawDatabaseUrl = process.env.DATABASE_URL || defaultSqliteUrl
const resolvedDialect = (process.env.DB_DIALECT ?? inferDialect(rawDatabaseUrl)).toLowerCase()
const isPostgres = resolvedDialect === 'postgresql' || resolvedDialect === 'postgres'
const sqliteFilePath = resolveSqliteFilePath(rawDatabaseUrl)
const sqliteDirectory = dirname(sqliteFilePath)

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

function inferDialect(url: string | null): 'sqlite' | 'postgresql' {
  if (!url) {
    return 'sqlite'
  }

  if (url.startsWith('postgres')) {
    return 'postgresql'
  }

  return 'sqlite'
}

function resolveSqliteFilePath(url: string | null): string {
  if (url && url.startsWith('file:')) {
    const target = url.slice('file:'.length)
    if (!target) {
      return defaultSqlitePath
    }

    if (target.startsWith('./') || target.startsWith('../')) {
      return resolve(projectRoot, target)
    }

    return target
  }

  return defaultSqlitePath
}

let sqlite: ReturnType<typeof Database> | null = null
let pgPool: Pool | null = null

export type SqliteDatabase = BetterSQLite3Database<typeof schema>
export type PostgresDatabase = NodePgDatabase<typeof schema>
export type DrizzleDatabase = SqliteDatabase | PostgresDatabase

let db: DrizzleDatabase | null = null

function getSqliteClient() {
  if (sqlite) {
    return sqlite
  }

  if (!existsSync(sqliteDirectory)) {
    mkdirSync(sqliteDirectory, { recursive: true, mode: 0o755 })
  }

  sqlite = new Database(sqliteFilePath, {
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

  const connectionString = rawDatabaseUrl

  if (!connectionString || connectionString.startsWith('file:')) {
    throw new Error('DATABASE_URL must be set to a PostgreSQL connection string when DB_DIALECT=postgresql')
  }

  pgPool = new Pool({ connectionString })

  return pgPool
}

function createDatabase(): DrizzleDatabase {
  if (isPostgres) {
    return drizzlePostgres(getPgPool(), { schema })
  }

  return drizzleSQLite(getSqliteClient(), { schema })
}

export function assertSqliteDatabase(_db: DrizzleDatabase): asserts _db is SqliteDatabase {
  if (isPostgres) {
    throw new Error('SQLite-only operation attempted while DB_DIALECT=postgresql')
  }
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
