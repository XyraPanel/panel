import type { H3Event } from 'h3'
import { consoleBaseMessageSchema, consoleCommandPayloadSchema } from '#shared/schema/server/console'
import { getWingsClientForServer } from '#server/utils/wings-client'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { getServerSession } from '#server/utils/session'
import { resolveSessionUser } from '#server/utils/auth/sessionUser'
import { permissionManager } from '#server/utils/permission-manager'
import { recordAuditEvent } from '#server/utils/audit'

const connections = new Map<string, {
  serverId: string
  serverUuid: string
  userId: string
  authenticated: boolean
}>()

export default defineWebSocketHandler({
  async open(peer) {
    console.log('WebSocket console connection opened:', peer.id)
  },

  async message(peer, message) {
    try {
      const parsed = consoleBaseMessageSchema.safeParse(JSON.parse(message.text()))
      if (!parsed.success) {
        peer.send(JSON.stringify({
          type: 'error',
          message: 'Invalid payload',
          details: parsed.error.flatten(),
        }))
        return
      }

      const { type, serverId, token, payload } = parsed.data

      if (!serverId) {
        peer.send(JSON.stringify({
          type: 'error',
          message: 'Server ID is required'
        }))
        return
      }

      const db = useDrizzle()
      const server = await db
        .select()
        .from(tables.servers)
        .where(eq(tables.servers.id, serverId))
        .get()

      if (!server) {
        peer.send(JSON.stringify({
          type: 'error',
          message: 'Server not found'
        }))
        return
      }

      const { client } = await getWingsClientForServer(server.uuid)

      switch (type) {
        case 'auth': {
          if (!token) {
            peer.send(JSON.stringify({
              type: 'auth_error',
              message: 'Session token is required',
            }))
            return
          }

          try {
            const mockEvent = {
              node: {
                req: {
                  headers: {
                    authorization: `Bearer ${token}`,
                    cookie: token,
                  },
                },
              },
            } as H3Event

            const session = await getServerSession(mockEvent)
            const user = resolveSessionUser(session)
            
            if (!user?.id) {
              peer.send(JSON.stringify({
                type: 'auth_error',
                message: 'Invalid session token',
              }))
              return
            }

            const permissionCheck = await permissionManager.checkPermission(user.id, 'server.console', serverId)
            if (!permissionCheck.hasPermission) {
              peer.send(JSON.stringify({
                type: 'auth_error',
                message: `Insufficient permissions: ${permissionCheck.reason}`,
              }))
              return
            }

            connections.set(peer.id, {
              serverId,
              serverUuid: server.uuid,
              userId: user.id,
              authenticated: true,
            })

            peer.send(JSON.stringify({
              type: 'auth_success',
              data: { 
                serverUuid: server.uuid,
                userId: user.id,
              },
            }))

          } catch (error) {
            console.error('WebSocket auth error:', error)
            peer.send(JSON.stringify({
              type: 'auth_error',
              message: 'Authentication failed',
            }))
          }
          break
        }

        case 'command': {
          const connection = connections.get(peer.id)
          if (!connection?.authenticated) {
            peer.send(JSON.stringify({
              type: 'error',
              message: 'Not authenticated',
            }))
            return
          }

          const payloadParse = consoleCommandPayloadSchema.safeParse(payload)
          if (!payloadParse.success) {
            peer.send(JSON.stringify({
              type: 'command_error',
              message: 'Invalid command payload',
              details: payloadParse.error.flatten(),
            }))
            return
          }

          try {
            await client.sendCommand(server.uuid, payloadParse.data.command)

            await recordAuditEvent({
              actor: connection.userId,
              actorType: 'user',
              action: 'server.console.command',
              targetType: 'server',
              targetId: connection.serverId,
              metadata: {
                serverUuid: connection.serverUuid,
                command: payloadParse.data.command,
                source: 'ws_console',
              },
            })

            peer.send(JSON.stringify({
              type: 'command_sent',
              data: { command: payloadParse.data.command },
            }))
          } catch (error) {
            peer.send(JSON.stringify({
              type: 'command_error',
              message: error instanceof Error ? error.message : 'Command failed',
            }))
          }
          break
        }

        case 'status': {
          const statusConnection = connections.get(peer.id)
          if (!statusConnection?.authenticated) {
            peer.send(JSON.stringify({
              type: 'error',
              message: 'Not authenticated',
            }))
            return
          }

          try {
            const details = await client.getServerDetails(server.uuid)
            peer.send(JSON.stringify({
              type: 'status_data',
              data: { state: details.state, isSuspended: details.isSuspended },
            }))
          } catch (error) {
            peer.send(JSON.stringify({
              type: 'status_error',
              message: error instanceof Error ? error.message : 'Failed to get status',
            }))
          }
          break
        }

        default:
          peer.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${type}`,
          }))
      }

    } catch (error) {
      console.error('WebSocket message error:', error)
      peer.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
      }))
    }
  },

  async close(peer) {
    console.log('WebSocket console connection closed:', peer.id)
    connections.delete(peer.id)
  },

  async error(peer, error) {
    console.error('WebSocket console error:', error)
    connections.delete(peer.id)
    peer.send(JSON.stringify({
      type: 'error',
      message: 'WebSocket error occurred',
    }))
  }
})
