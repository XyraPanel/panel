import { createError, getValidatedRouterParams, type H3Event } from 'h3';

export async function requireRouteParam(
  event: H3Event,
  name: string,
  message?: string,
): Promise<string> {
  const params = await getValidatedRouterParams(event, (input) => {
    const value = (input as Record<string, unknown>)[name];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw createError({
        status: 400,
        statusText: 'Bad Request',
        message: message ?? `Missing required route parameter: ${name}`,
      });
    }

    return { [name]: value.trim() };
  });

  return params[name] as string;
}
