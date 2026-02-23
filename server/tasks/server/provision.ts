import { provisionServerOnWings } from '#server/utils/server-provisioning';
import { sendServerCreatedEmail, isEmailConfigured } from '#server/utils/email';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { debugLog, debugError } from '#server/utils/logger';
import type { ServerProvisioningConfig } from '#shared/types/server';

export default defineTask({
  meta: {
    name: 'server:provision',
    description: 'Provision a server on Wings in the background',
  },
  async run(event) {
    const payload = event.payload as unknown as ServerProvisioningConfig & {
      ownerEmail?: string;
      serverName?: string;
    };
    debugLog('[Server Provision Task] Starting provisioning for server:', payload.serverUuid);

    const db = useDrizzle();

    try {
      await provisionServerOnWings(payload);
      debugLog('[Server Provision Task] Successfully provisioned server:', payload.serverUuid);

      if (payload.ownerEmail && payload.serverName && (await isEmailConfigured())) {
        try {
          await sendServerCreatedEmail(payload.ownerEmail, payload.serverName, payload.serverUuid);
          debugLog('[Server Provision Task] Sent creation email for server:', payload.serverUuid);
        } catch (error) {
          debugError('[Server Provision Task] Failed to send server created email:', error);
          // Don't fail the task if email fails
        }
      }

      return { result: { success: true, serverUuid: payload.serverUuid } };
    } catch (error) {
      debugError('[Server Provision Task] Failed to provision server:', payload.serverUuid, error);

      try {
        await db
          .update(tables.servers)
          .set({
            status: 'install_failed',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tables.servers.id, payload.serverId));
      } catch (dbError) {
        debugError('[Server Provision Task] Failed to update server status:', dbError);
      }

      throw error;
    }
  },
});
