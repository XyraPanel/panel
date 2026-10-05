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
    tags: ['Admin - Nests'],
    summary: 'List nests',
    description:
      'Returns nests with their egg counts, or (with ?view=options) a lightweight id/name list for use in select inputs. Requires an admin session with the nests:read ACL permission.',
    parameters: [
      {
        name: 'view',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['options'] },
        description: 'Pass "options" to receive a minimal id/name list instead of full records',
      },
    ],
    responses: {
      '200': {
        description: 'List of nests',
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
                      id: { type: 'string' },
                      uuid: { type: 'string' },
                      author: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string', nullable: true },
                      createdAt: { type: 'string', format: 'date-time' },
                      updatedAt: { type: 'string', format: 'date-time' },
                      eggCount: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing nests:read ACL permission' },
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
