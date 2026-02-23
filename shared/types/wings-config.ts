import type { WingsAllocation } from './server';
import type { WingsEggConfiguration } from './nest';

export interface WingsServerConfiguration {
  uuid: string;
  meta: {
    name: string;
    description: string;
  };
  suspended: boolean;
  invocation: string;
  skip_egg_scripts: boolean;
  environment: Record<string, string>;
  labels: Record<string, string>;
  allocations: WingsAllocation;
  build: {
    memory_limit: number;
    swap: number;
    io_weight: number;
    cpu_limit: number;
    threads: string;
    disk_space: number;
    oom_disabled: boolean;
  };
  feature_limits?: {
    databases?: number;
    backups?: number;
    allocations?: number;
  };
  crash_detection_enabled: boolean;
  mounts: Mount[];
  egg: WingsEggConfiguration;
  container: {
    image: string;
    registry?: string;
    username?: string;
    password?: string;
    image_pull_policy?: string;
  };
  process?: {
    stop?: string;
    start?: string;
    autorestart?: boolean;
    stdout?: string;
    stderr?: string;
  };
  services?: Array<{
    type: string;
    name: string;
    options?: Record<string, unknown>;
  }>;
}

export interface Mount {
  source: string;
  target: string;
  read_only: boolean;
}
