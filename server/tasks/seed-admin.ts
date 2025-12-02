import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { useDrizzle, tables, eq, and } from "~~/server/utils/drizzle";
import type { SeedUser } from "#shared/types/seed";

export default defineTask({
  meta: {
    name: "db:seed",
    description: "Run database seed task",
  },
  async run() {
    console.log("Running DB seed task...");
    const db = useDrizzle();

    const users: SeedUser[] = [
      {
        name: "John Doe",
        username: "john",
        email: "user@xyrapanel.com",
        password: "password123",
        avatar: "https://example.com/avatar/john.png",
        rootAdmin: true,
        role: "admin",
        permissions: [
          "admin.users.read",
          "admin.servers.read",
          "admin.nodes.read",
          "admin.locations.read",
          "admin.eggs.read",
          "admin.mounts.read",
          "admin.database-hosts.read",
          "admin.activity.read",
          "admin.settings.read",
        ],
      },
    ];

    const createdUsers: string[] = [];
    const updatedUsers: string[] = [];

    for (const user of users) {
      const existingUser = db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(eq(tables.users.email, user.email))
        .get();

      const hashedPassword = await bcrypt.hash(user.password, 10);
      const [nameFirst, ...nameRest] = user.name.split(" ");
      const nameLast = nameRest.join(" ") || null;
      const timestamp = new Date();

      if (existingUser) {
        db.update(tables.users)
          .set({
            username: user.username,
            displayUsername: user.username,
            email: user.email,
            password: hashedPassword,
            nameFirst,
            nameLast,
            language: "en",
            rootAdmin: user.rootAdmin ?? false,
            role: user.role ?? (user.rootAdmin ? "admin" : "user"),
            image: user.avatar,
            updatedAt: timestamp,
          })
          .where(eq(tables.users.id, existingUser.id))
          .run();

        const existingAccount = db
          .select({ id: tables.accounts.id })
          .from(tables.accounts)
          .where(and(
            eq(tables.accounts.userId, existingUser.id),
            eq(tables.accounts.provider, "credential")
          ))
          .get();

        if (existingAccount) {
          db.update(tables.accounts)
            .set({
              password: hashedPassword,
              providerAccountId: existingUser.id,
              accountId: existingUser.id,
              providerId: "credential",
              updatedAt: timestamp,
            })
            .where(eq(tables.accounts.id, existingAccount.id))
            .run();
        } else {
          const accountId = randomUUID();
          db.insert(tables.accounts)
            .values({
              id: accountId,
              userId: existingUser.id,
              type: "credential",
              provider: "credential",
              providerAccountId: existingUser.id,
              accountId: existingUser.id,
              providerId: "credential",
              password: hashedPassword,
              createdAt: timestamp,
              updatedAt: timestamp,
            })
            .run();
        }

        updatedUsers.push(user.email);
        continue;
      }

      const userId = randomUUID();
      const accountId = randomUUID();
      
      db.insert(tables.users)
        .values({
          id: userId,
          username: user.username,
          displayUsername: user.username,
          email: user.email,
          password: hashedPassword,
          nameFirst,
          nameLast,
          language: "en",
          rootAdmin: user.rootAdmin ?? false,
          role: user.role ?? (user.rootAdmin ? "admin" : "user"),
          image: user.avatar,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();

      db.insert(tables.accounts)
        .values({
          id: accountId,
          userId,
          type: "credential",
          provider: "credential",
          providerAccountId: userId,
          accountId: userId,
          providerId: "credential",
          password: hashedPassword,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();

      createdUsers.push(user.email);
    }

    return {
      result: createdUsers.length
        ? "created"
        : updatedUsers.length
          ? "updated"
          : "skipped",
      created: createdUsers,
      updated: updatedUsers,
    };
  },
});
