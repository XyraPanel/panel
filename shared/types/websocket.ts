import type { ServerState } from './server';

export interface ServerEventDetails {
  event: string;
  message?: string;
  raw?: string;
  timestamp: number;
}

export interface WingsStatsPayload {
  memory_bytes?: number;
  memory_limit_bytes?: number;
  cpu_absolute?: number;
  disk_bytes?: number;
  memory?: number;
  memory_limit?: number;
  cpu?: number;
  disk?: number;
  network?: {
    rx_bytes?: number;
    tx_bytes?: number;
  };
  network_rx_bytes?: number;
  network_tx_bytes?: number;
  uptime?: number;
  state?: string;
  status?: string;
}

export interface WebSocketMessage {
  event: string;
  args?: unknown[];
}

export interface ConsoleOutputMessage extends WebSocketMessage {
  event: 'console output';
  args: [string];
}

export interface StatusMessage extends WebSocketMessage {
  event: 'status';
  args: [ServerState];
}

export interface StatsMessage extends WebSocketMessage {
  event: 'stats';
  args: [WingsStatsPayload];
}

export interface TokenExpiringMessage extends WebSocketMessage {
  event: 'token expiring';
}

export interface TokenExpiredMessage extends WebSocketMessage {
  event: 'token expired';
}

export interface DaemonErrorMessage extends WebSocketMessage {
  event: 'daemon error';
  args: [string];
}

export interface InstallStartedMessage extends WebSocketMessage {
  event: 'install started';
}

export interface InstallCompletedMessage extends WebSocketMessage {
  event: 'install completed';
}

export interface BackupCompletedMessage extends WebSocketMessage {
  event: 'backup completed';
  args: [{ uuid: string }];
}

export interface TransferStatusMessage extends WebSocketMessage {
  event: 'transfer status';
  args: [string];
}
