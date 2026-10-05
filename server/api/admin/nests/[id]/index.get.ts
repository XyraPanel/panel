import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Nests'],
    summary: 'Get a nest',
    description:
      'Returns a single nest along with the eggs that belong to it. Requires an admin session with the nests:read ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'Nest and its eggs',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    nest: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        uuid: { type: 'string' },
                        author: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                      },
                    },
                    eggs: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          uuid: { type: 'string' },
                          nestId: { type: 'string' },
                          author: { type: 'string' },
                          name: { type: 'string' },
                          description: { type: 'string', nullable: true },
                          dockerImage: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Nest ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing nests:read ACL permission' },
      '404': { description: 'Nest not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NESTS, ADMIN_ACL_PERMISSIONS.READ);

  const nestId = getRouterParam(event, 'id');
  if (!nestId) {
    throw createError({ status: 400, message: 'Nest ID is required' });
  }

  const db = useDrizzle();

  const [nest] = await db
    .select()
    .from(tables.nests)
    .where(eq(tables.nests.id, nestId))
    .limit(1);

  if (!nest) {
    throw createError({ status: 404, message: 'Nest not found' });
  }

  const eggs = await db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.nestId, nestId))
    .orderBy(tables.eggs.name);

  return {
    data: {
      nest: {
        id: nest.id,
        uuid: nest.uuid,
        author: nest.author,
        name: nest.name,
        description: nest.description,
        createdAt: new Date(nest.createdAt).toISOString(),
        updatedAt: new Date(nest.updatedAt).toISOString(),
      },
      eggs: eggs.map((egg) => ({
        id: egg.id,
        uuid: egg.uuid,
        nestId: egg.nestId,
        author: egg.author,
        name: egg.name,
        description: egg.description,
        dockerImage: egg.dockerImage,
        createdAt: new Date(egg.createdAt).toISOString(),
        updatedAt: new Date(egg.updatedAt).toISOString(),
      })),
    },
  };
});
