import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq, isNotNull, desc } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { sql } from 'drizzle-orm';
import { adminServersPaginationSchema } from '#shared/schema/admin/server';

export default defineEventHandler(async (event) => {
  try {
    const session = await requireAdmin(event);

    await requireAdminApiKeyPermission(
      event,
      ADMIN_ACL_RESOURCES.SERVERS,
      ADMIN_ACL_PERMISSIONS.READ,
    );

    const query = getQuery(event);
    const parsed = adminServersPaginationSchema.safeParse({
      page: query.page,
      perPage: query.per_page ?? query.perPage,
    });

    if (!parsed.success) {
      throw createError({
        status: 400,
        statusText: 'Invalid pagination parameters',
        data: parsed.error.format(),
      });
    }

    const { page, perPage } = parsed.data;
    const offset = (page - 1) * perPage;

    const db = useDrizzle();

    const servers = await db
      .select({
        server: tables.servers,
        owner: tables.users,
        node: tables.wingsNodes,
        egg: tables.eggs,
        nest: tables.nests,
      })
      .from(tables.servers)
      .leftJoin(tables.users, eq(tables.servers.ownerId, tables.users.id))
      .leftJoin(tables.wingsNodes, eq(tables.servers.nodeId, tables.wingsNodes.id))
      .leftJoin(tables.eggs, eq(tables.servers.eggId, tables.eggs.id))
      .leftJoin(tables.nests, eq(tables.servers.nestId, tables.nests.id))
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
      data: servers.map(({ server, owner, node, egg, nest }) => ({
        id: server.id,
        uuid: server.uuid,
        identifier: server.identifier,
        externalId: server.externalId,
        name: server.name,
        description: server.description,
        status: server.status,
        suspended: server.suspended,
        owner: owner
          ? {
              id: owner.id,
              username: owner.username,
              email: owner.email,
            }
          : null,
        node: node
          ? {
              id: node.id,
              name: node.name,
            }
          : null,
        egg: egg
          ? {
              id: egg.id,
              name: egg.name,
            }
          : null,
        nest: nest
          ? {
              id: nest.id,
              name: nest.name,
            }
          : null,
        createdAt:
          server.createdAt instanceof Date
            ? server.createdAt
            : new Date(server.createdAt).toISOString(),
        updatedAt:
          server.updatedAt instanceof Date
            ? server.updatedAt
            : new Date(server.updatedAt).toISOString(),
      })),
      meta: {
        pagination: {
          total: totalCount,
          count: servers.length,
          perPage,
          currentPage: page,
          totalPages: Math.ceil(totalCount / perPage),
        },
      },
    };
  } catch (error) {
    console.error('[GET] /api/admin/servers: Error:', error);
    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }
    throw createError({
      status: 500,
      statusText: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to fetch servers',
    });
  }
});
