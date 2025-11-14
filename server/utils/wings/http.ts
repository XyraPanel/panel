import { createError, type H3Error } from 'h3'

interface FetchError extends Error {
  response?: Response
  data?: unknown
}

interface WingsErrorOptions {
  operation?: string
  nodeId?: string
}

type QueryLike = Record<string, unknown>

const NODE_QUERY_KEYS = ['node', 'node_id', 'nodeId'] as const

function isFetchError(error: unknown): error is FetchError {
  return Boolean(error && typeof error === 'object' && 'response' in error)
}

export function isH3Error(error: unknown): error is H3Error {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error)
}

export function getNodeIdFromQuery(query: QueryLike): string | undefined {
  for (const key of NODE_QUERY_KEYS) {
    const value = query[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }

    if (Array.isArray(value) && value.length > 0) {
      const candidate = value[0]
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }
  }

  return undefined
}

export function toWingsHttpError(error: unknown, options: WingsErrorOptions = {}) {
  const operation = options.operation ?? 'contact Wings node'

  if (isH3Error(error)) {
    return error
  }

  if (isFetchError(error)) {
    const statusCode = error.response?.status ?? 502
    const statusMessage = error.response?.statusText || 'Bad Gateway'
    const data = error.data

    const message = typeof data === 'object' && data !== null && 'message' in data && typeof (data as { message?: unknown }).message === 'string'
      ? (data as { message: string }).message
      : `Wings responded with status ${statusCode}.`

    return createError({
      statusCode,
      statusMessage,
      message,
      data: {
        nodeId: options.nodeId,
        details: data,
      },
      cause: error,
    })
  }

  if (error instanceof Error) {
    if (error.message === 'No Wings node configured') {
      return createError({
        statusCode: 503,
        statusMessage: 'No Wings node configured',
        message: 'Add a Wings node before attempting this operation.',
      })
    }

    if (error.message === 'Multiple Wings nodes configured; specify nodeId') {
      return createError({
        statusCode: 400,
        statusMessage: 'Multiple Wings nodes configured',
        message: 'Select a Wings node by providing a node query parameter.',
        data: {
          nodeId: options.nodeId,
        },
      })
    }

    const nodeNotFoundMatch = /^Node\s+(.+)\s+not\s+found$/.exec(error.message)
    if (nodeNotFoundMatch) {
      return createError({
        statusCode: 404,
        statusMessage: 'Wings node not found',
        message: `Wings node \u201c${nodeNotFoundMatch[1]}\u201d could not be located.`,
        data: {
          nodeId: nodeNotFoundMatch[1],
        },
      })
    }

    return createError({
      statusCode: 502,
      statusMessage: 'Wings request failed',
      message: `Unable to ${operation}.`,
      data: {
        nodeId: options.nodeId,
        details: error.message,
      },
      cause: error,
    })
  }

  return createError({
    statusCode: 500,
    statusMessage: 'Unexpected Wings error',
    message: `Unable to ${operation}.`,
    data: {
      nodeId: options.nodeId,
      details: error,
    },
  })
}
