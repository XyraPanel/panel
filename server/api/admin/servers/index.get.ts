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
    tags: ['Admin'],
    summary: 'List all servers',
    description: 'Retrieves a paginated list of all servers across all Wings nodes for administrative oversight. Includes owner and node relationship data.',
    parameters: [
      {
        in: 'query',
        name: 'page',
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Page number',
      },
      {
        in: 'query',
        name: 'perPage',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        description: 'Items per page',
      },
    ],
    responses: {
      200: {
        description: 'Administrative server list retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { type: 'array', items: { type: 'object' } },
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
      401: { description: 'Authentication required' },
      403: { description: 'Administrator privileges required' },
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
    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }
    throw createError({
      status: 500,
      message: `Internal Server Error: ${error instanceof Error ? error.message : 'Failed to fetch servers'}`,
    });
  }
});
