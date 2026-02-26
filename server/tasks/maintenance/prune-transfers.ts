import { useDrizzle, tables, and, eq, lt } from '#server/utils/drizzle';
import { debugLog, debugError } from '#server/utils/logger';

function getRowCount(result: { changes?: number | bigint | null; rowCount?: number | bigint | null }): number {
  const value = result?.changes ?? result?.rowCount ?? 0;
  return typeof value === 'bigint' ? Number(value) : value ?? 0;
}

export default defineTask({
  meta: {
    name: 'maintenance:prune-transfers',
    description: 'Archive old and failed server transfers',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle();
    const now = new Date();

    try {
      debugLog(`[${now.toISOString()}] Starting transfer pruning...`);

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const result = await db
        .update(tables.serverTransfers)
        .set({ archived: true })
        .where(
          and(
            eq(tables.serverTransfers.successful, false),
            lt(tables.serverTransfers.createdAt, thirtyDaysAgo.toISOString()),
          ),
        );

      const archivedCount = getRowCount(result);

      debugLog(
        `[${now.toISOString()}] Transfer pruning complete. Archived ${archivedCount} failed transfers.`,
      );

      return {
        result: {
          prunedAt: now.toISOString(),
          archivedCount,
        },
      };
    } catch (error) {
      const errorMsg = `Transfer pruning failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      debugError(errorMsg);
      throw new Error(errorMsg);
    }
  },
});
