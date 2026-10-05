import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { createDatabaseHostSchema } from '#shared/schema/admin/infrastructure';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Database Hosts'],
    summary: 'Create a database host',
    description:
      'Registers a new database host that can be used to provision server databases. Requires an admin session with the database-hosts:write ACL permission.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name', 'hostname', 'username', 'password'],
            properties: {
              name: { type: 'string', maxLength: 255 },
              hostname: { type: 'string', maxLength: 255 },
              port: { type: 'integer', minimum: 1, maximum: 65535, default: 3306 },
              username: { type: 'string', maxLength: 255 },
              password: { type: 'string' },
              database: { type: 'string', maxLength: 255 },
              nodeId: { type: 'string', format: 'uuid', description: 'Restrict host to a specific node' },
              maxDatabases: { type: 'integer', minimum: 0, nullable: true },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Database host created',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    hostname: { type: 'string' },
                    port: { type: 'integer' },
                    nodeId: { type: 'string', nullable: true },
                    maxDatabases: { type: 'integer', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing database-hosts:write ACL permission' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const body = await readValidatedBodyWithLimit(
    event,
    createDatabaseHostSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const db = useDrizzle();
    const now = new Date().toISOString();

    const newHost = {
      id: randomUUID(),
      name: body.name.trim(),
      hostname: body.hostname.trim(),
      port: body.port ?? 3306,
      username: body.username.trim(),
      password: body.password,
      database: body.database?.trim() ?? null,
      nodeId: body.nodeId ?? null,
      maxDatabases: body.maxDatabases ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tables.databaseHosts).values(newHost);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.database_host.created',
      targetType: 'settings',
      targetId: newHost.id,
      metadata: {
        hostName: newHost.name,
        hostname: newHost.hostname,
        port: newHost.port,
      },
    });

    return {
      data: {
        id: newHost.id,
        name: newHost.name,
        hostname: newHost.hostname,
        port: newHost.port,
        nodeId: newHost.nodeId,
        maxDatabases: newHost.maxDatabases,
        createdAt: newHost.createdAt,
        updatedAt: newHost.updatedAt,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Database Host Create] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to create database host',
    });
  }
});
