import { formatAuthToken } from './encryption'
import type { WingsNodeConnection } from '#shared/types/wings'

export interface TransferNotificationPayload {
  serverUuid: string
  destination: {
    baseUrl: string
    token: string
  }
  startOnCompletion?: boolean
}

export function createWingsTransferClient(node: WingsNodeConnection) {
  const baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`

  async function request(
    path: string,
    options: {
      method?: string
      body?: unknown
      headers?: Record<string, string>
    } = {},
  ) {
    const url = `${baseUrl}${path}`
    const authToken = formatAuthToken(node.tokenId, node.tokenSecret)

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers,
    }

    const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED

    if (node.allowInsecure) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }

    const response = await fetch(url, {
      method: options.method || 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    if (node.allowInsecure) {
      if (previousTlsSetting === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      }
      else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting
      }
    }

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Wings transfer error: ${response.status} ${response.statusText} - ${message}`)
    }

    return response.status === 204 ? null : response.json()
  }

  return {
    async notifyTransfer(payload: TransferNotificationPayload) {
      const { serverUuid, destination, startOnCompletion = false } = payload

      return request(`/api/servers/${serverUuid}/transfer`, {
        body: {
          server_id: serverUuid,
          url: destination.baseUrl,
          token: destination.token,
          server: {
            uuid: serverUuid,
            start_on_completion: startOnCompletion,
          },
        },
      })
    },
  }
}
