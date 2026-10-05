import { eq } from 'drizzle-orm';
import type { SettingsData } from '#shared/types/server';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Get server settings',
    description:
      'Returns basic server info and resource limits (CPU, memory, disk, swap, IO, database/allocation/backup limits). Requires the server.settings.read permission.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    responses: {
      '200': {
        description: 'Server settings',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    server: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        uuid: { type: 'string' },
                        identifier: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string', nullable: true },
                        suspended: { type: 'boolean' },
                      },
                    },
                    limits: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        cpu: { type: 'integer', nullable: true },
                        memory: { type: 'integer', nullable: true },
                        disk: { type: 'integer', nullable: true },
                        swap: { type: 'integer', nullable: true },
                        io: { type: 'integer', nullable: true },
                        threads: { type: 'integer', nullable: true },
                        oomDisabled: { type: 'boolean' },
                        databaseLimit: { type: 'integer', nullable: true },
                        allocationLimit: { type: 'integer', nullable: true },
                        backupLimit: { type: 'integer', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server identifier is missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.settings.read permission' },
      '404': { description: 'Server not found or not accessible' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverIdentifier = getRouterParam(event, 'server');

  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
  });

  const db = useDrizzle();
  const limitsRow = await db
    .select({
      cpu: tables.serverLimits.cpu,
      memory: tables.serverLimits.memory,
      disk: tables.serverLimits.disk,
      swap: tables.serverLimits.swap,
      io: tables.serverLimits.io,
      threads: tables.serverLimits.threads,
      oomDisabled: tables.serverLimits.oomDisabled,
      databaseLimit: tables.serverLimits.databaseLimit,
      allocationLimit: tables.serverLimits.allocationLimit,
      backupLimit: tables.serverLimits.backupLimit,
    })
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .limit(1);

  const [limitsResult] = limitsRow;

  const response: SettingsData = {
    server: {
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
      name: server.name,
      description: server.description,
      suspended: Boolean(server.suspended),
    },
    limits: limitsResult
      ? {
          cpu: limitsResult.cpu,
          memory: limitsResult.memory,
          disk: limitsResult.disk,
          swap: limitsResult.swap,
          io: limitsResult.io,
          threads: limitsResult.threads ?? null,
          oomDisabled: limitsResult.oomDisabled ?? true,
          databaseLimit: limitsResult.databaseLimit ?? null,
          allocationLimit: limitsResult.allocationLimit ?? null,
          backupLimit: limitsResult.backupLimit ?? null,
        }
      : null,
  };

  return {
    data: response,
  };
});
