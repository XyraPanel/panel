import { requirePermission } from '~~/server/utils/permission-middleware'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { recordServerActivity } from '~~/server/utils/server-activity'
import { requireNodeRow, findWingsNode } from '~~/server/utils/wings/nodesStore'
import { generateWingsJWT } from '~~/server/utils/wings/jwt'

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { userId } = await requirePermission(event, 'server.files.upload', serverId)

  try {
    const { server } = await getWingsClientForServer(serverId)
    
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw new Error('No files provided')
    }

    const directory = formData.find(f => f.name === 'directory')?.data?.toString() || '/'
    const fileFields = formData.filter(f => f.name === 'files')

    if (fileFields.length === 0) {
      throw new Error('No files to upload')
    }

    const nodeRow = requireNodeRow(server.nodeId as string)
    const node = findWingsNode(server.nodeId as string)
    if (!node) {
      throw new Error('Node not found')
    }

    const uploadToken = await generateWingsJWT(
      {
        tokenSecret: nodeRow.tokenSecret,
        baseUrl: `http://${nodeRow.fqdn}:${nodeRow.daemonListen}`,
      },
      {
        user: { id: userId, uuid: userId },
        server: { uuid: server.uuid as string },
        expiresIn: 900,
      }
    )

    const uploadForm = new FormData()

    for (const fileField of fileFields) {
      if (!fileField.data) continue
      const fileName = fileField.filename || 'file'
      // @ts-expect-error - Node.js Buffer is compatible
      uploadForm.append('files', new Blob([fileField.data]), fileName)
    }

    const wingsBaseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`
    const uploadUrl = `${wingsBaseUrl}/upload/file?token=${uploadToken}&directory=${encodeURIComponent(directory)}`

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: uploadForm,
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      throw new Error(`Wings upload failed: ${uploadResponse.status} - ${errorText}`)
    }

    await recordServerActivity({
      event,
      actorId: userId,
      action: 'server.file.upload',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: { directory, fileCount: fileFields.length },
    })

    return {
      success: true,
      message: 'Files uploaded successfully',
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to upload files',
    })
  }
})
