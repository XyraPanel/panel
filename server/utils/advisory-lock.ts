import { usePool } from '#server/utils/drizzle';

/**
 * Runs `fn` while holding a Postgres session-level advisory lock keyed by `lockName`.
 * Safe across multiple processes/machines (PM2 cluster, multi-instance deploys) since
 * the lock lives in Postgres, not in process memory. If another process already holds
 * the lock, `fn` is skipped and `undefined` is returned.
 */
export async function withAdvisoryLock<T>(
  lockName: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const pool = usePool();
  const client = await pool.connect();

  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [lockName],
    );

    if (!rows[0]?.locked) {
      return undefined;
    }

    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockName]);
    }
  } finally {
    client.release();
  }
}
