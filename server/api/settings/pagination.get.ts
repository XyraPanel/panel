import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';

export default defineEventHandler(async () => {
  const s = await getSettings([SETTINGS_KEYS.PAGINATION_LIMIT]);
  return {
    paginationLimit: parseInt(s[SETTINGS_KEYS.PAGINATION_LIMIT] ?? '25', 10),
  };
});
