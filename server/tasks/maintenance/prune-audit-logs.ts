import { useDrizzle } from '#server/utils/drizzle';
import { debugLog, debugError } from '#server/utils/logger';

export default defineTask({
  meta: {
    name: 'maintenance:prune-audit-logs',
    description:
      'Archive old audit events to maintain database performance while preserving audit trail',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle();
    const now = new Date();

    try {
      debugLog(`[${now.toISOString()}] Starting audit log archival...`);

      const archiveBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const logsToArchive = await db.query.auditEvents.findMany({
        where: (events, { lt }) => lt(events.occurredAt, archiveBefore.toISOString()),
      });

      debugLog(`[${now.toISOString()}] Found ${logsToArchive.length} audit logs to archive`);

      if (logsToArchive.length > 0) {
        debugLog(
          `Audit logs ready for archival: ${logsToArchive.length} entries from before ${archiveBefore.toISOString()}`,
        );
      }

      return {
        result: {
          archivedAt: now.toISOString(),
          readyForExport: logsToArchive.length,
          archiveBefore: archiveBefore.toISOString(),
        },
      };
    } catch (error) {
      const errorMsg = `Audit log archival failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      debugError(errorMsg);
      throw new Error(errorMsg);
    }
  },
});
