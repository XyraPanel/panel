import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

interface FileEntry {
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

export default defineEventHandler(async (event): Promise<FileEntry[]> => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)
  if (!user || !user.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const query = getQuery(event)
  const directory = (query.directory as string) || '/'

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const isOwner = server.ownerId === user.id
  const isAdmin = user.role === 'admin'

  if (!isOwner && !isAdmin) {
    const [subuser] = await db.select()
      .from(tables.serverSubusers)
      .where(
        and(
          eq(tables.serverSubusers.serverId, serverId),
          eq(tables.serverSubusers.userId, user.id),
        ),
      )
      .limit(1)

    if (!subuser) {
      throw createError({
        statusCode: 403,
        message: 'You do not have permission to access this server',
      })
    }

    const permissions = JSON.parse(subuser.permissions) as string[]
    const hasFilePermission = permissions.includes('file.read') || permissions.includes('file.*')

    if (!hasFilePermission) {
      throw createError({
        statusCode: 403,
        message: 'You do not have permission to access files',
      })
    }
  }

  if (!server.nodeId) {
    throw createError({
      statusCode: 500,
      message: 'Server has no assigned node',
    })
  }

  const [node] = db.select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId))
    .limit(1)
    .all()

  if (!node) {
    throw createError({
      statusCode: 500,
      message: 'Server node not found',
    })
  }

  try {

    const baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`
    const url = `${baseUrl}/api/servers/${server.uuid}/files/list?directory=${encodeURIComponent(directory)}`

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${node.tokenIdentifier}.${node.tokenSecret}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Wings API error: ${response.status}`)
    }

    const files = await response.json() as FileEntry[]
    return files
  } catch (error) {
    console.error('Wings file list error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to list files',
    })
  }
})
