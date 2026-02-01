import { type H3Event } from 'h3'
import { requireAdmin } from '#server/utils/security'
import { findWingsNode, ensureNodeHasToken, requireNodeRow } from '#server/utils/wings/nodesStore'
import { decryptToken } from '#server/utils/wings/encryption'
import { recordAuditEventFromRequest } from '#server/utils/audit'

function formatCombinedToken(identifier: string, secret: string): string {
  return `${identifier}.${secret}`
}

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event)

  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const existing = findWingsNode(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Node not found' })
  }

  try {
    ensureNodeHasToken(id)
    const row = requireNodeRow(id)

    if (!row.tokenSecret || row.tokenSecret.trim().length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Node token error',
        message: `Node ${id} does not have a token secret. Please regenerate the node token.`,
      })
    }

    if (!row.tokenIdentifier || row.tokenIdentifier.trim().length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Node token error',
        message: `Node ${id} does not have a token identifier. Please regenerate the node token.`,
      })
    }

    let plainSecret: string
    try {
      plainSecret = decryptToken(row.tokenSecret)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw createError({
        statusCode: 500,
        statusMessage: 'Token decryption failed',
        message: `Failed to decrypt token for node ${id}: ${errorMessage}. Ensure WINGS_ENCRYPTION_KEY or NUXT_SESSION_PASSWORD is set.`,
      })
    }

    if (!plainSecret || plainSecret.trim().length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Node token error',
        message: `Node ${id} has an empty decrypted token. Please regenerate the node token.`,
      })
    }

    const deploymentToken = formatCombinedToken(row.tokenIdentifier, plainSecret)

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.node.token.viewed',
      targetType: 'node',
      targetId: id,
      metadata: {
        nodeName: existing.name,
      },
    })

    return {
      data: {
        node: id,
        token: deploymentToken,
      },
    }
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    
    const message = error instanceof Error ? error.message : 'Failed to issue token'
    throw createError({ 
      statusCode: 500, 
      statusMessage: message,
      message: `Failed to generate deployment token: ${message}`,
    })
  }
})
