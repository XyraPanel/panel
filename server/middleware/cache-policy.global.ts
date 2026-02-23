type CacheRule = {
  pattern: RegExp;
  maxAge: number;
  staleWhileRevalidate: number;
};

function parseSeconds(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return fallback;
}

export default defineEventHandler((event) => {
  const method = (event.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return;
  }

  const runtimeConfig = useRuntimeConfig();
  const cacheConfig = runtimeConfig.httpCache as {
    enabled?: boolean;
    defaultMaxAge?: number;
    defaultSwr?: number;
    dashboardMaxAge?: number;
    dashboardSwr?: number;
    adminDashboardMaxAge?: number;
    adminDashboardSwr?: number;
    adminNodeMaxAge?: number;
    adminNodeSwr?: number;
  };

  if (!cacheConfig?.enabled) {
    return;
  }

  if (event.node.res.getHeader('Cache-Control')) {
    return;
  }

  const path = event.path || event.node.req.url || '';
  const defaultMaxAge = parseSeconds(cacheConfig.defaultMaxAge, 5);
  const defaultSwr = parseSeconds(cacheConfig.defaultSwr, 15);
  const dashboardMaxAge = parseSeconds(cacheConfig.dashboardMaxAge, 10);
  const dashboardSwr = parseSeconds(cacheConfig.dashboardSwr, 30);
  const adminDashboardMaxAge = parseSeconds(cacheConfig.adminDashboardMaxAge, 10);
  const adminDashboardSwr = parseSeconds(cacheConfig.adminDashboardSwr, 30);
  const adminNodeMaxAge = parseSeconds(cacheConfig.adminNodeMaxAge, defaultMaxAge);
  const adminNodeSwr = parseSeconds(cacheConfig.adminNodeSwr, defaultSwr);

  const cacheRules: CacheRule[] = [
    {
      pattern: /^\/api\/dashboard(?:\/|$|\?)/,
      maxAge: dashboardMaxAge,
      staleWhileRevalidate: dashboardSwr,
    },
    {
      pattern: /^\/api\/admin\/dashboard(?:\/|$|\?)/,
      maxAge: adminDashboardMaxAge,
      staleWhileRevalidate: adminDashboardSwr,
    },
    {
      pattern: /^\/api\/admin\/wings\/nodes\/[^/]+(?:\/|$|\?)/,
      maxAge: adminNodeMaxAge,
      staleWhileRevalidate: adminNodeSwr,
    },
  ];

  const matchingRule = cacheRules.find((rule) => rule.pattern.test(path));
  if (!matchingRule) {
    return;
  }

  setResponseHeader(
    event,
    'Cache-Control',
    `private, max-age=${matchingRule.maxAge}, stale-while-revalidate=${matchingRule.staleWhileRevalidate}`,
  );
  setResponseHeader(event, 'Vary', 'Cookie, Authorization');
});
