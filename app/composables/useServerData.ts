export const useServerData = (serverId: string) => {
  const {
    data: serverMeta,
    pending: metaPending,
    error: metaError,
  } = useFetch<any>(`/api/client/servers/${serverId}/meta`, {
    key: `server-${serverId}-meta`,
    pick: ['data'],
    server: true,
  });

  const {
    data: serverStats,
    pending: statsPending,
    refresh: refreshStats,
  } = useLazyFetch<any>(`/api/client/servers/${serverId}/status`, {
    key: `server-${serverId}-stats`,
    server: false,
  });

  const {
    data: serverResources,
    pending: resourcesPending,
    refresh: refreshResources,
  } = useLazyFetch<any>(`/api/client/servers/${serverId}/resources`, {
    key: `server-${serverId}-resources`,
    server: false,
  });

  const server = computed(() => serverMeta.value?.data);
  const stats = computed(() => serverStats.value);
  const resources = computed(() => serverResources.value);

  const refreshAll = async () => {
    await Promise.all([refreshStats?.(), refreshResources?.()]);
  };

  return {
    server,
    stats,
    resources,
    metaPending,
    statsPending,
    resourcesPending,
    metaError,
    refreshStats,
    refreshResources,
    refreshAll,
  };
};

export const useServerInfo = (serverId: string) => {
  const { server, metaPending, metaError } = useServerData(serverId);

  return {
    server,
    loading: metaPending,
    error: metaError,
  };
};
