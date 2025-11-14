import { handleCors, type H3CorsOptions, type H3Event, type HTTPMethod } from 'h3'

const DEFAULT_HEADERS = ['authorization', 'content-type', 'x-requested-with']
const DEFAULT_METHODS: HTTPMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
const DEFAULT_MAX_AGE = '86400'

export function ensureCors(event: H3Event, options: H3CorsOptions = {}): boolean {
  const corsOptions: H3CorsOptions = {
    origin: options.origin ?? '*',
    methods: options.methods ?? DEFAULT_METHODS,
    allowHeaders: options.allowHeaders ?? DEFAULT_HEADERS,
    exposeHeaders: options.exposeHeaders,
    maxAge: options.maxAge ?? DEFAULT_MAX_AGE,
    credentials: options.credentials ?? true,
  }

  return handleCors(event, corsOptions)
}
