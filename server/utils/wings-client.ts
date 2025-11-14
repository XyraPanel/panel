export interface WingsNode {
  id: string
  fqdn: string
  scheme: 'http' | 'https'
  daemonListen: number
  daemonSftp: number
  daemonBase: string
  tokenId: string
  token: string
}

export interface WingsServerDetails {
  state: string
  isSuspended: boolean
  utilization: {
    memory_bytes: number
    memory_limit_bytes: number
    cpu_absolute: number
    network: {
      rx_bytes: number
      tx_bytes: number
    }
    uptime: number
    disk_bytes: number
  }
}

export interface WingsFileObject {
  name: string
  mode: string
  mode_bits: string
  size: number
  is_file: boolean
  is_symlink: boolean
  mimetype: string
  created_at: string
  modified_at: string
}

export interface WingsBackup {
  uuid: string
  name: string
  ignored_files: string[]
  sha256_hash: string
  bytes: number
  created_at: string
  completed_at: string | null
}

export class WingsClient {
  private baseUrl: string
  private token: string

  constructor(node: WingsNode) {
    this.baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`
    this.token = `Bearer ${node.tokenId}.${node.token}`
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.token,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error')
      throw new Error(`Wings request failed: ${response.status} - ${error}`)
    }

    if (response.status === 204) {
      return {} as T
    }

    return response.json()
  }

  async getServerDetails(serverUuid: string): Promise<WingsServerDetails> {
    return this.request<WingsServerDetails>(`/api/servers/${serverUuid}`)
  }

  async sendPowerAction(
    serverUuid: string,
    action: 'start' | 'stop' | 'restart' | 'kill'
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/power`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    })
  }

  async sendCommand(serverUuid: string, command: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    })
  }

  async getServerResources(serverUuid: string): Promise<WingsServerDetails> {
    return this.request<WingsServerDetails>(`/api/servers/${serverUuid}`)
  }

  async listFiles(
    serverUuid: string,
    directory: string = '/'
  ): Promise<WingsFileObject[]> {
    const params = new URLSearchParams({ directory })
    return this.request<WingsFileObject[]>(
      `/api/servers/${serverUuid}/files/list?${params}`
    )
  }

  async getFileContents(
    serverUuid: string,
    filePath: string
  ): Promise<string> {
    const params = new URLSearchParams({ file: filePath })
    const response = await fetch(
      `${this.baseUrl}/api/servers/${serverUuid}/files/contents?${params}`,
      {
        headers: {
          'Authorization': this.token,
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status}`)
    }

    return response.text()
  }

  async writeFileContents(
    serverUuid: string,
    filePath: string,
    content: string
  ): Promise<void> {
    const params = new URLSearchParams({ file: filePath })
    await fetch(
      `${this.baseUrl}/api/servers/${serverUuid}/files/write?${params}`,
      {
        method: 'POST',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'text/plain',
        },
        body: content,
      }
    )
  }

  async deleteFiles(
    serverUuid: string,
    root: string,
    files: string[]
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/delete`, {
      method: 'POST',
      body: JSON.stringify({ root, files }),
    })
  }

  async renameFile(
    serverUuid: string,
    root: string,
    files: Array<{ from: string; to: string }>
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/rename`, {
      method: 'PUT',
      body: JSON.stringify({ root, files }),
    })
  }

  async copyFile(
    serverUuid: string,
    location: string
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/copy`, {
      method: 'POST',
      body: JSON.stringify({ location }),
    })
  }

  async createDirectory(
    serverUuid: string,
    root: string,
    name: string
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/create-directory`, {
      method: 'POST',
      body: JSON.stringify({ root, name }),
    })
  }

  async compressFiles(
    serverUuid: string,
    root: string,
    files: string[]
  ): Promise<{ file: string }> {
    return this.request<{ file: string }>(
      `/api/servers/${serverUuid}/files/compress`,
      {
        method: 'POST',
        body: JSON.stringify({ root, files }),
      }
    )
  }

  async decompressFile(
    serverUuid: string,
    root: string,
    file: string
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/decompress`, {
      method: 'POST',
      body: JSON.stringify({ root, file }),
    })
  }

  async chmodFiles(
    serverUuid: string,
    root: string,
    files: Array<{ file: string; mode: string }>
  ): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/files/chmod`, {
      method: 'POST',
      body: JSON.stringify({ root, files }),
    })
  }

  async pullFile(
    serverUuid: string,
    url: string,
    directory: string,
    filename?: string,
    useHeader?: boolean,
    foreground?: boolean
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
    })
  }

  getFileDownloadUrl(serverUuid: string, filePath: string): string {
    const params = new URLSearchParams({ file: filePath })
    return `${this.baseUrl}/api/servers/${serverUuid}/files/download?${params}`
  }

  async getFileUploadUrl(serverUuid: string): Promise<string> {
    const response = await this.request<{ url: string }>(
      `/api/servers/${serverUuid}/files/upload`
    )
    return response.url
  }

  async listBackups(serverUuid: string): Promise<WingsBackup[]> {
    return this.request<WingsBackup[]>(`/api/servers/${serverUuid}/backups`)
  }

  async createBackup(
    serverUuid: string,
    name?: string,
    ignored?: string
  ): Promise<WingsBackup> {
    return this.request<WingsBackup>(`/api/servers/${serverUuid}/backups`, {
      method: 'POST',
      body: JSON.stringify({ name, ignored }),
    })
  }

  async deleteBackup(serverUuid: string, backupUuid: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/backups/${backupUuid}`, {
      method: 'DELETE',
    })
  }

  async restoreBackup(
    serverUuid: string,
    backupUuid: string,
    truncate: boolean = false
  ): Promise<void> {
    await this.request(
      `/api/servers/${serverUuid}/backups/${backupUuid}/restore`,
      {
        method: 'POST',
        body: JSON.stringify({ truncate }),
      }
    )
  }

  getBackupDownloadUrl(serverUuid: string, backupUuid: string): string {
    return `${this.baseUrl}/api/servers/${serverUuid}/backups/${backupUuid}/download`
  }

  async createServer(serverUuid: string, config: Record<string, unknown>): Promise<void> {
    await this.request(`/api/servers/${serverUuid}`, {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  async updateServer(serverUuid: string, config: Record<string, unknown>): Promise<void> {
    await this.request(`/api/servers/${serverUuid}`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    })
  }

  async deleteServer(serverUuid: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}`, {
      method: 'DELETE',
    })
  }

  async reinstallServer(serverUuid: string): Promise<void> {
    await this.request(`/api/servers/${serverUuid}/reinstall`, {
      method: 'POST',
    })
  }

  async getWebSocketToken(serverUuid: string): Promise<{ token: string; socket: string }> {
    return this.request<{ token: string; socket: string }>(
      `/api/servers/${serverUuid}/ws`
    )
  }
}

export function getWingsClient(node: WingsNode): WingsClient {
  return new WingsClient(node)
}

export async function getWingsClientForServer(
  serverUuid: string
): Promise<{ client: WingsClient; server: Record<string, unknown> }> {
  const { useDrizzle, tables, eq } = await import('./drizzle')
  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, serverUuid))
    .get()

  if (!server) {
    throw new Error('Server not found')
  }

  const node = db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId!))
    .get()

  if (!node) {
    throw new Error('Node not found')
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
  }

  return {
    client: getWingsClient(wingsNode),
    server,
  }
}
