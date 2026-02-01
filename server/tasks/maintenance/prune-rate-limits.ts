import { useDrizzle, tables, lt } from '#server/utils/drizzle'
import { debugLog, debugError } from '#server/utils/logger'

export default defineTask({
  meta: {
    name: 'maintenance:prune-rate-limits',
    description: 'Prune stale rate limit entries',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle()
    const now = new Date()

    try {
      debugLog(`[${now.toISOString()}] Starting rate limit pruning...`)

      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).getTime()

      const result = await db
        .delete(tables.rateLimit)
        .where(lt(tables.rateLimit.lastRequest, oneDayAgo))
        .run()

      debugLog(`[${now.toISOString()}] Rate limit pruning complete. Deleted ${result.changes} stale entries.`)

      return {
        result: {
          prunedAt: now.toISOString(),
          deletedCount: result.changes,
        },
      }
    } catch (error) {
      const errorMsg = `Rate limit pruning failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      debugError(errorMsg)
      throw new Error(errorMsg)
    }
  },
})
