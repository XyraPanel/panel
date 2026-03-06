import type { H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { updateWingsNode } from '#server/utils/wings/nodesStore';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { UpdateWingsNodePayload, UpdateWingsNodeResponse } from '#shared/types/admin';

const MAX_BODY_SIZE = 32 * 1024;

const ALLOWED_NODE_UPDATE_KEYS: readonly (keyof UpdateWingsNodePayload)[] = [
  'name',
  'description',
  'fqdn',
  'scheme',
  'public',
  'maintenanceMode',
  'behindProxy',
  'memory',
  'memoryOverallocate',
  'disk',
  'diskOverallocate',
  'uploadSize',
  'daemonListen',
  'daemonSftp',
  'daemonBase',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllowedKey(value: PropertyKey): value is keyof UpdateWingsNodePayload {
  return (
    typeof value === 'string' && (ALLOWED_NODE_UPDATE_KEYS as readonly string[]).includes(value)
  );
}

function validatePayload(payload: unknown): payload is UpdateWingsNodePayload {
  if (!isPlainObject(payload)) {
    return false;
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([key, value]) => isAllowedKey(key) && value !== undefined);
}

async function readUpdatePayload(event: H3Event): Promise<UpdateWingsNodePayload> {
  const raw = await readRawBody(event, 'utf8');

  if (raw && raw.length > MAX_BODY_SIZE) {
    throw createError({ status: 413, message: 'Payload too large' });
  }

  let parsed: unknown;
  try {
    parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
  } catch (error) {
    throw createError({ status: 400, message: 'Invalid JSON body', cause: error });
  }

  if (!validatePayload(parsed)) {
    throw createError({ status: 400, message: 'Provide at least one property to update' });
  }

  return parsed;
}

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'Update Wings node',
    description: 'Modifies an existing Wings node\'s configuration, including networking, security, and resource allocation.',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Node internal ID',
      },
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              fqdn: { type: 'string' },
              scheme: { type: 'string', enum: ['http', 'https'] },
              public: { type: 'boolean' },
              maintenanceMode: { type: 'boolean' },
              behindProxy: { type: 'boolean' },
              memory: { type: 'integer' },
              disk: { type: 'integer' },
              daemonListen: { type: 'integer' },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Node successfully updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { type: 'object' },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      403: { description: 'Missing nodes.write permission' },
      404: { description: 'Node not found' },
    },
  },
});

export default defineEventHandler(async (event): Promise<UpdateWingsNodeResponse> => {
  assertMethod(event, 'PATCH');

  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.WRITE);

  const { id } = getRouterParams(event);
  if (!id) {
    throw createError({ status: 400, message: 'Missing node id' });
  }

  const body = await readUpdatePayload(event);

  try {
    const updatedNode = await updateWingsNode(id, body);

    await recordAuditEventFromRequest(event, {
      actor: session?.user?.email ?? 'admin',
      actorType: 'user',
      action: 'admin:node.update',
      targetType: 'node',
      targetId: id,
    });

    return { data: updatedNode };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Wings Node Update] Failed for node:', id, error);
    throw createError({ status: 500, message: 'Failed to update node' });
  }
});
