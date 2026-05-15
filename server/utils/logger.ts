import { createConsola } from 'consola';

/**
 * Standardized Logger
 * Provides structured, environment-aware logging using Consola.
 */

const logger = createConsola({
  level: 3, // Default to info
  formatOptions: {
    colors: true,
    date: true,
  },
}).withTag('panel');

let logLevelCached: number | null = null;

function getLogLevel(): number {
  if (logLevelCached !== null) return logLevelCached;

  try {
    const config = useRuntimeConfig();
    const isDebug = config.debug || config.public?.debug || process.env.DEBUG === 'true';
    // level: 4 = debug, 3 = info/log, 1 = warn, 0 = error
    logLevelCached = isDebug ? 4 : 3;
  } catch {
    logLevelCached = process.env.NODE_ENV === 'development' ? 4 : 3;
  }

  return logLevelCached;
}

export function debugLog(message: string, ...args: unknown[]): void {
  logger.level = getLogLevel();
  logger.info(message, ...args);
}

export function debugError(message: string, ...args: unknown[]): void {
  logger.level = getLogLevel();
  logger.error(message, ...args);
}

export function debugWarn(message: string, ...args: unknown[]): void {
  logger.level = getLogLevel();
  logger.warn(message, ...args);
}

export { logger };
