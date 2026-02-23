import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { createDatabaseHostSchema } from '#shared/schema/admin/infrastructure';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const body = await readValidatedBodyWithLimit(
    event,
    createDatabaseHostSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();
  const now = new Date();

  const newHost = {
    id: randomUUID(),
    name: body.name.trim(),
    hostname: body.hostname.trim(),
    port: body.port ?? 3306,
    username: body.username.trim(),
    password: body.password,
    database: body.database?.trim() ?? null,
    nodeId: body.nodeId ?? null,
    maxDatabases: body.maxDatabases ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tables.databaseHosts).values(newHost);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.database_host.created',
    targetType: 'settings',
    targetId: newHost.id,
    metadata: {
      hostName: newHost.name,
      hostname: newHost.hostname,
      port: newHost.port,
    },
  });

  return {
    data: {
      id: newHost.id,
      name: newHost.name,
      hostname: newHost.hostname,
      port: newHost.port,
      nodeId: newHost.nodeId,
      maxDatabases: newHost.maxDatabases,
      createdAt: newHost.createdAt,
      updatedAt: newHost.updatedAt,
    },
  };
});
