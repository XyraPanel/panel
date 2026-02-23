import { useDrizzle } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const sessionUser = accountContext.user;

  const db = useDrizzle();

  const profile = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, sessionUser.id),
    columns: {
      id: true,
      username: true,
      email: true,
      role: true,
    },
  });

  if (!profile) {
    throw createError({ status: 404, statusText: 'User not found' });
  }

  await recordAuditEventFromRequest(event, {
    actor: sessionUser.id,
    actorType: 'user',
    action: 'account.profile.viewed',
    targetType: 'user',
    targetId: sessionUser.id,
  });

  return { data: profile };
});
