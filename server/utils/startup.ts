import { eq } from 'drizzle-orm';
import type { ServerStartupVariable } from '#shared/types/server';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';

export async function listServerStartupVariables(
  serverId: string,
): Promise<ServerStartupVariable[]> {
  const db = useDrizzle();

  const variables = await db
    .select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, serverId))
    .orderBy(tables.serverStartupEnv.key);

  return variables.map((row) => ({
    id: row.id,
    serverId: row.serverId,
    key: row.key,
    value: row.value,
    description: row.description,
    isEditable: row.isEditable,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}
