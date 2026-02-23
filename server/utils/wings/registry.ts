import { toWingsHttpError } from '#server/utils/wings/http';
import {
  findWingsNode,
  listWingsNodes,
  requireNodeRow,
  resolveNodeConnection,
} from '#server/utils/wings/nodesStore';
import { decryptToken } from '#server/utils/wings/encryption';
import { debugError } from '#server/utils/logger';
import { useRuntimeConfig } from '#imports';

import type {
  StoredWingsNode,
  WingsPaginatedResponse,
  WingsRemoteServer,
  WingsServerConfigurationResponse,
  WingsSystemInformation,
  WingsHttpRequestOptions,
} from '#shared/types/wings';
import type { ServerDirectoryListing, ServerFileContentResponse } from '#shared/types/server';

function normalizeServerPath(value: string): string {
  if (!value) {
    return '/';
  }

  const trimmed = value.trim().replace(/\\/g, '/');
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  const withoutTrailing = collapsed.length > 1 ? collapsed.replace(/\/+$/u, '') : collapsed;

  return withoutTrailing === '' ? '/' : withoutTrailing;
}

function joinServerPath(base: string, segment: string): string {
  const normalizedBase = normalizeServerPath(base);
  const cleanedSegment = segment.trim().replace(/\\/g, '/').split('/').filter(Boolean).join('/');

  if (!cleanedSegment) {
    return normalizedBase;
  }

  const combined =
    normalizedBase === '/' ? `/${cleanedSegment}` : `${normalizedBase}/${cleanedSegment}`;
  return normalizeServerPath(combined);
}

export async function remoteGetSystemInformation(nodeId?: string, version?: number) {
  try {
    const node = await requireNode(nodeId);
    const resolvedNodeId = nodeId || node.id;
    const plainSecret = await getPlainTokenSecret(resolvedNodeId);
    const query =
      typeof version === 'number' && !Number.isNaN(version) ? { v: version } : undefined;
    const data = await wingsFetch<WingsSystemInformation>('/api/system', {
      baseURL: node.baseURL,
      token: plainSecret,
      allowInsecure: node.allowInsecure,
      query,
    });
    return data;
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'retrieve Wings system information', nodeId });
  }
}

function normalizeRoot(root: string | undefined): string {
  if (!root) {
    return '/';
  }
  return normalizeServerPath(root);
}

function sanitizeStrings(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

type UploadFilePayload = {
  name: string;
  data: Uint8Array | ArrayBuffer;
  mime?: string;
};

export async function remoteDeleteFiles(
  serverUuid: string,
  root: string,
  files: string[],
  nodeId?: string,
): Promise<void> {
  const sanitizedFiles = sanitizeStrings(files);
  if (sanitizedFiles.length === 0) {
    return;
  }

  try {
    const node = await requireNode(nodeId);
    const { connection } = await resolveNodeConnection(node.id);

    await wingsFetch(`/api/servers/${serverUuid}/files/delete`, {
      baseURL: node.baseURL,
      token: connection.tokenSecret,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        files: sanitizedFiles,
      },
    });
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'delete files', nodeId });
  }
}

export async function remoteCreateDirectory(
  serverUuid: string,
  root: string,
  name: string,
  nodeId?: string,
): Promise<void> {
  try {
    const node = await requireNode(nodeId);
    await wingsFetch(`/api/servers/${serverUuid}/files/create-directory`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        name: name.trim(),
      },
    });
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'create directory', nodeId });
  }
}

export async function remoteRenameFiles(
  serverUuid: string,
  root: string,
  files: Array<{ from: string; to: string }>,
  nodeId?: string,
): Promise<void> {
  if (!Array.isArray(files) || files.length === 0) {
    return;
  }

  const sanitized = files
    .map(({ from, to }) => ({
      from: normalizeServerPath(from),
      to: normalizeServerPath(to),
    }))
    .filter(({ from, to }) => from !== to);

  if (sanitized.length === 0) {
    return;
  }

  try {
    const node = await requireNode(nodeId);
    await wingsFetch(`/api/servers/${serverUuid}/files/rename`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'PUT',
      body: {
        root: normalizeRoot(root),
        files: sanitized,
      },
    });
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'rename files', nodeId });
  }
}

export async function remoteChmodFiles(
  serverUuid: string,
  root: string,
  files: Array<{ file: string; mode: string }>,
  nodeId?: string,
): Promise<void> {
  if (!Array.isArray(files) || files.length === 0) {
    return;
  }

  try {
    const node = await requireNode(nodeId);
    await wingsFetch(`/api/servers/${serverUuid}/files/chmod`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        files,
      },
    });
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'chmod files', nodeId });
  }
}

export async function remoteCopyFile(
  serverUuid: string,
  location: string,
  nodeId?: string,
): Promise<void> {
  const target = location?.trim();

  if (!target) {
    throw new Error('Copy location is required');
  }

  try {
    const node = await requireNode(nodeId);
    await wingsFetch(`/api/servers/${serverUuid}/files/copy`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        location: normalizeServerPath(target),
      },
    });
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'copy file', nodeId });
  }
}

export async function remoteCompressFiles(
  serverUuid: string,
  root: string,
  files: string[],
  nodeId?: string,
): Promise<{ file: string }> {
  const sanitizedFiles = sanitizeStrings(files);
  if (sanitizedFiles.length === 0) {
    throw new Error('No files provided for compression');
  }

  try {
    const node = await requireNode(nodeId);
    return await wingsFetch<{ file: string }>(`/api/servers/${serverUuid}/files/compress`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        files: sanitizedFiles,
      },
    });
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'compress files', nodeId });
  }
}

export async function remoteDecompressFile(
  serverUuid: string,
  root: string,
  file: string,
  nodeId?: string,
): Promise<void> {
  try {
    const node = await requireNode(nodeId);
    await wingsFetch(`/api/servers/${serverUuid}/files/decompress`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        file: file.trim(),
      },
    });
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'decompress file', nodeId });
  }
}

export async function remotePullFile(
  serverUuid: string,
  url: string,
  directory: string,
  nodeId?: string,
): Promise<void> {
  try {
    const node = await requireNode(nodeId);
    await wingsFetch(`/api/servers/${serverUuid}/files/pull`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        url,
        directory: normalizeRoot(directory),
      },
    });
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'pull remote file', nodeId });
  }
}

export async function remoteUploadFiles(
  serverUuid: string,
  root: string,
  files: UploadFilePayload[],
  nodeId?: string,
): Promise<void> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No files provided for upload');
  }

  const node = await requireNode(nodeId);

  const formData = new FormData();
  formData.set('directory', normalizeRoot(root));

  files.forEach((file) => {
    let buffer: ArrayBuffer;
    if (file.data instanceof ArrayBuffer) {
      buffer = file.data.slice(0);
    } else {
      const copy = new Uint8Array(file.data.byteLength);
      copy.set(file.data);
      buffer = copy.buffer;
    }

    const blob = new Blob([buffer], { type: file.mime ?? 'application/octet-stream' });
    formData.append('files', blob, file.name);
  });

  const uploadUrl = new URL(`/api/servers/${serverUuid}/files/upload`, node.baseURL);
  const response = await fetch(uploadUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${node.apiToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    Object.assign(error, { response });
    throw toWingsHttpError(error, { operation: 'upload files', nodeId });
  }
}

export async function remoteGetFileDownloadUrl(
  serverUuid: string,
  file: string,
  nodeId?: string,
): Promise<{ url: string }> {
  try {
    const node = await requireNode(nodeId);
    const response = await wingsFetch<{ url: string }>(
      `/api/servers/${serverUuid}/files/download`,
      {
        baseURL: node.baseURL,
        token: node.apiToken,
        allowInsecure: node.allowInsecure,
        query: {
          file: normalizeServerPath(file),
        },
      },
    );
    return response;
  } catch (error) {
    throw toWingsHttpError(error, { operation: `get download url for file ${file}`, nodeId });
  }
}

async function wingsFetch<T = unknown>(url: string, options: WingsHttpRequestOptions): Promise<T> {
  const fullUrl = new URL(url, options.baseURL);

  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          fullUrl.searchParams.append(key, String(value));
        } else if (Array.isArray(value)) {
          const firstValue = value[0];
          if (
            firstValue !== undefined &&
            firstValue !== null &&
            (typeof firstValue === 'string' ||
              typeof firstValue === 'number' ||
              typeof firstValue === 'boolean')
          ) {
            fullUrl.searchParams.append(key, String(firstValue));
          }
        }
      }
    });
  }

  const timeout = 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(fullUrl.toString(), {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          errorMessage += ` - ${errorBody}`;
        }
      } catch {
        // Error body parsing failed, continue with error message
      }

      debugError(`[Wings Fetch] Request failed: ${fullUrl.toString()}`);
      debugError(`[Wings Fetch] Status: ${response.status} ${response.statusText}`);
      debugError(`[Wings Fetch] Error message: ${errorMessage}`);

      const error = new Error(errorMessage);
      Object.assign(error, { response, status: response.status });
      throw error;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    } else {
      return response.text() as Promise<T>;
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(
          `Connection timeout after ${timeout}ms - Wings daemon at ${fullUrl.origin} is not responding`,
        );
      }
      if (
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      ) {
        throw new Error(
          `Failed to connect to Wings daemon at ${fullUrl.origin} - check if Wings is running and accessible`,
        );
      }
      if ('status' in error) {
        throw error;
      }
    }

    throw error;
  }
}

async function requireNode(nodeId?: string): Promise<StoredWingsNode> {
  if (nodeId) {
    const node = await findWingsNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }
    return node;
  }

  const availableNodes = await listWingsNodes();
  if (availableNodes.length === 0) {
    throw new Error('No Wings node configured');
  }

  if (availableNodes.length > 1) {
    throw new Error('Multiple Wings nodes configured; specify nodeId');
  }

  const node = availableNodes[0];
  if (!node) {
    throw new Error('No Wings node resolved');
  }

  return node;
}

async function getPlainTokenSecret(nodeId: string): Promise<string> {
  const row = await requireNodeRow(nodeId);
  return decryptToken(row.tokenSecret);
}

export async function remoteListServers(nodeId?: string) {
  try {
    const node = await requireNode(nodeId);
    const resolvedNodeId = nodeId || node.id;
    const plainSecret = await getPlainTokenSecret(resolvedNodeId);
    const data = await wingsFetch<WingsRemoteServer[]>('/api/servers', {
      baseURL: node.baseURL,
      token: plainSecret,
      allowInsecure: node.allowInsecure,
    });
    return data;
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'list Wings servers', nodeId });
  }
}

export async function remoteGetServerConfiguration(uuid: string, nodeId?: string) {
  try {
    const node = await requireNode(nodeId);
    const data = await wingsFetch<WingsServerConfigurationResponse>(`/api/servers/${uuid}`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
    });
    return data;
  } catch (error) {
    throw toWingsHttpError(error, {
      operation: `retrieve configuration for server ${uuid}`,
      nodeId,
    });
  }
}

export async function remoteGetInstallationScript(uuid: string, nodeId?: string) {
  try {
    const node = await requireNode(nodeId);
    return await wingsFetch(`/api/servers/${uuid}/install`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
    });
  } catch (error) {
    throw toWingsHttpError(error, {
      operation: `download install script for server ${uuid}`,
      nodeId,
    });
  }
}

export async function remotePaginateServers(page: number, perPage: number, nodeId?: string) {
  try {
    const node = await requireNode(nodeId);
    const resolvedNodeId = nodeId || node.id;
    const plainSecret = await getPlainTokenSecret(resolvedNodeId);
    const response = await wingsFetch<
      WingsPaginatedResponse<WingsRemoteServer> | WingsRemoteServer[]
    >('/api/servers', {
      baseURL: node.baseURL,
      token: plainSecret,
      allowInsecure: node.allowInsecure,
      query: {
        page,
        per_page: perPage,
      },
    });

    if (Array.isArray(response)) {
      return {
        data: response,
        meta: {
          current_page: 1,
          last_page: 1,
          per_page: response.length,
          from: response.length > 0 ? 1 : 0,
          to: response.length,
          total: response.length,
        },
      };
    }

    return response;
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'paginate Wings servers', nodeId });
  }
}

export async function remoteListServerDirectory(
  serverUuid: string,
  directory: string,
  nodeId?: string,
): Promise<ServerDirectoryListing> {
  try {
    const node = await requireNode(nodeId);
    const { connection } = await resolveNodeConnection(node.id);
    const directoryPath = normalizeServerPath(directory);

    // Pterodactyl uses node's decrypted token secret (just the secret, not tokenId.tokenSecret)
    // Wings expects: Bearer <tokenSecret> (not tokenId.tokenSecret format for file operations)
    const entries = await wingsFetch<
      {
        name: string;
        created: string;
        modified: string;
        mode: string;
        mode_bits: string;
        size: number;
        directory: boolean;
        file: boolean;
        symlink: boolean;
        mime: string;
      }[]
    >(`/api/servers/${serverUuid}/files/list-directory`, {
      baseURL: node.baseURL,
      token: connection.tokenSecret,
      allowInsecure: node.allowInsecure,
      query: { directory: directoryPath },
    });

    return {
      directory: directoryPath,
      entries: entries.map((entry) => ({
        name: entry.name,
        path: joinServerPath(directoryPath, entry.name),
        size: entry.size,
        mode: entry.mode,
        modeBits: entry.mode_bits,
        mime: entry.mime,
        created: entry.created,
        modified: entry.modified,
        isDirectory: entry.directory,
        isFile: entry.file,
        isSymlink: entry.symlink,
      })),
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 403) {
      try {
        const { syncWingsNodeConfiguration } = await import('./nodesStore');
        const runtimeConfig = useRuntimeConfig();
        const panelConfig = (runtimeConfig.public?.app ?? {}) as { baseUrl?: string };
        const panelUrl = panelConfig.baseUrl;
        if (panelUrl) await syncWingsNodeConfiguration(nodeId || 'test', panelUrl);

        const node = await requireNode(nodeId);
        const { connection } = await resolveNodeConnection(node.id);
        const directoryPath = normalizeServerPath(directory);

        const entries = await wingsFetch<
          {
            name: string;
            created: string;
            modified: string;
            mode: string;
            mode_bits: string;
            size: number;
            directory: boolean;
            file: boolean;
            symlink: boolean;
            mime: string;
          }[]
        >(`/api/servers/${serverUuid}/files/list-directory`, {
          baseURL: node.baseURL,
          token: connection.tokenSecret,
          allowInsecure: node.allowInsecure,
          query: { directory: directoryPath },
        });

        return {
          directory: directoryPath,
          entries: entries.map((entry) => ({
            name: entry.name,
            path: joinServerPath(directoryPath, entry.name),
            size: entry.size,
            mode: entry.mode,
            modeBits: entry.mode_bits,
            mime: entry.mime,
            created: entry.created,
            modified: entry.modified,
            isDirectory: entry.directory,
            isFile: entry.file,
            isSymlink: entry.symlink,
          })),
        };
      } catch (syncError) {
        debugError('[Files List] Failed to sync Wings configuration:', syncError);
      }
    }

    throw toWingsHttpError(error, { operation: `list directory ${directory}`, nodeId });
  }
}

export async function remoteGetFileContents(
  serverUuid: string,
  file: string,
  nodeId?: string,
): Promise<ServerFileContentResponse> {
  try {
    const node = await requireNode(nodeId);
    const { connection } = await resolveNodeConnection(node.id);
    const filePath = normalizeServerPath(file);

    const fullUrl = new URL(`/api/servers/${serverUuid}/files/contents`, node.baseURL);
    fullUrl.searchParams.append('file', filePath);

    const response = await fetch(fullUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${connection.tokenSecret}`,
        Accept: 'text/plain, */*',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
      );
    }

    const content = await response.text();

    return {
      path: filePath,
      content,
    };
  } catch (error) {
    throw toWingsHttpError(error, { operation: `read file ${file}`, nodeId });
  }
}

export async function remoteWriteFile(
  serverUuid: string,
  file: string,
  contents: string,
  nodeId?: string,
): Promise<void> {
  try {
    const node = await requireNode(nodeId);
    const { connection } = await resolveNodeConnection(node.id);
    const filePath = normalizeServerPath(file);
    const fullUrl = new URL(`/api/servers/${serverUuid}/files/write`, node.baseURL);
    fullUrl.searchParams.append('file', filePath);

    const timeout = 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(fullUrl.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.tokenSecret}`,
          'Content-Type': 'text/plain',
        },
        body: contents,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errorMessage = `HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
        debugError('[Wings Write] Wings rejected file write:', {
          serverUuid,
          filePath,
          status: response.status,
          statusText: response.statusText,
          errorText,
        });
        throw new Error(errorMessage);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          throw new Error(
            `Connection timeout after ${timeout}ms - Wings daemon at ${fullUrl.origin} is not responding`,
          );
        }
        if (
          fetchError.message.includes('fetch failed') ||
          fetchError.message.includes('ECONNREFUSED') ||
          fetchError.message.includes('ENOTFOUND')
        ) {
          throw new Error(
            `Failed to connect to Wings daemon at ${fullUrl.origin} - check if Wings is running and accessible`,
          );
        }
      }

      throw fetchError;
    }
  } catch (error) {
    debugError('[Wings Write] Wings rejected file write:', {
      serverUuid,
      file,
      error: error instanceof Error ? error.message : String(error),
      nodeId,
    });
    throw toWingsHttpError(error, { operation: `write file ${file}`, nodeId });
  }
}

export async function listServers(nodeId?: string) {
  return remoteListServers(nodeId);
}

export async function paginateServers(page: number, perPage: number, nodeId?: string) {
  return remotePaginateServers(page, perPage, nodeId);
}

export async function getServerConfiguration(uuid: string, nodeId?: string) {
  return remoteGetServerConfiguration(uuid, nodeId);
}

export async function getInstallationScript(uuid: string, nodeId?: string) {
  return remoteGetInstallationScript(uuid, nodeId);
}

export async function findServerAccessibleByUser(username: string, nodeId?: string) {
  const normalized = username.trim().toLowerCase();
  const servers = await remoteListServers(nodeId);
  return servers.find(
    (server) =>
      server.identifier.toLowerCase() === normalized || server.uuid.toLowerCase() === normalized,
  );
}
