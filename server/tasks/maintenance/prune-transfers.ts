import { useDrizzle, tables, and, eq, lt } from '#server/utils/drizzle'
import { debugLog, debugError } from '#server/utils/logger'

export default defineTask({
  meta: {
    name: 'maintenance:prune-transfers',
    description: 'Archive old and failed server transfers',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle()
    const now = new Date()

    try {
      debugLog(`[${now.toISOString()}] Starting transfer pruning...`)

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const result = await db
        .update(tables.serverTransfers)
        .set({ archived: true })
        .where(
          and(
            eq(tables.serverTransfers.successful, false),
            lt(tables.serverTransfers.createdAt, thirtyDaysAgo)
          )
        )
        .run()

      debugLog(`[${now.toISOString()}] Transfer pruning complete. Archived ${result.changes} failed transfers.`)

      return {
        result: {
          prunedAt: now.toISOString(),
          archivedCount: result.changes,
        },
      }
    } catch (error) {
      const errorMsg = `Transfer pruning failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      debugError(errorMsg)
      throw new Error(errorMsg)
    }
  },
})
