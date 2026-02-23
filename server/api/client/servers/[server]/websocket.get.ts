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

export default defineEventHandler(async (event): Promise<WebSocketToken | WebSocketUnavailable> => {
  const id = getRouterParam(event, 'server');
  if (!id || typeof id !== 'string') {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
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
    const { client } = await getWingsClientForServer(server.uuid as string);
    await client.getServerDetails(server.uuid as string);
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
      statusText: 'Failed to prepare websocket session',
      message: error instanceof Error ? error.message : 'Failed to prepare websocket session',
    });
  }

  const node = await getNodeForServer(server.nodeId);
  const { connection: nodeConnection } = await resolveNodeConnection(node.id);

  if (!nodeConnection) {
    throw createError({
      status: 500,
      statusText: 'Node not available',
      message: 'Server has no resolved Wings node',
    });
  }

  const baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`;

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

  const protocol = node.scheme === 'https' ? 'wss' : 'ws';
  const socketUrl = `${protocol}://${node.fqdn}:${node.daemonListen}/api/servers/${server.uuid}/ws`;

  const response: WebSocketToken = {
    token,
    socket: socketUrl,
  };

  setResponseHeader(event, 'Content-Type', 'application/json');

  return response;
});
