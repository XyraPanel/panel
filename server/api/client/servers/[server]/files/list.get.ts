import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

function isMissingWingsServer(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('404') &&
    message.includes('requested resource does not exist on this instance')
  );
}

function sanitizeDirectoryPath(value?: string): string {
  if (!value) return '/';

  let normalized = value.trim();
  normalized = normalized.replace(/\\/g, '/').replace(/\.\.+/g, '');

  if (!normalized.startsWith('/')) normalized = `/${normalized}`;

  normalized = normalized.replace(/\/{2,}/g, '/');

  if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);

  return normalized.length === 0 ? '/' : normalized;
}

function joinPath(directory: string, name: string): string {
  return directory === '/' ? `/${name}` : `${directory}/${name}`;
}

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.read'],
  });

  const query = getQuery(event);
  const directory = sanitizeDirectoryPath(
    typeof query.directory === 'string' ? query.directory : '/',
  );

  try {
    const { client } = await getWingsClientForServer(server.uuid as string);
    let files = await client.listFiles(server.uuid as string, directory);

    if (
      files.length === 0 &&
      typeof server.identifier === 'string' &&
      server.identifier.length > 0 &&
      server.identifier !== server.uuid
    ) {
      // Some Wings setups can still key servers by short identifier; retry once.
      try {
        files = await client.listFiles(server.identifier, directory);
      } catch {
        // Keep the original successful empty result.
      }
    }

    const entries = files.map((file) => ({
      name: file.name,
      path: joinPath(directory, file.name),
      size: file.size,
      mode: file.mode,
      modeBits: file.mode_bits,
      mime: file.mimetype,
      created: file.created,
      modified: file.modified,
      isDirectory: Boolean(file.directory),
      isFile: Boolean(file.file),
      isSymlink: Boolean(file.symlink),
    }));

    return {
      data: {
        directory,
        entries,
      },
    };
  } catch (error) {
    if (!isMissingWingsServer(error)) {
      console.error('Failed to list files via Wings:', error);
    }

    if (
      isMissingWingsServer(error) &&
      typeof server.identifier === 'string' &&
      server.identifier !== server.uuid
    ) {
      try {
        const { client } = await getWingsClientForServer(server.uuid as string);
        const files = await client.listFiles(server.identifier, directory);

        const entries = files.map((file) => ({
          name: file.name,
          path: joinPath(directory, file.name),
          size: file.size,
          mode: file.mode,
          modeBits: file.mode_bits,
          mime: file.mimetype,
          created: file.created,
          modified: file.modified,
          isDirectory: Boolean(file.directory),
          isFile: Boolean(file.file),
          isSymlink: Boolean(file.symlink),
        }));

        return {
          data: {
            directory,
            entries,
          },
        };
      } catch (fallbackError) {
        if (!isMissingWingsServer(fallbackError)) {
          console.error(
            'Failed to list files via Wings using server identifier fallback:',
            fallbackError,
          );
        }
      }
    }

    if (isMissingWingsServer(error)) {
      return {
        data: {
          directory,
          entries: [],
          unavailable: true,
          message: 'Server is not available on the assigned Wings node',
          diagnostics: {
            error: error instanceof Error ? error.message : 'Unknown error',
            serverUuid: server.uuid,
            serverIdentifier: server.identifier,
            nodeId: server.nodeId,
            serverStatus: server.status,
          },
        },
      };
    }

    throw createError({
      status: 500,
      message: 'Failed to list files',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
