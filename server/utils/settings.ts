import { useDrizzle, tables, eq } from '#server/utils/drizzle';

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
} as const;

export type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

export async function getSetting(key: SettingKey): Promise<string | null> {
  const db = useDrizzle();
  const result = await db.query.settings.findFirst({
    where: (s, { eq }) => eq(s.key, key),
    columns: { value: true },
  });
  return result?.value ?? null;
}

export async function getNumericSetting(key: SettingKey, fallback: number): Promise<number> {
  const value = await getSetting(key);
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;

  return parsed;
}

export async function getSettings(keys: SettingKey[]): Promise<Record<string, string | null>> {
  if (keys.length === 0) return {};
  const db = useDrizzle();
  const results = await db.query.settings.findMany({
    where: (s, { inArray }) => inArray(s.key, keys),
  });

  const settingsMap: Record<string, string | null> = {};
  for (const key of keys) {
    const result = results.find((r) => r.key === key);
    settingsMap[key] = result?.value ?? null;
  }
  return settingsMap;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = useDrizzle();
  const results = await db.query.settings.findMany();
  const settingsMap: Record<string, string> = {};
  for (const result of results) {
    settingsMap[result.key] = result.value;
  }
  return settingsMap;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  const db = useDrizzle();
  await db
    .insert(tables.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: tables.settings.key, set: { value } });
}

export async function setSettings(settings: Record<SettingKey, string>): Promise<void> {
  await Promise.all(
    Object.entries(settings).map(([key, value]) => setSetting(key as SettingKey, value)),
  );
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  const db = useDrizzle();
  await db.delete(tables.settings).where(eq(tables.settings.key, key));
}

export async function getSettingWithDefault(
  key: SettingKey,
  defaultValue: string,
): Promise<string> {
  return (await getSetting(key)) ?? defaultValue;
}
