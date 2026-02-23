import type {
  WingsNode,
  WingsServerDetails,
  WingsFileObject,
  WingsBackup,
} from '#shared/types/wings-client';
import { decryptToken } from '#server/utils/wings/encryption';
import { debugError } from '#server/utils/logger';

export class WingsConnectionError extends Error {
  constructor(
    message: string,
    public override cause?: Error,
  ) {
    super(message);
    this.name = 'WingsConnectionError';
  }
}

export class WingsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WingsAuthError';
  }
}

export class WingsClient {
  private baseUrl: string;
  private encryptedToken: string;
  private timeout: number = 10000;
  private maxRetries = 1;

  private normalizeDirectoryForWings(directory: string): string {
    const normalized = directory
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/');

    if (normalized === '/' || normalized.length === 0) {
      return '';
    }

    return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  constructor(node: WingsNode) {
    this.baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`;
    this.encryptedToken = node.token;
  }

  private getToken(): string {
    return `Bearer ${decryptToken(this.encryptedToken)}`;
  }

  getAuthHeader(): string {
    return this.getToken();
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let lastError: Error | null = null;
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: this.getToken(),
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new WingsAuthError(`Authentication failed: ${response.status}`);
          }

          let errorMessage = `Wings request failed: ${response.status}`;
          try {
            const errorBody = await response.text();
            if (errorBody) {
              errorMessage += ` - ${errorBody}`;
            }
          } catch {
            // Error body parsing failed, continue with error message
          }

          throw new WingsConnectionError(errorMessage);
        }

        if (response.status === 204 || response.status === 202) {
          return {} as T;
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          return {} as T;
        }

        const text = await response.text();
        if (!text || text.trim().length === 0) {
          return {} as T;
        }

        return JSON.parse(text) as T;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof WingsAuthError) {
          throw error;
        }

        if (error instanceof WingsConnectionError) {
          lastError = error;
        } else if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = new WingsConnectionError(`Request timeout after ${this.timeout}ms`, error);
          } else {
            lastError = new WingsConnectionError(
              `Failed to connect to Wings daemon at ${this.baseUrl}`,
              error,
            );
          }
        } else {
          lastError = new WingsConnectionError('Unknown Wings communication error');
        }

        if (attempt < this.maxRetries) {
          const backoff = Math.pow(2, attempt) * 200;
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new WingsConnectionError('Unknown Wings communication error');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request('/api/system');
      return true;
    } catch (error) {
      debugError('Wings connection test failed:', error);
      return false;
    }
  }

  async getSystemInfo(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/api/system');
  }

  async getServerDetails(serverUuid: string): Promise<WingsServerDetails> {
    return this.request<WingsServerDetails>(`/api/servers/${serverUuid}`);
  }

  async sendPowerAction(
    serverUuid: string,
    action: 'start' | 'stop' | 'restart' | 'kill',
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/power`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  async sendCommand(serverUuid: string, command: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
  }

  async getServerResources(serverUuid: string): Promise<WingsServerDetails> {
    return this.getServerDetails(serverUuid);
  }

  async listFiles(serverUuid: string, directory: string = '/'): Promise<WingsFileObject[]> {
    const params = new URLSearchParams({
      directory: this.normalizeDirectoryForWings(directory),
    });
    return this.request<WingsFileObject[]>(
      `/api/servers/${serverUuid}/files/list-directory?${params}`,
    );
  }

  async getFileContents(serverUuid: string, filePath: string): Promise<string> {
    const params = new URLSearchParams({ file: filePath });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(
        `${this.baseUrl}/api/servers/${serverUuid}/files/contents?${params}`,
        {
          headers: {
            Authorization: this.getToken(),
            Accept: 'text/plain, */*',
          },
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `Failed to read file: ${response.status}`;
        try {
          const body = await response.text();
          if (body) errorMessage += ` - ${body}`;
        } catch {
          /* ignore */
        }
        throw new WingsConnectionError(errorMessage);
      }

      return response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WingsConnectionError(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  async writeFileContents(serverUuid: string, filePath: string, content: string): Promise<void> {
    const params = new URLSearchParams({ file: filePath });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      await fetch(`${this.baseUrl}/api/servers/${serverUuid}/files/write?${params}`, {
        method: 'POST',
        headers: {
          Authorization: this.getToken(),
          'Content-Type': 'text/plain',
        },
        body: content,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WingsConnectionError(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  async deleteFiles(serverUuid: string, root: string, files: string[]): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/delete`, {
      method: 'POST',
      body: JSON.stringify({ root, files }),
    });
  }

  async renameFile(
    serverUuid: string,
    root: string,
    files: Array<{ from: string; to: string }>,
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/rename`, {
      method: 'PUT',
      body: JSON.stringify({ root, files }),
    });
  }

  async copyFile(serverUuid: string, location: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/copy`, {
      method: 'POST',
      body: JSON.stringify({ location }),
    });
  }

  async createDirectory(serverUuid: string, root: string, name: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/create-directory`, {
      method: 'POST',
      body: JSON.stringify({ path: root, name }),
    });
  }

  async compressFiles(
    serverUuid: string,
    root: string,
    files: string[],
  ): Promise<{ file: string }> {
    return this.request<{ file: string }>(`/api/servers/${serverUuid}/files/compress`, {
      method: 'POST',
      body: JSON.stringify({ root, files }),
    });
  }

  async decompressFile(serverUuid: string, root: string, file: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/decompress`, {
      method: 'POST',
      body: JSON.stringify({ root, file }),
    });
  }

  async chmodFiles(
    serverUuid: string,
    root: string,
    files: Array<{ file: string; mode: string }>,
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/chmod`, {
      method: 'POST',
      body: JSON.stringify({ root, files }),
    });
  }

  async pullFile(
    serverUuid: string,
    url: string,
    directory: string,
    filename?: string,
    useHeader?: boolean,
    foreground?: boolean,
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/pull`, {
      method: 'POST',
      body: JSON.stringify({
        url,
        directory,
        filename,
        use_header: useHeader,
        foreground,
      }),
    });
  }

  async getFileDownloadUrl(serverUuid: string, filePath: string): Promise<string> {
    const params = new URLSearchParams({ file: filePath });
    const response = await this.request<{ url: string }>(
      `/api/servers/${serverUuid}/files/download?${params}`,
    );
    return response.url;
  }

  async downloadFileStream(serverUuid: string, filePath: string): Promise<Response> {
    const signedUrl = await this.getFileDownloadUrl(serverUuid, filePath);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(signedUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new WingsConnectionError(`Failed to download file contents: ${response.status}`);
      }

      if (!response.body) {
        throw new WingsConnectionError('Wings responded without a stream body for file download');
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WingsConnectionError(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  async getFileUploadUrl(serverUuid: string, directory?: string): Promise<string> {
    const params = new URLSearchParams();
    if (directory) {
      params.set('directory', directory);
    }

    const path =
      params.size > 0
        ? `/api/servers/${serverUuid}/files/upload?${params.toString()}`
        : `/api/servers/${serverUuid}/files/upload`;

    const response = await this.request<{ url: string }>(path);
    return response.url;
  }

  async listBackups(serverUuid: string): Promise<WingsBackup[]> {
    return this.request<WingsBackup[]>(`/api/servers/${serverUuid}/backups`);
  }

  async createBackup(
    serverUuid: string,
    backupUuid: string,
    ignored?: string,
    adapter: 'wings' | 's3' = 'wings',
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/backup`, {
      method: 'POST',
      body: JSON.stringify({
        adapter,
        uuid: backupUuid,
        ignore: ignored ?? '',
      }),
    });
  }

  async deleteBackup(serverUuid: string, backupUuid: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/backup/${backupUuid}`, {
      method: 'DELETE',
    });
  }

  async restoreBackup(
    serverUuid: string,
    backupUuid: string,
    truncate: boolean = false,
    adapter: 'wings' | 's3' = 'wings',
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/backup/${backupUuid}/restore`, {
      method: 'POST',
      body: JSON.stringify({
        adapter,
        truncate_directory: truncate,
      }),
    });
  }

  async streamBackupDownload(serverUuid: string, backupUuid: string): Promise<Response> {
    const downloadUrl = this.getBackupDownloadUrl(serverUuid, backupUuid);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: 'application/octet-stream',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok || !response.body) {
        throw new WingsConnectionError(`Failed to download backup: ${response.status}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WingsConnectionError(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  getBackupDownloadUrl(serverUuid: string, backupUuid: string): string {
    return `${this.baseUrl}/api/servers/${serverUuid}/backup/${backupUuid}/download`;
  }

  async createServer(serverUuid: string, config: Record<string, unknown>): Promise<void> {
    const payload = {
      uuid: serverUuid,
      start_on_completion: config.start_on_completion ?? true,
    };
    await this.request('/api/servers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateServer(serverUuid: string, config: Record<string, unknown>): Promise<void> {
    await this.request(`/api/servers/${serverUuid}`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    });
  }

  async syncServer(serverUuid: string): Promise<void> {
    // Wings removed PATCH /api/servers/:server and replaced it with POST /api/servers/:server/sync
    // This triggers Wings to refetch the server config from the panel and apply changes immediately
    await this.request(`/api/servers/${serverUuid}/sync`, {
      method: 'POST',
    });
  }

  async deleteServer(serverUuid: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}`, {
      method: 'DELETE',
    });
  }

  async reinstallServer(serverUuid: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/reinstall`, {
      method: 'POST',
    });
  }

  async getWebSocketToken(serverUuid: string): Promise<{ token: string; socket: string }> {
    return this.request<{ token: string; socket: string }>(`/api/servers/${serverUuid}/ws`);
  }
}

export function getWingsClient(node: WingsNode): WingsClient {
  return new WingsClient(node);
}

export async function getWingsClientForServer(
  serverIdentifier: string,
): Promise<{ client: WingsClient; server: Record<string, unknown> }> {
  const { useDrizzle, tables, eq, or } = await import('./drizzle');
  const db = useDrizzle();

  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(
      or(
        eq(tables.servers.identifier, serverIdentifier),
        eq(tables.servers.uuid, serverIdentifier),
        eq(tables.servers.id, serverIdentifier),
      ),
    )
    .limit(1);

  const server = serverRows[0];

  if (!server) {
    throw new Error('Server not found');
  }

  const nodeRows = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId!))
    .limit(1);

  const node = nodeRows[0];

  if (!node) {
    throw new Error('Node not found');
  }

  const wingsNode: WingsNode = {
    id: node.id,
    fqdn: node.fqdn,
    scheme: node.scheme as 'http' | 'https',
    daemonListen: node.daemonListen,
    daemonSftp: node.daemonSftp,
    daemonBase: node.daemonBase,
    tokenId: node.tokenIdentifier,
    token: node.tokenSecret,
  };

  return {
    client: getWingsClient(wingsNode),
    server,
  };
}
