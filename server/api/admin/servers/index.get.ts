import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { logger } from '#server/utils/logger';
import { useDrizzle, tables, eq, isNotNull, desc } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { sql } from 'drizzle-orm';
import { adminServersPaginationSchema } from '#shared/schema/admin/server';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Servers'],
    summary: 'List servers',
    description:
      'Returns a paginated list of servers with owner and node information. Requires an admin session with the servers:read ACL permission.',
    parameters: [
      {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      {
        name: 'perPage',
        in: 'query',
        schema: { type: 'integer', minimum: 1 },
      },
    ],
    responses: {
      '200': {
        description: 'Paginated list of servers',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      uuid: { type: 'string' },
                      identifier: { type: 'string' },
                      name: { type: 'string' },
                      status: { type: 'string', nullable: true },
                      owner: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          id: { type: 'string' },
                          username: { type: 'string' },
                        },
                      },
                      node: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          id: { type: 'integer' },
                          name: { type: 'string' },
                        },
                      },
                      created_at: { type: 'string', format: 'date-time' },
                    },
                  },
                },
                meta: {
                  type: 'object',
                  properties: {
                    pagination: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        count: { type: 'integer' },
                        per_page: { type: 'integer' },
                        current_page: { type: 'integer' },
                        total_pages: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing servers:read ACL permission' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
    const session = await requireAdmin(event);

    await requireAdminApiKeyPermission(
      event,
      ADMIN_ACL_RESOURCES.SERVERS,
      ADMIN_ACL_PERMISSIONS.READ,
    );

    const { page, perPage } = await getValidatedQuery(
      event,
      adminServersPaginationSchema,
    );
    const offset = (page - 1) * perPage;

    const db = useDrizzle();

    const servers = await db
      .select({
        id: tables.servers.id,
        uuid: tables.servers.uuid,
        identifier: tables.servers.identifier,
        name: tables.servers.name,
        status: tables.servers.status,
        createdAt: tables.servers.createdAt,
        ownerId: tables.users.id,
        ownerUsername: tables.users.username,
        nodeId: tables.wingsNodes.id,
        nodeName: tables.wingsNodes.name,
      })
      .from(tables.servers)
      .leftJoin(tables.users, eq(tables.servers.ownerId, tables.users.id))
      .leftJoin(tables.wingsNodes, eq(tables.servers.nodeId, tables.wingsNodes.id))
      .where(isNotNull(tables.servers.nodeId))
      .orderBy(desc(tables.servers.updatedAt))
      .limit(perPage)
      .offset(offset);

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(tables.servers)
      .where(isNotNull(tables.servers.nodeId));

    const totalCount = Number(totalResult[0]?.count ?? 0);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.servers.listed',
      targetType: 'server',
      targetId: null,
      metadata: {
        page,
        perPage,
        count: servers.length,
      },
    });

    return {
      data: servers.map((server) => ({
        id: server.id,
        uuid: server.uuid,
        identifier: server.identifier,
        name: server.name,
        status: server.status,
        owner: server.ownerId
          ? {
              id: server.ownerId,
              username: server.ownerUsername ?? '',
            }
          : null,
        node: server.nodeId
          ? {
              id: server.nodeId,
              name: server.nodeName ?? '',
            }
          : null,
        created_at: new Date(server.createdAt).toISOString(),
      })),
      meta: {
        pagination: {
          total: totalCount,
          count: servers.length,
          per_page: perPage,
          current_page: page,
          total_pages: Math.ceil(totalCount / perPage),
        },
      },
    };
  } catch (error) {
    logger.error('[GET] /api/admin/servers: Error:', error);
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    throw createError({
      status: 500,
      message: `Internal Server Error: ${error instanceof Error ? error.message : 'Failed to fetch servers'}`,
    });
  }
});
