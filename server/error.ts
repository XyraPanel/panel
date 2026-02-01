import type { H3Event, H3Error } from 'h3'

export default async function errorHandler(
  error: H3Error | Error,
  event: H3Event,
  { defaultHandler: _defaultHandler }: { defaultHandler: (error: H3Error | Error, event: H3Event, opts?: { silent?: boolean; json?: boolean }) => Promise<{ status: number; statusText?: string; headers: Record<string, string>; body: string | Record<string, unknown> }> }
) {
  const url = event.node.req.url || ''
  const path = event.path || url.split('?')[0] || ''
  const isApiRoute = path.startsWith('/api/') || url.startsWith('/api/')
  
  const isH3Error = (e: H3Error | Error): e is H3Error => {
    return 'status' in e
  }

  const h3Error = isH3Error(error) ? error : null
  
  console.error('[Error Handler] Error caught:', {
    path,
    url,
    isApiRoute,
    status: h3Error?.status,
    message: error.message,
    accept: event.node.req.headers.accept,
    errorName: error.name,
    stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    data: h3Error?.data,
  })
  
  if (!isApiRoute) {
    return
  }
  
  const status = h3Error?.status || 500
  const statusText = h3Error?.statusText || 'Internal Server Error'
  const message = error.message || 'An error occurred'
  
  console.log('[Error Handler] Returning JSON for API route:', { path, status, statusText })
  
  // For API routes ALWAYS return JSON - don't rely on defaultHandler
  const body = JSON.stringify({
    error: true,
    url: url,
    status,
    statusText,
    message,
    ...(h3Error?.data ? { data: h3Error.data } : {}),
    ...(process.env.NODE_ENV === 'development' && error.stack ? { 
      stack: error.stack.split('\n').map((line: string) => line.trim()) 
    } : {}),
  }, null, process.env.NODE_ENV === 'development' ? 2 : 0)
  
  return new Response(body, {
    status,
    statusText,
    headers: {
      'Content-Type': 'application/json',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-cache',
    },
  })
}

