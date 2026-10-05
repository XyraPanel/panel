import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { getValidatedQuery, requireAccountUser } from '#server/utils/security';
import { requireNodeRow, findWingsNode } from '#server/utils/wings/nodesStore';
import { generateWingsJWT } from '#server/utils/wings/jwt';
import { logger } from '#server/utils/logger';
import { z } from 'zod';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');
  const { file: rawFile } = await getValidatedQuery(event, z.object({
    file: z.string().optional(),
  }));
  const file = rawFile ?? '';

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  if (!file) {
    throw createError({
      status: 400,
      message: 'File path is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.download'],
  });

  if (!server.nodeId) {
    throw createError({ status: 500, message: 'Server has no node assigned' });
  }

  try {
    const nodeRow = await requireNodeRow(server.nodeId);
    const node = await findWingsNode(server.nodeId);
    if (!node) {
      throw createError({ status: 500, message: 'Node not found' });
    }

    const downloadToken = await generateWingsJWT(
      {
        tokenSecret: nodeRow.tokenSecret,
        baseUrl: `${node.scheme}://${node.fqdn}:${node.daemonListen}`,
      },
      {
        user: { id: accountContext.user.id, uuid: accountContext.user.id },
        server: { uuid: server.uuid },
        expiresIn: 900,
        scope: 'file-download',
        extraClaims: { file_path: file },
      },
    );

    const wingsBaseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`;
    const downloadUrl = `${wingsBaseUrl}/download/file?token=${downloadToken}`;

    return {
      attributes: {
        url: downloadUrl,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    logger.error('Failed to get download URL from Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to get download URL',
    });
  }
});
