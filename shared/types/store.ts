import type { AdminActivityEntry, DashboardResponse } from './admin';
import type { ServerListEntry } from './server';

export interface ServersStoreState {
  servers: ServerListEntry[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
}

export type AdminDashboardStoreState = DashboardResponse & {
  loading: boolean;
  ready: boolean;
  error: string | null;
};

export interface AccountActivityStoreState {
  items: AdminActivityEntry[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
}
