/**
 * Logger utility for conditional debug logging
 * Only logs when debug mode is enabled in runtime config
 */

let debugEnabled: boolean | null = null;

function getDebugEnabled(): boolean {
  if (debugEnabled !== null) {
    return debugEnabled;
  }

  try {
    const config = useRuntimeConfig();
    debugEnabled = config.debug === true || config.public?.debug === true;
  } catch {
    debugEnabled =
      process.env.DEBUG === 'true' ||
      process.env.NUXT_DEBUG === 'true' ||
      process.env.NODE_ENV === 'development';
  }

  return debugEnabled;
}

export function debugLog(...args: unknown[]): void {
  if (getDebugEnabled()) {
    console.log(...args);
  }
}

export function debugError(...args: unknown[]): void {
  if (getDebugEnabled()) {
    console.error(...args);
  }
}

export function debugWarn(...args: unknown[]): void {
  if (getDebugEnabled()) {
    console.warn(...args);
  }
}
