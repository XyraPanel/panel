import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { DatabaseHostListItem } from '#shared/types/admin';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Database Hosts'],
    summary: 'List database hosts',
    description:
      'Returns all configured database hosts with their assigned database counts. Requires an admin session with the database-hosts:read ACL permission.',
    responses: {
      '200': {
        description: 'List of database hosts',
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
                      name: { type: 'string' },
                      hostname: { type: 'string' },
                      port: { type: 'integer' },
                      username: { type: 'string' },
                      maxDatabases: { type: 'integer', nullable: true },
                      databaseCount: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing database-hosts:read ACL permission' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const db = useDrizzle();

  const hosts = await db
    .select({
      id: tables.databaseHosts.id,
      name: tables.databaseHosts.name,
      hostname: tables.databaseHosts.hostname,
      port: tables.databaseHosts.port,
      username: tables.databaseHosts.username,
      maxDatabases: tables.databaseHosts.maxDatabases,
      databaseCount: sql<number>`count(${tables.serverDatabases.id})`.as('databaseCount'),
    })
    .from(tables.databaseHosts)
    .leftJoin(
      tables.serverDatabases,
      eq(tables.serverDatabases.databaseHostId, tables.databaseHosts.id),
    )
    .groupBy(tables.databaseHosts.id)
    .orderBy(tables.databaseHosts.name);

  const data: DatabaseHostListItem[] = hosts.map((host) => ({
    id: host.id,
    name: host.name,
    hostname: host.hostname,
    port: host.port,
    username: host.username,
    maxDatabases: host.maxDatabases,
    databaseCount: Number(host.databaseCount) || 0,
  }));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.database_host.listed',
    targetType: 'settings',
    metadata: {
      count: data.length,
    },
  });

  return { data };
});
