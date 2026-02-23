import mysql from 'mysql2/promise';
import type { DatabaseHostRow } from '#server/database/schema';

export interface ProvisionedDatabase {
  dbName: string;
  username: string;
  password: string;
}

function getConnection(host: DatabaseHostRow) {
  return mysql.createConnection({
    host: host.hostname,
    port: host.port,
    user: host.username ?? undefined,
    password: host.password ?? undefined,
    database: host.database ?? 'mysql',
    connectTimeout: 10000,
  });
}

function escapeIdentifier(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`';
}

export async function provisionDatabase(
  host: DatabaseHostRow,
  dbName: string,
  username: string,
  password: string,
  remote: string,
): Promise<void> {
  const conn = await getConnection(host);
  try {
    await conn.execute(`CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(dbName)}`);
    await conn.execute(`CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?`, [
      username,
      remote,
      password,
    ]);
    await conn.execute(`GRANT ALL PRIVILEGES ON ${escapeIdentifier(dbName)}.* TO ?@?`, [
      username,
      remote,
    ]);
    await conn.execute(`FLUSH PRIVILEGES`);
  } finally {
    await conn.end();
  }
}

export async function deprovisionDatabase(
  host: DatabaseHostRow,
  dbName: string,
  username: string,
  remote: string,
): Promise<void> {
  const conn = await getConnection(host);
  try {
    await conn.execute(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)}`);
    await conn.execute(`DROP USER IF EXISTS ?@?`, [username, remote]);
    await conn.execute(`FLUSH PRIVILEGES`);
  } finally {
    await conn.end();
  }
}

export async function rotateUserPassword(
  host: DatabaseHostRow,
  username: string,
  remote: string,
  newPassword: string,
): Promise<void> {
  const conn = await getConnection(host);
  try {
    await conn.execute(`ALTER USER ?@? IDENTIFIED BY ?`, [username, remote, newPassword]);
    await conn.execute(`FLUSH PRIVILEGES`);
  } finally {
    await conn.end();
  }
}

export async function testDatabaseHostConnection(host: DatabaseHostRow): Promise<void> {
  const conn = await getConnection(host);
  await conn.ping();
  await conn.end();
}

export async function getDatabaseHostUsage(host: DatabaseHostRow): Promise<number> {
  const conn = await getConnection(host);
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema','performance_schema','mysql','sys')`,
    );
    return Number(rows[0]?.count ?? 0);
  } finally {
    await conn.end();
  }
}
