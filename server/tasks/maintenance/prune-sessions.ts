import { useDrizzle, tables, lt } from '#server/utils/drizzle';
import { debugLog, debugError } from '#server/utils/logger';

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

      const result = await db.delete(tables.sessions).where(lt(tables.sessions.expires, now));

      const deletedCount = (result as any).changes ?? (result as any).rowCount ?? 0;

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
