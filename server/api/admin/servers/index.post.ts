import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { provisionServerOnWings } from '#server/utils/server-provisioning';
import { sendServerCreatedEmail, isEmailConfigured } from '#server/utils/email';
import { createAdminServerSchema } from '#shared/schema/admin/server';

import { debugError } from '#server/utils/logger';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const body = await readValidatedBodyWithLimit(
    event,
    createAdminServerSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const db = useDrizzle();
    const now = new Date().toISOString();

    const [egg] = await db
      .select()
      .from(tables.eggs)
      .where(eq(tables.eggs.id, body.eggId))
      .limit(1);
    if (!egg) {
      throw createError({ status: 404, message: 'Egg not found' });
    }

    const [node] = await db
      .select({ id: tables.wingsNodes.id })
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, body.nodeId))
      .limit(1);
    if (!node) {
      throw createError({ status: 404, message: 'Node not found' });
    }

    const [owner] = await db
      .select({ id: tables.users.id, email: tables.users.email })
      .from(tables.users)
      .where(eq(tables.users.id, body.ownerId))
      .limit(1);
    if (!owner) {
      throw createError({ status: 404, message: 'Owner not found' });
    }

    const [allocation] = await db
      .select({
        id: tables.serverAllocations.id,
        nodeId: tables.serverAllocations.nodeId,
        serverId: tables.serverAllocations.serverId,
        ip: tables.serverAllocations.ip,
        port: tables.serverAllocations.port,
      })
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.id, body.allocationId))
      .limit(1);

    if (!allocation) {
      throw createError({ status: 404, message: 'Allocation not found' });
    }

    if (allocation.serverId) {
      throw createError({
        status: 409,
        message: 'Allocation in use: Allocation already assigned to a server',
      });
    }

    if (allocation.nodeId !== body.nodeId) {
      throw createError({
        status: 400,
        message: 'Invalid allocation: Allocation does not belong to selected node',
      });
    }

    const serverUuid = randomUUID();
    const serverId = randomUUID();
    const identifier = randomUUID().substring(0, 8);

    const newServer = {
      id: serverId,
      uuid: serverUuid,
      identifier,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      status: 'installing',
      suspended: false,
      ownerId: body.ownerId,
      nodeId: body.nodeId,
      allocationId: allocation.id,
      nestId: body.nestId || null,
      eggId: body.eggId,
      startup: body.startup?.trim() || egg.startup || '',
      image: body.dockerImage || egg.dockerImage || 'ghcr.io/pterodactyl/yolks:latest',
      dockerImage: body.dockerImage || egg.dockerImage || null,
      skipScripts: body.skipScripts ?? false,
      oomDisabled: body.oomDisabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tables.servers).values(newServer);

    const serverLimits = {
      serverId,
      memory: body.memory,
      memoryOverallocate: null,
      disk: body.disk,
      diskOverallocate: null,
      swap: body.swap ?? 0,
      io: body.io,
      cpu: body.cpu,
      threads: body.threads ?? null,
      oomDisabled: body.oomDisabled ?? true,
      databaseLimit: body.databases ?? null,
      allocationLimit: body.allocations ?? null,
      backupLimit: body.backups ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tables.serverLimits).values(serverLimits);

    await db
      .update(tables.serverAllocations)
      .set({
        serverId,
        isPrimary: true,
        updatedAt: now,
      })
      .where(
        and(
          eq(tables.serverAllocations.id, allocation.id),
          isNull(tables.serverAllocations.serverId),
        ),
      );

    if (body.environment) {
      const envVars = Object.entries(body.environment).map(([key, value]) => ({
        id: randomUUID(),
        serverId,
        key,
        value: String(value),
        description: null,
        isEditable: true,
        createdAt: now,
        updatedAt: now,
      }));
      if (envVars.length > 0) {
        await db.insert(tables.serverStartupEnv).values(envVars);
      }
    }

    const { invalidateServerCaches } = await import('#server/utils/serversStore');
    await invalidateServerCaches({
      id: serverId,
      uuid: serverUuid,
      identifier,
    });

    setImmediate(async () => {
      try {
        await provisionServerOnWings({
          serverId,
          serverUuid,
          eggId: body.eggId,
          nodeId: body.nodeId,
          allocationId: allocation.id,
          environment: body.environment,
          skipScripts: body.skipScripts,
          startOnCompletion: body.startOnCompletion ?? true,
        });

        if (owner?.email && (await isEmailConfigured())) {
          try {
            await sendServerCreatedEmail(owner.email, newServer.name, serverUuid);
          } catch (emailError) {
            debugError('[Server Creation: Background] Email notification failure:', emailError);
          }
        }
      } catch (provisionError) {
        debugError(
          '[Server Creation: Background] Provisioning failed for server:',
          serverUuid,
          provisionError,
        );

        try {
          await db
            .update(tables.servers)
            .set({
              status: 'install_failed',
              updatedAt: new Date().toISOString(),
            })
            .where(eq(tables.servers.id, serverId));
        } catch (dbError) {
          debugError(
            '[Server Creation: Background] Failed to update server status to install_failed:',
            dbError,
          );
        }
      }
    });

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.created',
      targetType: 'server',
      targetId: serverId,
      metadata: {
        name: body.name,
        nodeId: body.nodeId,
        ownerId: body.ownerId,
        eggId: body.eggId,
      },
    });

    return {
      data: {
        id: newServer.id,
        uuid: newServer.uuid,
        identifier: newServer.identifier,
        name: newServer.name,
        status: 'installing',
        createdAt: newServer.createdAt,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Server Create] Fatal failure:', error);
    throw createError({
      status: 500,
      message: 'Failed to create server',
    });
  }
});
