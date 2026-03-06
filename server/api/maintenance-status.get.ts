import { SETTINGS_KEYS, getSetting } from '#server/utils/settings';

defineRouteMeta({
  openAPI: {
    tags: ['System'],
    summary: 'Get maintenance status',
    description:
      'Checks if the panel is currently in maintenance mode and retrieves the related system broadcast message.',
    responses: {
      200: {
        description: 'Successfully retrieved maintenance status',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                maintenanceMode: { type: 'boolean' },
                maintenanceMessage: { type: 'string' },
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
  const maintenanceMode = (await getSetting(SETTINGS_KEYS.MAINTENANCE_MODE)) === 'true';
  const maintenanceMessage = (await getSetting(SETTINGS_KEYS.MAINTENANCE_MESSAGE)) ?? '';

  return {
    maintenanceMode,
    maintenanceMessage,
  };
});
