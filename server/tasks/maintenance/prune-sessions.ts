import { useDrizzle, tables, lt } from '#server/utils/drizzle';
import { debugLog, debugError } from '#server/utils/logger';

function getRowCount(result: {
  changes?: number | bigint | null;
  rowCount?: number | bigint | null;
}): number {
  const value = result?.changes ?? result?.rowCount ?? 0;
  return typeof value === 'bigint' ? Number(value) : (value ?? 0);
}

export default defineTask({
  meta: {
    name: 'maintenance:prune-sessions',
    description: 'Prune expired user sessions from the database',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle();
    const now = new Date();

    try {
      debugLog(`[${now.toISOString()}] Starting session pruning...`);

      const result = await db
        .delete(tables.sessions)
        .where(lt(tables.sessions.expires, now.toISOString()));

      const deletedCount = getRowCount(result);

      debugLog(
        `[${now.toISOString()}] Session pruning complete. Deleted ${deletedCount} expired sessions.`,
      );

      return {
        result: {
          prunedAt: now.toISOString(),
          deletedCount,
        },
      };
    } catch (error) {
      const errorMsg = `Session pruning failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      debugError(errorMsg);
      throw new Error(errorMsg);
    }
  },
});
