import { z } from 'zod'
import type { H3Event } from 'h3'

export async function validateBody<T extends z.ZodType>(
  event: H3Event,
  schema: T,
): Promise<z.infer<T>> {
  const body = await readBody(event)

  const result = schema.safeParse(body)

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }))

    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: { errors },
    })
  }

  return result.data
}

export function validateQuery<T extends z.ZodType>(
  event: H3Event,
  schema: T,
): z.infer<T> {
  const query = getQuery(event)

  const result = schema.safeParse(query)

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }))

    throw createError({
      statusCode: 400,
      message: 'Invalid query parameters',
      data: { errors },
    })
  }

  return result.data
}

export function validateParams<T extends z.ZodType>(
  event: H3Event,
  schema: T,
): z.infer<T> {
  const params = event.context.params || {}

  const result = schema.safeParse(params)

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }))

    throw createError({
      statusCode: 400,
      message: 'Invalid route parameters',
      data: { errors },
    })
  }

  return result.data
}

export const commonSchemas = {

  uuid: z.string().uuid('Invalid UUID format'),

  positiveInt: z.number().int().positive('Must be a positive integer'),

  nonEmptyString: z.string().min(1, 'Cannot be empty'),

  email: z.string().email('Invalid email format'),

  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),

  sort: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
}
