import { useDrizzle, tables, eq, inArray } from '#server/utils/drizzle'

export const SETTINGS_KEYS = {
  PANEL_LOCALE: 'app:locale',
  PANEL_TIMEZONE: 'app:timezone',
  BRAND_SHOW_LOGO: 'branding:show_logo',
  BRAND_LOGO_PATH: 'branding:logo_path',

  MAIL_DRIVER: 'mail:mailers:smtp:transport',
  MAIL_SERVICE: 'mail:service',
  MAIL_HOST: 'mail:mailers:smtp:host',
  MAIL_PORT: 'mail:mailers:smtp:port',
  MAIL_USERNAME: 'mail:mailers:smtp:username',
  MAIL_PASSWORD: 'mail:mailers:smtp:password',
  MAIL_ENCRYPTION: 'mail:mailers:smtp:encryption',
  MAIL_FROM_ADDRESS: 'mail:from:address',
  MAIL_FROM_NAME: 'mail:from:name',

  TELEMETRY_ENABLED: 'app:telemetry:enabled',
  DEBUG_MODE: 'app:debug',
  SESSION_TIMEOUT_MINUTES: 'auth:session:timeout_minutes',
  QUEUE_CONCURRENCY: 'queue:concurrency',
  QUEUE_RETRY_LIMIT: 'queue:retry_limit',

  ENFORCE_TWO_FACTOR: 'security:enforce_totp',
  MAINTENANCE_MODE: 'maintenance:enabled',
  MAINTENANCE_MESSAGE: 'maintenance:message',
  ANNOUNCEMENT_ENABLED: 'announcement:enabled',
  ANNOUNCEMENT_MESSAGE: 'announcement:message',
  PAGINATION_LIMIT: 'app:pagination:limit',
} as const

export type SettingKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS]

export function getSetting(key: SettingKey): string | null {
  const db = useDrizzle()

  const result = db
    .select({ value: tables.settings.value })
    .from(tables.settings)
    .where(eq(tables.settings.key, key))
    .get()

  return result?.value ?? null
}

export function getNumericSetting(key: SettingKey, fallback: number): number {
  const value = getSetting(key)
  if (!value)
    return fallback

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0)
    return fallback

  return parsed
}

export function getSettings(keys: SettingKey[]): Record<string, string | null> {
  const db = useDrizzle()

  if (keys.length === 0) {
    return {}
  }

  const results = db
    .select()
    .from(tables.settings)
    .where(inArray(tables.settings.key, keys))
    .all()

  const settingsMap: Record<string, string | null> = {}

  for (const key of keys) {
    const result = results.find(r => r.key === key)
    settingsMap[key] = result?.value ?? null
  }

  return settingsMap
}

export function getAllSettings(): Record<string, string> {
  const db = useDrizzle()

  const results = db
    .select()
    .from(tables.settings)
    .all()

  const settingsMap: Record<string, string> = {}

  for (const result of results) {
    settingsMap[result.key] = result.value
  }

  return settingsMap
}

export function setSetting(key: SettingKey, value: string): void {
  const db = useDrizzle()

  const existing = db
    .select()
    .from(tables.settings)
    .where(eq(tables.settings.key, key))
    .get()

  if (existing) {
    db.update(tables.settings)
      .set({ value })
      .where(eq(tables.settings.key, key))
      .run()
  } else {
    db.insert(tables.settings)
      .values({ key, value })
      .run()
  }
}

export function setSettings(settings: Record<SettingKey, string>): void {
  for (const [key, value] of Object.entries(settings)) {
    setSetting(key as SettingKey, value)
  }
}

export function deleteSetting(key: SettingKey): void {
  const db = useDrizzle()

  db.delete(tables.settings)
    .where(eq(tables.settings.key, key))
    .run()
}

export function getSettingWithDefault(key: SettingKey, defaultValue: string): string {
  return getSetting(key) ?? defaultValue
}
