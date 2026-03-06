import { generateWingsJWT } from '#server/utils/wings/jwt';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { getNodeForServer } from '#server/utils/server-helpers';
import { resolveNodeConnection } from '#server/utils/wings/nodesStore';
import { getWingsClientForServer } from '#server/utils/wings-client';
import type { Permission } from '#shared/types/server';

interface WebSocketToken {
  token: string;
  socket: string;
}

interface WebSocketUnavailable {
  unavailable: true;
  message: string;
  diagnostics: {
    error: string;
    serverUuid: string;
    serverIdentifier: string | null;
    nodeId: string | null;
    serverStatus: string | null;
  };
}

function isMissingWingsServer(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('404') &&
    message.includes('requested resource does not exist on this instance')
  );
}

defineRouteMeta({
  openAPI: {
    tags: ['Server Console'],
    summary: 'Get WebSocket credentials',
    description:
      'Generates a one-time token and WebSocket URL for connecting to the server console via Wings.',
    parameters: [
      {
        in: 'path',
        name: 'server',
        required: true,
        schema: { type: 'string' },
        description: 'Server internal ID, UUID, or identifier',
      },
    ],
    responses: {
      200: {
        description: 'WebSocket credentials successfully generated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                token: { type: 'string', description: 'Wings JWT authentication token' },
                socket: { type: 'string', description: 'WebSocket endpoint URL' },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      403: { description: 'Missing websocket.connect permission' },
      404: { description: 'Server not found' },
    },
  },
});

export default defineEventHandler(async (event): Promise<WebSocketToken | WebSocketUnavailable> => {
  const id = getRouterParam(event, 'server');
  if (!id || typeof id !== 'string') {
    throw createError({
      status: 400,
      message: 'Missing server identifier',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(id, accountContext.session);

  const websocketPermissions: Permission[] = ['websocket.connect'];

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: websocketPermissions,
    allowOwner: true,
    allowAdmin: true,
  });

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.getServerDetails(server.uuid);
  } catch (error) {
    if (isMissingWingsServer(error)) {
      return {
        unavailable: true,
        message: 'Server is not available on the assigned Wings node',
        diagnostics: {
          error: error instanceof Error ? error.message : 'Unknown error',
          serverUuid: server.uuid,
          serverIdentifier: server.identifier ?? null,
          nodeId: server.nodeId ?? null,
          serverStatus: server.status ?? null,
        },
      };
    }

    throw createError({
      status: 502,
      message: `Failed to prepare websocket session: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  const node = await getNodeForServer(server.nodeId);
  const { connection: nodeConnection } = await resolveNodeConnection(node.id);

  if (!nodeConnection) {
    throw createError({
      status: 500,
      message: 'Node not available: Server has no resolved Wings node',
    });
  }

  const fallbackBaseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`;
  const normalizedBaseUrl = (node.baseUrl || fallbackBaseUrl).replace(/\/+$/, '');

  let baseUrl = normalizedBaseUrl;
  let socketUrl = `${node.scheme === 'https' ? 'wss' : 'ws'}://${node.fqdn}:${node.daemonListen}/api/servers/${server.uuid}/ws`;

  try {
    const parsedNodeUrl = new URL(normalizedBaseUrl);
    const socketProtocol = parsedNodeUrl.protocol === 'https:' ? 'wss' : 'ws';
    baseUrl = parsedNodeUrl.origin;
    socketUrl = `${socketProtocol}://${parsedNodeUrl.host}/api/servers/${server.uuid}/ws`;
  } catch {
    // Keep legacy fallback URL handling for malformed stored node URLs.
  }

  const token = await generateWingsJWT(
    {
      tokenSecret: nodeConnection.tokenSecret,
      baseUrl,
    },
    {
      server: { uuid: server.uuid },
      user: user.id ? { id: user.id, uuid: user.id } : undefined,
      permissions: ['*'],
      identifiedBy: `${user.id ?? 'anonymous'}:${server.uuid}`,
      expiresIn: 900,
    },
  );

  const response: WebSocketToken = {
    token,
    socket: socketUrl,
  };

  setResponseHeader(event, 'Content-Type', 'application/json');

  return response;
});
