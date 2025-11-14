import { createError, getQuery } from 'h3'
import { getServerSession } from '#auth'

import { listWingsNodes } from '~~/server/utils/wings/nodesStore'
import { remoteListServers } from '~~/server/utils/wings/registry'
import { toWingsHttpError } from '~~/server/utils/wings/http'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

import type { ServerListEntry, ServersResponse } from '#shared/types/servers'

export default defineEventHandler(async (event): Promise<ServersResponse> => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const scope = typeof query.scope === 'string' ? query.scope : 'own'
  const includeAll = scope === 'all'

  if (includeAll && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const nodes = listWingsNodes()
  const records: ServerListEntry[] = []

  for (const node of nodes) {
    try {
      const servers = await remoteListServers(node.id)

      for (const server of servers) {
        const extended = server as unknown as Record<string, unknown>

        records.push({
          uuid: server.uuid,
          identifier: server.identifier,
          name: server.name,
          nodeId: node.id,
          nodeName: node.name,
          description: typeof extended.description === 'string' ? extended.description : null,
          limits: typeof extended.limits === 'object' && extended.limits !== null ? extended.limits as Record<string, unknown> : null,
          featureLimits: typeof extended.feature_limits === 'object' && extended.feature_limits !== null ? extended.feature_limits as Record<string, unknown> : null,
          status: 'unknown',
          ownership: includeAll ? 'shared' : 'mine',
        })
      }
    }
    catch (error) {
      throw toWingsHttpError(error, { operation: 'list Wings servers', nodeId: node.id })
    }
  }

  return {
    data: records,
    generatedAt: new Date().toISOString(),
  }
})
