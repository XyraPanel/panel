import { randomUUID } from 'node:crypto';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { createSubuserSchema } from '#shared/schema/server/subusers';
import { invalidateServerSubusersCache } from '#server/utils/subusers';
import {
  requireServerPermission,
  requireGrantablePermissions,
} from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Subusers'],
    summary: 'Add a subuser',
    description:
      'Grants an existing panel user (looked up by email) access to the server with the given permissions. Requires the server.users.create permission (owner/admin always allowed); requested permissions are filtered to what the caller may grant.',
    parameters: [{ name: 'server', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'permissions'],
            properties: {
              email: { type: 'string', format: 'email', maxLength: 191 },
              permissions: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Subuser added',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        username: { type: 'string' },
                        email: { type: 'string' },
                        image: { type: 'string', nullable: true },
                      },
                    },
                    permissions: { type: 'array', items: { type: 'string' } },
                    created_at: { type: 'string', format: 'date-time' },
                    updated_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Invalid request body, or user is already a subuser' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.users.create permission' },
      '404': { description: 'No user found with that email address' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverId, accountContext.session);

  // Verify user has permission to manage server users
  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.users.create'],
    allowOwner: true,
    allowAdmin: true,
  });

  const body = await readValidatedBodyWithLimit(event, createSubuserSchema, BODY_SIZE_LIMITS.SMALL);
  const grantedPermissions = await requireGrantablePermissions(
    event,
    server.id,
    body.permissions,
  );

  try {
    const db = useDrizzle();
    const [targetUser] = await db
      .select()
      .from(tables.users)
      .where(eq(tables.users.email, body.email))
      .limit(1);

    if (!targetUser) {
      throw createError({
        status: 404,
        message: 'User not found with that email address',
      });
    }

    const [existing] = await db
      .select()
      .from(tables.serverSubusers)
      .where(
        and(
          eq(tables.serverSubusers.serverId, server.id),
          eq(tables.serverSubusers.userId, targetUser.id),
        ),
      )
      .limit(1);

    if (existing) {
      throw createError({
        status: 400,
        message: 'User is already a subuser on this server',
      });
    }

    const subuserId = randomUUID();
    const now = new Date().toISOString();

    await db.insert(tables.serverSubusers).values({
      id: subuserId,
      serverId: server.id,
      userId: targetUser.id,
      permissions: JSON.stringify(grantedPermissions),
      createdAt: now,
      updatedAt: now,
    });

    const [subuser] = await db
      .select()
      .from(tables.serverSubusers)
      .where(eq(tables.serverSubusers.id, subuserId))
      .limit(1);

    await invalidateServerSubusersCache(server.id, [targetUser.id]);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.users.added',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        subuserId,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        permissions: grantedPermissions,
      },
    });

    return {
      data: {
        id: subuser!.id,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          email: targetUser.email,
          image: targetUser.image,
        },
        permissions: JSON.parse(subuser!.permissions),
        created_at: subuser!.createdAt,
        updated_at: subuser!.updatedAt,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Server Subuser Add] Failed for server:', serverId, error);
    throw createError({
      status: 500,
      message: 'Failed to add subuser to server',
    });
  }
});
