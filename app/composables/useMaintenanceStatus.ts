export function useMaintenanceStatus() {
  return useFetch<{
    maintenanceMode: boolean;
    maintenanceMessage: string;
  }>('/api/maintenance-status', {
    key: 'maintenance-status',
    lazy: true,
    default: () => ({
      maintenanceMode: false,
      maintenanceMessage: '',
    }),
  });
}
