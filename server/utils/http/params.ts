import { type H3Event } from 'h3';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function requireRouteParam(
  event: H3Event,
  name: string,
  message?: string,
): Promise<string> {
  const params = await getValidatedRouterParams(event, (input) => {
    if (!isRecord(input)) {
      throw createError({
        status: 400,
        message: message ?? `Missing required route parameter: ${name}`,
      });
    }

    const rawValue = input[name];
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      throw createError({
        status: 400,
        message: message ?? `Missing required route parameter: ${name}`,
      });
    }

    return { [name]: rawValue.trim() };
  });

  const value = params[name];
  if (typeof value !== 'string') {
    throw createError({
      status: 400,
      message: message ?? `Missing required route parameter: ${name}`,
    });
  }

  return value;
}
