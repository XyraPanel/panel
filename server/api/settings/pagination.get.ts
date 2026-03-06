import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';

defineRouteMeta({
  openAPI: {
    tags: ['System'],
    summary: 'Get pagination settings',
    description: 'Retrieves current system-wide pagination configuration, such as the default items per page.',
    responses: {
      200: {
        description: 'Successfully retrieved pagination settings',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                paginationLimit: { type: 'integer' },
              },
            },
          },
        },
      },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async () => {
  const s = await getSettings([SETTINGS_KEYS.PAGINATION_LIMIT]);
  return {
    paginationLimit: parseInt(s[SETTINGS_KEYS.PAGINATION_LIMIT] ?? '25', 10),
  };
});
