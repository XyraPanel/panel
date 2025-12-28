import { getWingsClientForServer, WingsConnectionError, WingsAuthError } from '~~/server/utils/wings-client'
import { recordAuditEvent } from '~~/server/utils/audit'
import { requirePermission } from '~~/server/utils/permission-middleware'

const MAX_FILE_SIZE = 10 * 1024 * 1024

function sanitizeFilePath(path: string): string {
  return path.replace(/\.\./g, '').replace(/\/+/g, '/')
}

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { userId } = await requirePermission(event, 'server.files.write', serverId)

  const body = await readBody<{ file: string; content: string }>(event)
  const { file: rawFile, content } = body
  const file = sanitizeFilePath(rawFile)

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File path is required',
    })
  }

  if (content === undefined || content === null) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Content is required (can be empty string)',
    })
  }

  const contentSize = Buffer.byteLength(content, 'utf8')
  if (contentSize > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 413,
      statusMessage: 'File content too large',
      data: { size: contentSize, maxSize: MAX_FILE_SIZE },
    })
  }

  try {
    const { client, server } = await getWingsClientForServer(serverId)
    
    let hadExistingFile = false
    try {
      await client.getFileContents(server.uuid as string, file)
      hadExistingFile = true
      await client.copyFile(server.uuid as string, file)
    } catch {
      // Backup creation failed, continue with write operation
    }
    
    await client.writeFileContents(server.uuid as string, file, content)

    await recordAuditEvent({
      actor: userId,
      actorType: 'user',
      action: hadExistingFile ? 'server.file.edit' : 'server.file.create',
      targetType: 'server',
      targetId: server.id as string,
      metadata: { 
        file, 
        size: contentSize,
        hadBackup: hadExistingFile,
      },
    })

    return {
      success: true,
      message: `File ${hadExistingFile ? 'updated' : 'created'} successfully`,
      data: {
        file,
        size: contentSize,
        hadBackup: hadExistingFile,
      },
    }
  } catch (error) {
    if (error instanceof WingsAuthError) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Wings authentication failed',
      })
    }
    
    if (error instanceof WingsConnectionError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Wings daemon unavailable',
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to write file',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
