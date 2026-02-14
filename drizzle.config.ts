import { defineConfig } from "drizzle-kit";

const defaultSqliteUrl = "file:./data/XyraPanel.sqlite";
const rawDatabaseUrl = process.env.DATABASE_URL || defaultSqliteUrl;
const resolvedDialect = (process.env.DB_DIALECT ?? "sqlite").toLowerCase();
const isPostgres = resolvedDialect === "postgresql" || resolvedDialect === "postgres";

function resolveDatabaseUrl() {
  if (isPostgres) {
    if (!rawDatabaseUrl) {
      throw new Error("DATABASE_URL is required when DB_DIALECT=postgresql");
    }
    return rawDatabaseUrl;
  }

  return rawDatabaseUrl || defaultSqliteUrl;
}

export default defineConfig({
  dialect: isPostgres ? "postgresql" : "sqlite",
  schema: "./server/database/schema.ts",
  out: "./server/database/migrations",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
