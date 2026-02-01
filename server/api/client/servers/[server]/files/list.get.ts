import { getServerWithAccess } from '#server/utils/server-helpers'
import { getWingsClientForServer } from '#server/utils/wings-client'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { requireAccountUser } from '#server/utils/security'

function sanitizeDirectoryPath(value?: string): string {
  if (!value)
    return '/'

  let normalized = value.trim()
  normalized = normalized.replace(/\\/g, '/').replace(/\.\.+/g, '')

  if (!normalized.startsWith('/'))
    normalized = `/${normalized}`

  normalized = normalized.replace(/\/{2,}/g, '/')

  if (normalized.length > 1 && normalized.endsWith('/'))
    normalized = normalized.slice(0, -1)

  return normalized.length === 0 ? '/' : normalized
}

function joinPath(directory: string, name: string): string {
  return directory === '/' ? `/${name}` : `${directory}/${name}`
}

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.read'],
  })

  const query = getQuery(event)
  const directory = sanitizeDirectoryPath(typeof query.directory === 'string' ? query.directory : '/')

  try {
    const { client } = await getWingsClientForServer(server.uuid as string)
    const files = await client.listFiles(server.uuid as string, directory)

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
      }))

    return {
      data: {
        directory,
        entries,
      },
    }
  }
  catch (error) {
    console.error('Failed to list files via Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to list files',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
