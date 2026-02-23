import { getWingsClientForServer } from '#server/utils/wings-client';
import { recordAuditEvent } from '#server/utils/audit';
import type { FileManagerOptions, FileUploadResult } from '#shared/types/server';

export class FileManager {
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024;
  private readonly MAX_VIEW_SIZE = 5 * 1024 * 1024;
  private readonly BINARY_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
    '.ico',
    '.pdf',
    '.zip',
    '.tar',
    '.gz',
    '.exe',
    '.bin',
    '.so',
    '.dll',
  ];

  private sanitizePath(path: string): string {
    return path.replace(/\.\./g, '').replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
  }

  private isBinaryFile(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return this.BINARY_EXTENSIONS.includes(ext);
  }

  async listFiles(serverUuid: string, directory: string = '/', _options: FileManagerOptions = {}) {
    const sanitizedDir = this.sanitizePath(directory);
    const { client } = await getWingsClientForServer(serverUuid);

    const files = await client.listFiles(serverUuid, sanitizedDir);

    const sortedFiles = files.sort((a, b) => {
      const aIsFile = a.file === true;
      const bIsFile = b.file === true;
      if (aIsFile !== bIsFile) {
        return aIsFile ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      files: sortedFiles,
      directory: sanitizedDir,
      parent: sanitizedDir === '/' ? null : sanitizedDir.split('/').slice(0, -1).join('/') || '/',
    };
  }

  async getFileContents(serverUuid: string, filePath: string, _options: FileManagerOptions = {}) {
    const sanitizedPath = this.sanitizePath(filePath);
    const { client } = await getWingsClientForServer(serverUuid);

    if (this.isBinaryFile(sanitizedPath)) {
      throw new Error('Cannot view binary file');
    }

    const directory = sanitizedPath.substring(0, sanitizedPath.lastIndexOf('/')) || '/';
    const filename = sanitizedPath.substring(sanitizedPath.lastIndexOf('/') + 1);
    const files = await client.listFiles(serverUuid, directory);
    const fileInfo = files.find((f) => f.name === filename);

    if (fileInfo && fileInfo.size > this.MAX_VIEW_SIZE) {
      throw new Error(`File too large to view (${fileInfo.size} bytes, max ${this.MAX_VIEW_SIZE})`);
    }

    const content = await client.getFileContents(serverUuid, sanitizedPath);

    return {
      content,
      file: sanitizedPath,
      size: fileInfo?.size || content.length,
      lastModified: fileInfo?.modified,
      isEditable: !this.isBinaryFile(sanitizedPath),
    };
  }

  async writeFile(
    serverUuid: string,
    filePath: string,
    content: string,
    options: FileManagerOptions = {},
  ) {
    const sanitizedPath = this.sanitizePath(filePath);
    const { client, server } = await getWingsClientForServer(serverUuid);

    const contentSize = Buffer.byteLength(content, 'utf8');
    if (contentSize > this.MAX_FILE_SIZE) {
      throw new Error(`File content too large (${contentSize} bytes, max ${this.MAX_FILE_SIZE})`);
    }

    let hadExistingFile = false;
    try {
      await client.getFileContents(serverUuid, sanitizedPath);
      hadExistingFile = true;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${sanitizedPath}.backup-${timestamp}`;
      await client.copyFile(serverUuid, sanitizedPath);

      const directory = sanitizedPath.substring(0, sanitizedPath.lastIndexOf('/')) || '/';
      const filename = sanitizedPath.substring(sanitizedPath.lastIndexOf('/') + 1);
      const backupFilename = backupPath.substring(backupPath.lastIndexOf('/') + 1);

      await client.renameFile(serverUuid, directory, [{ from: filename, to: backupFilename }]);
    } catch {
      // Backup failed, continue with write operation
    }

    await client.writeFileContents(serverUuid, sanitizedPath, content);

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: hadExistingFile ? 'server.file.edit' : 'server.file.create',
        targetType: 'server',
        targetId: server.id as string,
        metadata: {
          file: sanitizedPath,
          size: contentSize,
          hadBackup: hadExistingFile,
        },
      });
    }

    return {
      file: sanitizedPath,
      size: contentSize,
      hadBackup: hadExistingFile,
    };
  }

  async deleteFiles(
    serverUuid: string,
    directory: string,
    files: string[],
    options: FileManagerOptions = {},
  ) {
    const sanitizedDir = this.sanitizePath(directory);
    const { client, server } = await getWingsClientForServer(serverUuid);

    await client.deleteFiles(serverUuid, sanitizedDir, files);

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.file.delete',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { directory: sanitizedDir, files },
      });
    }

    return { deleted: files.length };
  }

  async renameFiles(
    serverUuid: string,
    directory: string,
    renames: Array<{ from: string; to: string }>,
    options: FileManagerOptions = {},
  ) {
    const sanitizedDir = this.sanitizePath(directory);
    const { client, server } = await getWingsClientForServer(serverUuid);

    await client.renameFile(serverUuid, sanitizedDir, renames);

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.file.rename',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { directory: sanitizedDir, renames },
      });
    }

    return { renamed: renames.length };
  }

  async copyFile(serverUuid: string, filePath: string, options: FileManagerOptions = {}) {
    const sanitizedPath = this.sanitizePath(filePath);
    const { client, server } = await getWingsClientForServer(serverUuid);

    await client.copyFile(serverUuid, sanitizedPath);

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.file.copy',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { file: sanitizedPath },
      });
    }

    return { copied: sanitizedPath };
  }

  async createDirectory(
    serverUuid: string,
    directory: string,
    name: string,
    options: FileManagerOptions = {},
  ) {
    const sanitizedDir = this.sanitizePath(directory);
    const sanitizedName = name.replace(/[/\\]/g, '');
    const { client, server } = await getWingsClientForServer(serverUuid);

    await client.createDirectory(serverUuid, sanitizedDir, sanitizedName);

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.file.mkdir',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { directory: sanitizedDir, name: sanitizedName },
      });
    }

    return { created: `${sanitizedDir}/${sanitizedName}` };
  }

  async compressFiles(
    serverUuid: string,
    directory: string,
    files: string[],
    options: FileManagerOptions = {},
  ) {
    const sanitizedDir = this.sanitizePath(directory);
    const { client, server } = await getWingsClientForServer(serverUuid);

    const result = await client.compressFiles(serverUuid, sanitizedDir, files);

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.file.compress',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { directory: sanitizedDir, files, archive: result.file },
      });
    }

    return result;
  }

  async decompressFile(
    serverUuid: string,
    directory: string,
    file: string,
    options: FileManagerOptions = {},
  ) {
    const sanitizedDir = this.sanitizePath(directory);
    const { client, server } = await getWingsClientForServer(serverUuid);

    await client.decompressFile(serverUuid, sanitizedDir, file);

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.file.decompress',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { directory: sanitizedDir, file },
      });
    }

    return { decompressed: file };
  }

  async chmodFiles(
    serverUuid: string,
    directory: string,
    files: Array<{ file: string; mode: string }>,
    options: FileManagerOptions = {},
  ) {
    const sanitizedDir = this.sanitizePath(directory);
    const { client, server } = await getWingsClientForServer(serverUuid);

    await client.chmodFiles(serverUuid, sanitizedDir, files);

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.file.chmod',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { directory: sanitizedDir, files },
      });
    }

    return { modified: files.length };
  }

  async getUploadUrl(serverUuid: string): Promise<FileUploadResult> {
    try {
      const { client } = await getWingsClientForServer(serverUuid);
      const uploadUrl = await client.getFileUploadUrl(serverUuid);

      return {
        success: true,
        uploadUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get upload URL',
      };
    }
  }

  getDownloadUrl(serverUuid: string, filePath: string): string {
    const sanitizedPath = this.sanitizePath(filePath);
    return `/api/servers/${serverUuid}/files/download?file=${encodeURIComponent(sanitizedPath)}`;
  }
}

export const fileManager = new FileManager();
