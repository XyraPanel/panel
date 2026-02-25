import { requireAccountUser } from '#server/utils/security';

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
