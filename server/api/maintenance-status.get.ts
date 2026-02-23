import { SETTINGS_KEYS, getSetting } from '#server/utils/settings';

export default defineEventHandler(async () => {
  const maintenanceMode = (await getSetting(SETTINGS_KEYS.MAINTENANCE_MODE)) === 'true';
  const maintenanceMessage = (await getSetting(SETTINGS_KEYS.MAINTENANCE_MESSAGE)) ?? '';

  return {
    maintenanceMode,
    maintenanceMessage,
  };
});
