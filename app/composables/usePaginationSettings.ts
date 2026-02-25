export const usePaginationSettings = () => {
  const { data } = useFetch<{ paginationLimit: number }>(
    '/api/settings/pagination',
    {
      key: 'global-pagination-settings',
      default: () => ({ paginationLimit: 25 }),
      server: true,
    },
  );
  
  return computed(() => data.value?.paginationLimit ?? 25);
};

export const createPagination = (page: number, perPage: number, total: number) => ({
  page,
  perPage,
  total,
  totalPages: Math.ceil(total / perPage),
  hasNext: page * perPage < total,
  hasPrev: page > 1,
});

export const createPaginationQuery = (page: number, limit: number) => ({
  page: Math.max(1, page),
  limit: Math.max(10, Math.min(100, limit))
});
