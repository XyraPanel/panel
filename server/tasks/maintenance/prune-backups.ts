import { useDrizzle, tables, and, isNull, lt } from '#server/utils/drizzle'
import { debugLog, debugError } from '#server/utils/logger'

export default defineTask({
  meta: {
    name: 'maintenance:prune-backups',
    description: 'Prune incomplete and orphaned backups',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle()
    const now = new Date()

    try {
      debugLog(`[${now.toISOString()}] Starting backup pruning...`)

      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const result = await db
        .delete(tables.serverBackups)
        .where(
          and(
            isNull(tables.serverBackups.completedAt),
            lt(tables.serverBackups.createdAt, sevenDaysAgo)
          )
        )
        .run()

      debugLog(`[${now.toISOString()}] Backup pruning complete. Deleted ${result.changes} incomplete backups.`)

      return {
        result: {
          prunedAt: now.toISOString(),
          deletedCount: result.changes,
        },
      }
    } catch (error) {
      const errorMsg = `Backup pruning failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      debugError(errorMsg)
      throw new Error(errorMsg)
    }
  },
})
