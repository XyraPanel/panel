import { formatAuthToken } from '#server/utils/wings/encryption';
import type {
  WingsNodeConnection,
  WingsFileContentResponse,
  WingsCompressResponse,
  WingsUuidResponse,
  WingsUrlResponse,
  WingsServerDetailsResponse,
} from '#shared/types/wings';

export function createWingsClient(node: WingsNodeConnection) {
  const baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`;

  function hasStringProp(value: unknown, key: string): boolean {
    if (typeof value !== 'object' || value === null || !(key in value)) return false;
    return typeof Reflect.get(value, key) === 'string';
  }

  function isFileContentResponse(value: unknown): value is WingsFileContentResponse {
    return hasStringProp(value, 'content');
  }

  function isCompressResponse(value: unknown): value is WingsCompressResponse {
    return hasStringProp(value, 'file');
  }

  function isUuidResponse(value: unknown): value is WingsUuidResponse {
    return hasStringProp(value, 'uuid');
  }

  function isUrlResponse(value: unknown): value is WingsUrlResponse {
    return hasStringProp(value, 'url');
  }

  function isServerDetailsResponse(value: unknown): value is WingsServerDetailsResponse {
    return typeof value === 'object' && value !== null && 'state' in value && 'utilization' in value;
  }

  async function request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    },
    validate: (data: unknown) => data is T,
  ): Promise<T>;
  async function request(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<void>;
  async function request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
    validate?: (data: unknown) => data is T,
  ): Promise<T | void> {
    const url = `${baseUrl}${path}`;

    const authToken = formatAuthToken(node.tokenId, node.tokenSecret);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wings API error: ${response.status} - ${error}`);
    }

    if (response.status === 204 || !validate) {
      return;
    }

    const data: unknown = await response.json();
    if (!validate(data)) {
      throw new Error(`Wings API returned unexpected response shape for ${path}`);
    }
    return data;
  }

  return {
    async setPowerState(serverUuid: string, action: string) {
      return request(`/api/servers/${serverUuid}/power`, {
        method: 'POST',
        body: { action },
      });
    },

    async sendCommand(serverUuid: string, command: string) {
      return request(`/api/servers/${serverUuid}/command`, {
        method: 'POST',
        body: { command },
      });
    },

    async getFileContents(serverUuid: string, filePath: string) {
      return request(
        `/api/servers/${serverUuid}/files/contents?file=${encodeURIComponent(filePath)}`,
        {},
        isFileContentResponse,
      );
    },

    async writeFile(serverUuid: string, filePath: string, content: string) {
      return request(
        `/api/servers/${serverUuid}/files/write?file=${encodeURIComponent(filePath)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: content,
        },
      );
    },

    async deleteFiles(serverUuid: string, files: string[]) {
      return request(`/api/servers/${serverUuid}/files/delete`, {
        method: 'POST',
        body: { root: '/', files },
      });
    },

    async createDirectory(serverUuid: string, path: string, name: string) {
      return request(`/api/servers/${serverUuid}/files/create-directory`, {
        method: 'POST',
        body: { root: path, name },
      });
    },

    async renameFile(serverUuid: string, root: string, files: Array<{ from: string; to: string }>) {
      return request(`/api/servers/${serverUuid}/files/rename`, {
        method: 'PUT',
        body: { root, files },
      });
    },

    async copyFile(serverUuid: string, location: string) {
      return request(`/api/servers/${serverUuid}/files/copy`, {
        method: 'POST',
        body: { location },
      });
    },

    async compressFiles(serverUuid: string, root: string, files: string[]) {
      return request(`/api/servers/${serverUuid}/files/compress`, {
        method: 'POST',
        body: { root, files },
      }, isCompressResponse);
    },

    async decompressFile(serverUuid: string, root: string, file: string) {
      return request(`/api/servers/${serverUuid}/files/decompress`, {
        method: 'POST',
        body: { root, file },
      });
    },

    async chmodFiles(
      serverUuid: string,
      root: string,
      files: Array<{ file: string; mode: string }>,
    ) {
      return request(`/api/servers/${serverUuid}/files/chmod`, {
        method: 'POST',
        body: { root, files },
      });
    },

    async pullFile(serverUuid: string, url: string, directory: string) {
      return request(`/api/servers/${serverUuid}/files/pull`, {
        method: 'POST',
        body: { url, directory },
      });
    },

    async createBackup(serverUuid: string) {
      return request(`/api/servers/${serverUuid}/backup`, {
        method: 'POST',
      }, isUuidResponse);
    },

    async deleteBackup(serverUuid: string, backupUuid: string) {
      return request(`/api/servers/${serverUuid}/backup/${backupUuid}`, {
        method: 'DELETE',
      });
    },

    async restoreBackup(serverUuid: string, backupUuid: string) {
      return request(`/api/servers/${serverUuid}/backup/${backupUuid}/restore`, {
        method: 'POST',
      });
    },

    async getBackupDownloadUrl(serverUuid: string, backupUuid: string): Promise<string> {
      const data = await request(
        `/api/servers/${serverUuid}/backup/${backupUuid}/download`,
        {},
        isUrlResponse,
      );
      return data.url;
    },

    async getServerDetails(serverUuid: string) {
      return request(
        `/api/servers/${serverUuid}`,
        {},
        isServerDetailsResponse,
      );
    },
  };
}

export type WingsClient = ReturnType<typeof createWingsClient>;
