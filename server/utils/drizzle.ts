import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'pathe'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3/driver'
import { and, eq, or, ne, inArray, isNull } from 'drizzle-orm'
import * as schema from '~~/server/database/schema'

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
let db: BetterSQLite3Database<typeof schema> | null = null

function getClient() {
  if (sqlite) {
    return sqlite
  }

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  sqlite = new Database(databasePath)
  sqlite.pragma('foreign_keys = ON')
  return sqlite
}

export function useDrizzle(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    db = drizzle(getClient(), { schema })
  }
  return db
}

export const tables = schema
export { eq, and, or, ne, inArray, isNull }
