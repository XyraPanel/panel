import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import {
  parseCidr,
  parsePorts,
  CidrOutOfRangeError,
  InvalidIpAddressError,
} from '#server/utils/ip-utils';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { createAllocationSchema } from '#shared/schema/admin/infrastructure';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.ALLOCATIONS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const nodeId = getRouterParam(event, 'id');
  if (!nodeId) {
    throw createError({
      status: 400,
      message: 'Node ID is required',
    });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    createAllocationSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const { ip, ports, alias, ipAlias: ipAliasField } = body;
  const ipAlias = alias?.trim() || ipAliasField?.trim() || null;

  if (!ip || typeof ip !== 'string') {
    throw createError({
      status: 400,
      message: 'IP address or CIDR notation is required',
    });
  }

  let ipAddresses: string[];
  try {
    ipAddresses = parseCidr(ip);
  } catch (error) {
    if (error instanceof CidrOutOfRangeError) {
      throw createError({
        status: 400,
        message: error.message,
      });
    }
    if (error instanceof InvalidIpAddressError) {
      throw createError({
        status: 400,
        message: error.message,
      });
    }
    throw error;
  }

  let portNumbers: number[];
  try {
    portNumbers = Array.isArray(ports)
      ? ports
      : typeof ports === 'number'
        ? [ports]
        : parsePorts(ports);
  } catch (error) {
    throw createError({
      status: 400,
      message: error instanceof Error ? error.message : 'Invalid port format',
    });
  }

  const db = useDrizzle();
  const nowIso = new Date().toISOString();
  const created: Array<{ id: string; ip: string; port: number }> = [];
  const skipped: Array<{ ip: string; port: number }> = [];

  for (const ipAddr of ipAddresses) {
    for (const port of portNumbers) {
      const [existing] = await db
        .select()
        .from(tables.serverAllocations)
        .where(
          and(
            eq(tables.serverAllocations.nodeId, nodeId),
            eq(tables.serverAllocations.ip, ipAddr),
            eq(tables.serverAllocations.port, port),
          ),
        );

      if (existing) {
        skipped.push({ ip: ipAddr, port });
        continue;
      }

      const id = randomUUID();
      try {
        await db.insert(tables.serverAllocations).values({
          id,
          nodeId,
          serverId: null,
          ip: ipAddr,
          port,
          ipAlias,
          notes: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        created.push({ id, ip: ipAddr, port });
      } catch (error) {
        console.error(`Failed to create allocation ${ipAddr}:${port}`, error);
      }
    }
  }

  if (created.length === 0 && skipped.length > 0) {
    throw createError({
      status: 409,
      message: 'All specified allocations already exist',
    });
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.node.allocations.created',
    targetType: 'node',
    targetId: nodeId,
    metadata: {
      createdCount: created.length,
      skippedCount: skipped.length,
    },
  });

  return {
    data: {
      success: true,
      message: `Created ${created.length} allocation${created.length === 1 ? '' : 's'}${skipped.length > 0 ? `, skipped ${skipped.length} existing` : ''}`,
      created,
      skipped: skipped.length > 0 ? skipped : undefined,
    },
  };
});
