import { useDrizzle, tables, lt } from '#server/utils/drizzle'
import { debugLog, debugError } from '#server/utils/logger'

export default defineTask({
  meta: {
    name: 'maintenance:prune-tokens',
    description: 'Prune expired verification and recovery tokens',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle()
    const now = new Date()

    try {
      debugLog(`[${now.toISOString()}] Starting token pruning...`)

      const verificationResult = await db
        .delete(tables.verificationTokens)
        .where(lt(tables.verificationTokens.expires, now))
        .run()

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const recoveryResult = await db
        .delete(tables.recoveryTokens)
        .where(lt(tables.recoveryTokens.createdAt, thirtyDaysAgo))
        .run()

      const totalDeleted = verificationResult.changes + recoveryResult.changes
      debugLog(`[${now.toISOString()}] Token pruning complete. Deleted ${totalDeleted} total tokens.`)

      return {
        result: {
          prunedAt: now.toISOString(),
          verificationTokensDeleted: verificationResult.changes,
          recoveryTokensDeleted: recoveryResult.changes,
          totalDeleted,
        },
      }
    } catch (error) {
      const errorMsg = `Token pruning failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      debugError(errorMsg)
      throw new Error(errorMsg)
    }
  },
})
