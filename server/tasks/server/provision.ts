import { provisionServerOnWings } from '#server/utils/server-provisioning';
import { sendServerCreatedEmail, isEmailConfigured } from '#server/utils/email';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { debugLog, debugError } from '#server/utils/logger';
import { serverProvisionConfigSchema, serverProvisionPayloadSchema } from '#shared/schema/admin/server';

export default defineTask({
  meta: {
    name: 'server:provision',
    description: 'Provision a server on Wings in the background',
  },
  async run(event) {
    const { ownerEmail, serverName, ...configInput } = serverProvisionPayloadSchema.parse(
      event.payload,
    );
    const serverConfig = serverProvisionConfigSchema.parse(configInput);
    debugLog('[Server Provision Task] Starting provisioning for server:', serverConfig.serverUuid);

    const db = useDrizzle();

    try {
      await provisionServerOnWings(serverConfig);
      debugLog('[Server Provision Task] Successfully provisioned server:', serverConfig.serverUuid);

      if (ownerEmail && serverName && (await isEmailConfigured())) {
        try {
          await sendServerCreatedEmail(ownerEmail, serverName, serverConfig.serverUuid);
          debugLog('[Server Provision Task] Sent creation email for server:', serverConfig.serverUuid);
        } catch (error) {
          debugError('[Server Provision Task] Failed to send server created email:', error);
          // Don't fail the task if email fails
        }
      }

      return { result: { success: true, serverUuid: serverConfig.serverUuid } };
    } catch (error) {
      debugError('[Server Provision Task] Failed to provision server:', serverConfig.serverUuid, error);

      try {
        await db
          .update(tables.servers)
          .set({
            status: 'install_failed',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tables.servers.id, serverConfig.serverId));
      } catch (dbError) {
        debugError('[Server Provision Task] Failed to update server status:', dbError);
      }

      throw error;
    }
  },
});
