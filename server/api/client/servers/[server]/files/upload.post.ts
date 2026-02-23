import { requireServerPermission } from '#server/utils/permission-middleware';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { recordServerActivity } from '#server/utils/server-activity';
import { requireNodeRow, findWingsNode } from '#server/utils/wings/nodesStore';
import { generateWingsJWT } from '#server/utils/wings/jwt';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireAccountUser } from '#server/utils/security';

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

  const permissionContext = await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.upload'],
  });

  try {
    const { server: wingsServer } = await getWingsClientForServer(server.uuid);

    const formData = await readMultipartFormData(event);
    if (!formData || formData.length === 0) {
      throw new Error('No files provided');
    }

    const directory = formData.find((f) => f.name === 'directory')?.data?.toString() || '/';
    const fileFields = formData.filter((f) => f.name === 'files');

    if (fileFields.length === 0) {
      throw new Error('No files to upload');
    }

    const nodeRow = requireNodeRow(wingsServer.nodeId as string);
    const node = findWingsNode(wingsServer.nodeId as string);
    if (!node) {
      throw new Error('Node not found');
    }

    const uploadToken = await generateWingsJWT(
      {
        tokenSecret: nodeRow.tokenSecret,
        baseUrl: `http://${nodeRow.fqdn}:${nodeRow.daemonListen}`,
      },
      {
        user: { id: accountContext.user.id, uuid: accountContext.user.id },
        server: { uuid: wingsServer.uuid as string },
        expiresIn: 900,
      },
    );

    const uploadForm = new FormData();

    for (const fileField of fileFields) {
      if (!fileField.data) continue;
      const fileName = fileField.filename || 'file';
      // @ts-expect-error - Node.js Buffer is compatible
      uploadForm.append('files', new Blob([fileField.data]), fileName);
    }

    const wingsBaseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`;
    const uploadUrl = `${wingsBaseUrl}/upload/file?token=${uploadToken}&directory=${encodeURIComponent(directory)}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: uploadForm,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Wings upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    await recordServerActivity({
      event,
      actorId: permissionContext.userId,
      action: 'server.file.upload',
      server: { id: wingsServer.id as string, uuid: wingsServer.uuid as string },
      metadata: { directory, fileCount: fileFields.length },
    });

    return {
      success: true,
      message: 'Files uploaded successfully',
    };
  } catch (error) {
    throw createError({
      status: 500,
      message: error instanceof Error ? error.message : 'Failed to upload files',
    });
  }
});
