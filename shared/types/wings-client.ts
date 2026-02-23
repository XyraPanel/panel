export interface WingsNode {
  id: string;
  fqdn: string;
  scheme: 'http' | 'https';
  daemonListen: number;
  daemonSftp: number;
  daemonBase: string;
  tokenId: string;
  token: string;
}

export interface WingsServerDetails {
  state: string;
  isSuspended: boolean;
  utilization: {
    memory_bytes: number;
    memory_limit_bytes: number;
    cpu_absolute: number;
    network: {
      rx_bytes: number;
      tx_bytes: number;
    };
    uptime: number;
    disk_bytes: number;
  };
}

export interface WingsFileObject {
  name: string;
  mode: string;
  mode_bits: string;
  size: number;
  file?: boolean;
  directory?: boolean;
  symlink?: boolean;
  mimetype: string;
  created: string;
  modified: string;
}

export interface WingsBackup {
  uuid: string;
  name: string;
  ignored_files: string[];
  sha256_hash: string;
  bytes: number;
  created_at: string;
  completed_at: string | null;
}

export interface WingsError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
