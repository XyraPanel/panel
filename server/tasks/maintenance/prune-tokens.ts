import { useDrizzle, tables, lt } from '#server/utils/drizzle';
import { debugLog, debugError } from '#server/utils/logger';

function getRowCount(result: { changes?: number | bigint | null; rowCount?: number | bigint | null }): number {
  const value = result?.changes ?? result?.rowCount ?? 0;
  return typeof value === 'bigint' ? Number(value) : value ?? 0;
}

export default defineTask({
  meta: {
    name: 'maintenance:prune-tokens',
    description: 'Prune expired verification and recovery tokens',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle();
    const now = new Date();

    try {
      debugLog(`[${now.toISOString()}] Starting token pruning...`);

      const verificationResult = await db
        .delete(tables.verificationTokens)
        .where(lt(tables.verificationTokens.expires, now.toISOString()));

      const verificationDeleted = getRowCount(verificationResult);

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recoveryResult = await db
        .delete(tables.recoveryTokens)
        .where(lt(tables.recoveryTokens.createdAt, thirtyDaysAgo.toISOString()));

      const recoveryDeleted = getRowCount(recoveryResult);

      const totalDeleted = verificationDeleted + recoveryDeleted;
      debugLog(
        `[${now.toISOString()}] Token pruning complete. Deleted ${totalDeleted} total tokens.`,
      );

      return {
        result: {
          prunedAt: now.toISOString(),
          verificationTokensDeleted: verificationDeleted,
          recoveryTokensDeleted: recoveryDeleted,
          totalDeleted,
        },
      };
    } catch (error) {
      const errorMsg = `Token pruning failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      debugError(errorMsg);
      throw new Error(errorMsg);
    }
  },
});
