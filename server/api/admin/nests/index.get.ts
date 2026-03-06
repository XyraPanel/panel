import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { NestWithEggCount } from '#shared/types/admin';

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'List nests',
    description: 'Retrieves a list of all nests, which serve as categories for game server templates (eggs). Supports a simplified "options" view for dropdowns.',
    parameters: [
      {
        in: 'query',
        name: 'view',
        schema: { type: 'string', enum: ['full', 'options'] },
        description: 'Specify the detail level of the response',
      },
    ],
    responses: {
      200: {
        description: 'Successfully retrieved list of nests',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: { type: 'object' },
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
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NESTS, ADMIN_ACL_PERMISSIONS.READ);

  const { view } = await getValidatedQuery(event, z.object({
    view: z.union([z.string(), z.array(z.string())]).optional(),
  }));
  const normalizedView = Array.isArray(view) ? view[0] : view;
  const db = useDrizzle();

  if (normalizedView === 'options') {
    const options = await db
      .select({
        id: tables.nests.id,
        name: tables.nests.name,
      })
      .from(tables.nests)
      .orderBy(tables.nests.name);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.nest.options.listed',
      targetType: 'settings',
      metadata: {
        count: options.length,
      },
    });

    return { data: options };
  }

  const nests = await db
    .select({
      id: tables.nests.id,
      uuid: tables.nests.uuid,
      author: tables.nests.author,
      name: tables.nests.name,
      description: tables.nests.description,
      createdAt: tables.nests.createdAt,
      updatedAt: tables.nests.updatedAt,
      eggCount: sql<number>`count(${tables.eggs.id})`.as('eggCount'),
    })
    .from(tables.nests)
    .leftJoin(tables.eggs, eq(tables.eggs.nestId, tables.nests.id))
    .groupBy(tables.nests.id)
    .orderBy(tables.nests.name);

  const data: NestWithEggCount[] = nests.map((nest) => ({
    id: nest.id,
    uuid: nest.uuid,
    author: nest.author,
    name: nest.name,
    description: nest.description,
    createdAt: new Date(nest.createdAt).toISOString(),
    updatedAt: new Date(nest.updatedAt).toISOString(),
    eggCount: Number(nest.eggCount) || 0,
  }));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.nest.listed',
    targetType: 'settings',
    metadata: {
      count: data.length,
    },
  });

  return { data };
});
