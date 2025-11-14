import { toWingsHttpError } from './http'
import { findWingsNode, listWingsNodes } from './nodesStore'

import type {
  StoredWingsNode,
  WingsPaginatedResponse,
  WingsRemoteServer,
  WingsServerConfigurationResponse,
  WingsSystemInformation,
  WingsHttpRequestOptions,
} from '#shared/types/wings'
import type { ServerDirectoryListing, ServerFileContentResponse } from '#shared/types/server-pages'

function normalizeServerPath(value: string): string {
  if (!value) {
    return '/'
  }

  const trimmed = value.trim().replace(/\\/g, '/')
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/')
  const withoutTrailing = collapsed.length > 1 ? collapsed.replace(/\/+$/u, '') : collapsed

  return withoutTrailing === '' ? '/' : withoutTrailing
}

function joinServerPath(base: string, segment: string): string {
  const normalizedBase = normalizeServerPath(base)
  const cleanedSegment = segment.trim().replace(/\\/g, '/').split('/').filter(Boolean).join('/')

  if (!cleanedSegment) {
    return normalizedBase
  }

  const combined = normalizedBase === '/' ? `/${cleanedSegment}` : `${normalizedBase}/${cleanedSegment}`
  return normalizeServerPath(combined)
}

export async function remoteGetSystemInformation(nodeId?: string, version?: number) {
  try {
    const node = requireNode(nodeId)
    const query = typeof version === 'number' && !Number.isNaN(version) ? { v: version } : undefined
    const data = await wingsFetch<WingsSystemInformation>('/api/system', {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      query
    })
    return data
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'retrieve Wings system information', nodeId })
  }
}

function normalizeRoot(root: string | undefined): string {
  if (!root) {
    return '/'
  }
  return normalizeServerPath(root)
}

function sanitizeStrings(values: string[]): string[] {
  return values
    .map(value => value.trim())
    .filter(Boolean)
}

type UploadFilePayload = {
  name: string
  data: Uint8Array | ArrayBuffer
  mime?: string
}

export async function remoteDeleteFiles(serverUuid: string, root: string, files: string[], nodeId?: string): Promise<void> {
  const sanitizedFiles = sanitizeStrings(files)
  if (sanitizedFiles.length === 0) {
    return
  }

  try {
    const node = requireNode(nodeId)
    await wingsFetch(`/api/servers/${serverUuid}/files/delete`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        files: sanitizedFiles,
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'delete files', nodeId })
  }
}

export async function remoteCreateDirectory(serverUuid: string, root: string, name: string, nodeId?: string): Promise<void> {
  try {
    const node = requireNode(nodeId)
    await wingsFetch(`/api/servers/${serverUuid}/files/create-directory`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        name: name.trim(),
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'create directory', nodeId })
  }
}

export async function remoteRenameFiles(
  serverUuid: string,
  root: string,
  files: Array<{ from: string; to: string }>,
  nodeId?: string,
): Promise<void> {
  if (!Array.isArray(files) || files.length === 0) {
    return
  }

  const sanitized = files
    .map(({ from, to }) => ({
      from: normalizeServerPath(from),
      to: normalizeServerPath(to),
    }))
    .filter(({ from, to }) => from !== to)

  if (sanitized.length === 0) {
    return
  }

  try {
    const node = requireNode(nodeId)
    await wingsFetch(`/api/servers/${serverUuid}/files/rename`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'PUT',
      body: {
        root: normalizeRoot(root),
        files: sanitized,
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'rename files', nodeId })
  }
}

export async function remoteChmodFiles(
  serverUuid: string,
  root: string,
  files: Array<{ file: string; mode: string }>,
  nodeId?: string,
): Promise<void> {
  if (!Array.isArray(files) || files.length === 0) {
    return
  }

  try {
    const node = requireNode(nodeId)
    await wingsFetch(`/api/servers/${serverUuid}/files/chmod`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        files,
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'chmod files', nodeId })
  }
}

export async function remoteCopyFile(
  serverUuid: string,
  location: string,
  nodeId?: string,
): Promise<void> {
  const target = location?.trim()

  if (!target) {
    throw new Error('Copy location is required')
  }

  try {
    const node = requireNode(nodeId)
    await wingsFetch(`/api/servers/${serverUuid}/files/copy`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        location: normalizeServerPath(target),
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'copy file', nodeId })
  }
}

export async function remoteCompressFiles(serverUuid: string, root: string, files: string[], nodeId?: string): Promise<{ file: string }> {
  const sanitizedFiles = sanitizeStrings(files)
  if (sanitizedFiles.length === 0) {
    throw new Error('No files provided for compression')
  }

  try {
    const node = requireNode(nodeId)
    return await wingsFetch<{ file: string }>(`/api/servers/${serverUuid}/files/compress`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        files: sanitizedFiles,
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'compress files', nodeId })
  }
}

export async function remoteDecompressFile(serverUuid: string, root: string, file: string, nodeId?: string): Promise<void> {
  try {
    const node = requireNode(nodeId)
    await wingsFetch(`/api/servers/${serverUuid}/files/decompress`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        root: normalizeRoot(root),
        file: file.trim(),
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'decompress file', nodeId })
  }
}

export async function remotePullFile(serverUuid: string, url: string, directory: string, nodeId?: string): Promise<void> {
  try {
    const node = requireNode(nodeId)
    await wingsFetch(`/api/servers/${serverUuid}/files/pull`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        url,
        directory: normalizeRoot(directory),
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'pull remote file', nodeId })
  }
}

export async function remoteUploadFiles(
  serverUuid: string,
  root: string,
  files: UploadFilePayload[],
  nodeId?: string,
): Promise<void> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No files provided for upload')
  }

  const node = requireNode(nodeId)
  const formData = new FormData()
  formData.set('directory', normalizeRoot(root))

  files.forEach((file) => {
    let buffer: ArrayBuffer
    if (file.data instanceof ArrayBuffer) {
      buffer = file.data.slice(0)
    }
    else {
      const copy = new Uint8Array(file.data.byteLength)
      copy.set(file.data)
      buffer = copy.buffer
    }

    const blob = new Blob([buffer], { type: file.mime ?? 'application/octet-stream' })
    formData.append('files', blob, file.name)
  })

  if (node.allowInsecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }

  const uploadUrl = new URL(`/api/servers/${serverUuid}/files/upload`, node.baseURL)
  const response = await fetch(uploadUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${node.apiToken}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
    Object.assign(error, { response })
    throw toWingsHttpError(error, { operation: 'upload files', nodeId })
  }
}

export async function remoteGetFileDownloadUrl(serverUuid: string, file: string, nodeId?: string): Promise<{ url: string }> {
  try {
    const node = requireNode(nodeId)
    const response = await wingsFetch<{ url: string }>(`/api/servers/${serverUuid}/files/download`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      query: {
        file: normalizeServerPath(file),
      },
    })
    return response
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: `get download url for file ${file}`, nodeId })
  }
}

async function wingsFetch<T = unknown>(url: string, options: WingsHttpRequestOptions): Promise<T> {
  if (options.allowInsecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }

  const fullUrl = new URL(url, options.baseURL)

  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        fullUrl.searchParams.append(key, String(value))
      }
    })
  }

  const response = await fetch(fullUrl.toString(), {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${options.token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
    Object.assign(error, { response })
    throw error
  }

  return response.json() as Promise<T>
}

function requireNode(nodeId?: string): StoredWingsNode {
  if (nodeId) {
    const node = findWingsNode(nodeId)
    if (!node) {
      throw new Error(`Node ${nodeId} not found`)
    }
    return node
  }

  const availableNodes = listWingsNodes()
  if (availableNodes.length === 0) {
    throw new Error('No Wings node configured')
  }

  if (availableNodes.length > 1) {
    throw new Error('Multiple Wings nodes configured; specify nodeId')
  }

  const node = availableNodes[0]
  if (!node) {
    throw new Error('No Wings node resolved')
  }

  return node
}

export async function remoteListServers(nodeId?: string) {
  try {
    const node = requireNode(nodeId)
    const data = await wingsFetch<WingsRemoteServer[]>('/api/servers', {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure
    })
    return data
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'list Wings servers', nodeId })
  }
}

export async function remoteGetServerConfiguration(uuid: string, nodeId?: string) {
  try {
    const node = requireNode(nodeId)
    const data = await wingsFetch<WingsServerConfigurationResponse>(`/api/servers/${uuid}`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure
    })
    return data
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: `retrieve configuration for server ${uuid}`, nodeId })
  }
}

export async function remoteGetInstallationScript(uuid: string, nodeId?: string) {
  try {
    const node = requireNode(nodeId)
    return await wingsFetch(`/api/servers/${uuid}/install`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: `download install script for server ${uuid}`, nodeId })
  }
}

export async function remotePaginateServers(page: number, perPage: number, nodeId?: string) {
  try {
    const node = requireNode(nodeId)
    const data = await wingsFetch<WingsPaginatedResponse<WingsRemoteServer>>('/api/servers', {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      query: {
        page,
        per_page: perPage,
      },
    })
    return data
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'paginate Wings servers', nodeId })
  }
}

export async function remoteListServerDirectory(serverUuid: string, directory: string, nodeId?: string): Promise<ServerDirectoryListing> {
  try {
    const node = requireNode(nodeId)
    const directoryPath = normalizeServerPath(directory)
    const entries = await wingsFetch<{ name: string, created: string, modified: string, mode: string, mode_bits: string, size: number, directory: boolean, file: boolean, symlink: boolean, mime: string }[]>(`/api/servers/${serverUuid}/files/list-directory`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      query: { directory: directoryPath },
    })

    return {
      directory: directoryPath,
      entries: entries.map(entry => ({
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
    }
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: `list directory ${directory}`, nodeId })
  }
}

export async function remoteGetFileContents(serverUuid: string, file: string, nodeId?: string): Promise<ServerFileContentResponse> {
  try {
    const node = requireNode(nodeId)
    const filePath = normalizeServerPath(file)
    const content = await wingsFetch<string>(`/api/servers/${serverUuid}/files/contents`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      query: { file: filePath },
    })

    return {
      path: filePath,
      content,
    }
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: `read file ${file}`, nodeId })
  }
}

export async function remoteWriteFile(serverUuid: string, file: string, contents: string, nodeId?: string): Promise<void> {
  try {
    const node = requireNode(nodeId)
    const filePath = normalizeServerPath(file)
    await wingsFetch(`/api/servers/${serverUuid}/files/write`, {
      baseURL: node.baseURL,
      token: node.apiToken,
      allowInsecure: node.allowInsecure,
      method: 'POST',
      body: {
        file: filePath,
        content: contents,
      },
    })
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: `write file ${file}`, nodeId })
  }
}

export async function listServers(nodeId?: string) {
  return remoteListServers(nodeId)
}

export async function paginateServers(page: number, perPage: number, nodeId?: string) {
  return remotePaginateServers(page, perPage, nodeId)
}

export async function getServerConfiguration(uuid: string, nodeId?: string) {
  return remoteGetServerConfiguration(uuid, nodeId)
}

export async function getInstallationScript(uuid: string, nodeId?: string) {
  return remoteGetInstallationScript(uuid, nodeId)
}

export async function findServerAccessibleByUser(username: string, nodeId?: string) {
  const normalized = username.trim().toLowerCase()
  const servers = await remoteListServers(nodeId)
  return servers.find(server => server.identifier.toLowerCase() === normalized || server.uuid.toLowerCase() === normalized)
}
