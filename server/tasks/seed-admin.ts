import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export default defineTask({
  meta: {
    name: 'seed:admin',
    description: 'Seed the initial admin account',
  },
  async run({ payload }) {
    const db = useDrizzle();

    const email = getString(payload?.email) || process.env.SEED_ADMIN_EMAIL;
    const password = getString(payload?.password) || process.env.SEED_ADMIN_PASSWORD;
    const username = getString(payload?.username) || process.env.SEED_ADMIN_USERNAME || 'admin';
    const name = getString(payload?.name) || process.env.SEED_ADMIN_NAME || 'Admin';

    if (!email || !password) {
      return {
        result: 'skipped',
        reason: 'No email or password provided. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.',
      };
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [nameFirst, ...nameRest] = name.split(' ');
    const nameLast = nameRest.join(' ') || null;
    const timestamp = new Date();

    const existingUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
      columns: { id: true },
    });

    if (existingUser) {
      await db
        .update(tables.users)
        .set({
          username,
          displayUsername: username,
          password: hashedPassword,
          nameFirst,
          nameLast,
          rootAdmin: true,
          role: 'admin',
          updatedAt: timestamp,
        })
        .where(eq(tables.users.id, existingUser.id));

      const existingAccount = await db.query.accounts.findFirst({
        where: (acc, { and, eq }) =>
          and(eq(acc.userId, existingUser.id), eq(acc.provider, 'credential')),
        columns: { id: true },
      });

      if (existingAccount) {
        await db
          .update(tables.accounts)
          .set({ password: hashedPassword, updatedAt: timestamp })
          .where(eq(tables.accounts.id, existingAccount.id));
      } else {
        await db.insert(tables.accounts).values({
          id: randomUUID(),
          userId: existingUser.id,
          type: 'credential',
          provider: 'credential',
          providerAccountId: existingUser.id,
          accountId: existingUser.id,
          providerId: 'credential',
          password: hashedPassword,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      return { result: 'updated', email };
    }

    const userId = randomUUID();
    await db.insert(tables.users).values({
      id: userId,
      username,
      displayUsername: username,
      email,
      password: hashedPassword,
      nameFirst,
      nameLast,
      language: 'en',
      rootAdmin: true,
      role: 'admin',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(tables.accounts).values({
      id: randomUUID(),
      userId,
      type: 'credential',
      provider: 'credential',
      providerAccountId: userId,
      accountId: userId,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return { result: 'created', email };
  },
});
