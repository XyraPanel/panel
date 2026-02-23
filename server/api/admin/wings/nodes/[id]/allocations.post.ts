import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { randomUUID } from 'node:crypto';
import {
  parseCidr,
  parsePorts,
  CidrOutOfRangeError,
  InvalidIpAddressError,
} from '#server/utils/ip-utils';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { nodeAllocationsCreateSchema } from '#shared/schema/admin/infrastructure';

export default defineEventHandler(async (event) => {
  const { id: nodeId } = event.context.params ?? {};
  if (!nodeId || typeof nodeId !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.WRITE);

  const db = useDrizzle();

  const [node] = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, nodeId))
    .limit(1);

  if (!node) {
    throw createError({ status: 404, statusText: 'Node not found' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    nodeAllocationsCreateSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  let ipAddresses: string[];
  let ports: number[];

  if (typeof body.ip === 'string') {
    try {
      ipAddresses = parseCidr(body.ip);
    } catch (error) {
      if (error instanceof CidrOutOfRangeError || error instanceof InvalidIpAddressError) {
        throw createError({ status: 400, statusText: error.message });
      }
      throw error;
    }
  } else if (Array.isArray(body.ip) && body.ip.length > 0) {
    ipAddresses = body.ip;
    for (const ip of ipAddresses) {
      if (typeof ip !== 'string') {
        throw createError({ status: 400, statusText: 'IP addresses must be strings' });
      }
    }
  } else {
    throw createError({ status: 400, statusText: 'IP address or CIDR notation is required' });
  }

  try {
    ports = parsePorts(body.ports);
  } catch (error) {
    throw createError({
      status: 400,
      statusText: error instanceof Error ? error.message : 'Invalid port format',
    });
  }

  const ipAlias = body.ipAlias as string | undefined;

  const nowIso = new Date().toISOString();
  const allocationsToCreate: Array<typeof tables.serverAllocations.$inferInsert> = [];

  for (const ip of ipAddresses) {
    for (const port of ports) {
      const [existing] = await db
        .select()
        .from(tables.serverAllocations)
        .where(
          and(
            eq(tables.serverAllocations.nodeId, nodeId),
            eq(tables.serverAllocations.ip, ip),
            eq(tables.serverAllocations.port, port),
          ),
        )
        .limit(1);

      if (existing) {
        continue;
      }

      allocationsToCreate.push({
        id: randomUUID(),
        nodeId,
        ip,
        port,
        ipAlias: ipAlias || null,
        isPrimary: false,
        serverId: null,
        notes: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  if (allocationsToCreate.length === 0) {
    throw createError({
      status: 409,
      statusText: 'All specified allocations already exist',
    });
  }

  await db.insert(tables.serverAllocations).values(allocationsToCreate);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.node.allocations.created',
    targetType: 'node',
    targetId: nodeId,
    metadata: {
      created: allocationsToCreate.length,
      ipCount: ipAddresses.length,
      portCount: ports.length,
    },
  });

  return {
    data: {
      success: true,
      created: allocationsToCreate.length,
      allocations: allocationsToCreate.map((a) => ({
        id: a.id,
        ip: a.ip,
        port: a.port,
        ipAlias: a.ipAlias,
      })),
    },
  };
});
