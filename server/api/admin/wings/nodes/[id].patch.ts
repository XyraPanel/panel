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
    throw createError({ status: 413, statusText: 'Payload too large' });
  }

  let parsed: unknown;
  try {
    parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
  } catch (error) {
    throw createError({ status: 400, statusText: 'Invalid JSON body', cause: error });
  }

  if (!validatePayload(parsed)) {
    throw createError({ status: 400, statusText: 'Provide at least one property to update' });
  }

  return parsed;
}

export default defineEventHandler(async (event): Promise<UpdateWingsNodeResponse> => {
  assertMethod(event, 'PATCH');

  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.WRITE);

  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  const body = await readUpdatePayload(event);

  try {
    const updatedNode = await updateWingsNode(id, body);

    console.info('[admin][wings:nodes:update]', {
      nodeId: id,
      actor: session?.user?.email,
      ip: getRequestIP(event),
      host: getRequestHost(event, { xForwardedHost: true }),
      protocol: getRequestProtocol(event, { xForwardedProto: true }),
      url: getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }),
    });

    await recordAuditEventFromRequest(event, {
      actor: session?.user?.email ?? 'admin',
      actorType: 'user',
      action: 'admin:node.update',
      targetType: 'node',
      targetId: id,
    });

    return { data: updatedNode };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update node';
    throw createError({ status: 400, statusText: message });
  }
});
