import type { H3Event } from 'h3'
import { listWingsNodeSummaries } from '~~/server/utils/wings/nodesStore'

export default defineEventHandler((_event: H3Event) => {
  return {
    data: listWingsNodeSummaries(),
  }
})
