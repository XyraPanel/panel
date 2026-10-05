import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Get basic account identity',
    description: 'Returns a minimal identity payload for the authenticated account.',
    responses: {
      '200': {
        description: 'Account identity',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    username: { type: 'string', nullable: true },
                    email: { type: 'string', nullable: true },
                    name: { type: 'string', nullable: true },
                    role: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);

  return {
    user: {
      id: user.id,
      username: user.username ?? null,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role ?? null,
    },
  };
});
