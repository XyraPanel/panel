import type { H3Event } from 'h3';

export function successResponse<T>(data: T) {
  return { data };
}

export function successResponseWithMeta<T, M>(data: T, meta: M) {
  return { data, meta };
}

export function paginatedResponse<T>(
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  },
) {
  return {
    data,
    meta: {
      pagination,
    },
  };
}

export function createdResponse<T>(event: H3Event, data: T, location?: string) {
  setResponseStatus(event, 201);
  if (location) {
    setResponseHeader(event, 'Location', location);
  }
  return { data };
}

export function noContentResponse(event: H3Event) {
  setResponseStatus(event, 204);
  return null;
}

export type SuccessResponse<T> = { data: T };
export type SuccessResponseWithMeta<T, M> = { data: T; meta: M };
