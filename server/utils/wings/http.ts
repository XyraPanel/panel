import { type H3Error } from 'h3';
import type { WingsErrorOptions, WingsFetchError, WingsQuery } from '#shared/types/wings';

const NODE_QUERY_KEYS = ['node', 'node_id', 'nodeId'] as const;

function isFetchError(error: unknown): error is WingsFetchError {
  return Boolean(error && typeof error === 'object' && 'response' in error);
}

export function isH3Error(error: unknown): error is H3Error {
  return Boolean(error && typeof error === 'object' && 'status' in error);
}

export function getNodeIdFromQuery(query: WingsQuery): string | undefined {
  for (const key of NODE_QUERY_KEYS) {
    const value = query[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value) && value.length > 0) {
      const candidate = value[0];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }

  return undefined;
}

export function toWingsHttpError(error: unknown, options: WingsErrorOptions = {}) {
  const operation = options.operation ?? 'contact Wings node';

  if (isH3Error(error)) {
    return error;
  }

  if (isFetchError(error)) {
    const status = error.response?.status ?? 502;
    const data = error.data;

    let message: string | undefined;
    if (typeof data === 'object' && data !== null && 'message' in data) {
      const candidate = (data as { message?: unknown }).message;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        message = candidate;
      }
    }

    message = message || `Wings responded with status ${status}.`;

    return createError({
      status,
      message,
      data: {
        nodeId: options.nodeId,
        details: data,
      },
      cause: error,
    });
  }

  if (error instanceof Error) {
    if (error.message === 'No Wings node configured') {
      return createError({
        status: 503,
        message: 'No Wings node configured: Add a Wings node before attempting this operation.',
      });
    }

    if (error.message === 'Multiple Wings nodes configured; specify nodeId') {
      return createError({
        status: 400,
        message: 'Multiple Wings nodes configured: Select a Wings node by providing a node query parameter.',
        data: {
          nodeId: options.nodeId,
        },
      });
    }

    const nodeNotFoundMatch = /^Node\s+(.+)\s+not\s+found$/.exec(error.message);
    if (nodeNotFoundMatch) {
      return createError({
        status: 404,
        message: `Wings node not found: Wings node \u201c${nodeNotFoundMatch[1]}\u201d could not be located.`,
        data: {
          nodeId: nodeNotFoundMatch[1],
        },
      });
    }

    return createError({
      status: 502,
      message: `Wings request failed: Unable to ${operation}.`,
      data: {
        nodeId: options.nodeId,
        details: error.message,
      },
      cause: error,
    });
  }

  return createError({
    status: 500,
    message: `Unexpected Wings error: Unable to ${operation}.`,
    data: {
      nodeId: options.nodeId,
      details: error,
    },
  });
}
