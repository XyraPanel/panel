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

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Nodes'],
    summary: 'Bulk-create allocations for a node',
    description:
      'Creates port allocations for a node from an IP/CIDR and a port list or range. Existing IP:port pairs are skipped rather than erroring. Requires an admin session with the allocations:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['ip', 'ports'],
            properties: {
              ip: { type: 'string', description: 'IP address or CIDR notation' },
              ports: {
                oneOf: [
                  { type: 'string', description: 'Port list/range, e.g. "25565,25570-25580"' },
                  { type: 'array', items: { type: 'integer' } },
                  { type: 'integer' },
                ],
              },
              alias: { type: 'string', nullable: true },
              ipAlias: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Allocations created (and possibly some skipped as already existing)',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    created: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          ip: { type: 'string' },
                          port: { type: 'integer' },
                        },
                      },
                    },
                    skipped: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { ip: { type: 'string' }, port: { type: 'integer' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Node ID missing, invalid IP/CIDR, or invalid port format' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing allocations:write ACL permission' },
      '409': { description: 'All specified allocations already exist' },
      '500': { description: 'Failed to create allocations' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.ALLOCATIONS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const { id: nodeId } = getRouterParams(event);
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
    if (error instanceof CidrOutOfRangeError || error instanceof InvalidIpAddressError) {
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

  try {
    const db = useDrizzle();
    const nowIso = new Date().toISOString();
    const created: Array<{ id: string; ip: string; port: number }> = [];
    const skipped: Array<{ ip: string; port: number }> = [];

    for (const ipAddr of ipAddresses) {
      for (const port of portNumbers) {
        const [existing] = await db
          .select({ id: tables.serverAllocations.id })
          .from(tables.serverAllocations)
          .where(
            and(
              eq(tables.serverAllocations.nodeId, nodeId),
              eq(tables.serverAllocations.ip, ipAddr),
              eq(tables.serverAllocations.port, port),
            ),
          )
          .limit(1);

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
          debugError(`[Admin Allocation Create] Failed to insert ${ipAddr}:${port}`, error);
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
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Allocation Create] Bulk operation failed for node:', nodeId, error);
    throw createError({
      status: 500,
      message: 'Failed to create allocations',
    });
  }
});
