import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Get account identity',
    description: 'Retrieves core identity data for the currently authenticated user.',
    responses: {
      200: {
        description: 'Successfully retrieved internal user identity',
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
                    email: { type: 'string', format: 'email', nullable: true },
                    name: { type: 'string', nullable: true },
                    role: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
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
