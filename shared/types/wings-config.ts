import type { WingsAllocation } from './allocation'
import type { WingsEggConfiguration } from './nest'

export interface WingsServerConfiguration {
  uuid: string
  meta: {
    name: string
    description: string
  }
  suspended: boolean
  invocation: string
  skip_egg_scripts: boolean
  environment: Record<string, string>
  labels: Record<string, string>
  allocations: WingsAllocation
  build: {
    memory_limit: number
    swap: number
    io_weight: number
    cpu_limit: number
    threads: string
    disk_space: number
    oom_disabled: boolean
  }
  crash_detection_enabled: boolean
  mounts: Mount[]
  egg: WingsEggConfiguration
  container: {
    image: string
  }
}

export interface Mount {
  source: string
  target: string
  read_only: boolean
}
