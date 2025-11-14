import type { Nest, Egg, EggVariable } from './nest'

export interface NestWithEggCount extends Nest {
  eggCount: number
}

export interface CreateNestPayload {
  author: string
  name: string
  description?: string
}

export interface UpdateNestPayload {
  author?: string
  name?: string
  description?: string
}

export interface EggWithVariables extends Egg {
  variables: EggVariable[]
}

export interface CreateEggPayload {
  nestId: string
  author: string
  name: string
  description?: string
  dockerImage: string
  dockerImages?: string[]
  startup: string
  configFiles?: Record<string, unknown>
  configStartup?: Record<string, unknown>
  configStop?: string
  configLogs?: Record<string, unknown>
  scriptContainer?: string
  scriptEntry?: string
  scriptInstall?: string
  copyScriptFrom?: string
}

export interface UpdateEggPayload {
  author?: string
  name?: string
  description?: string
  dockerImage?: string
  dockerImages?: string[]
  startup?: string
  configFiles?: Record<string, unknown>
  configStartup?: Record<string, unknown>
  configStop?: string
  configLogs?: Record<string, unknown>
  scriptContainer?: string
  scriptEntry?: string
  scriptInstall?: string
  copyScriptFrom?: string
}

export interface CreateEggVariablePayload {
  eggId: string
  name: string
  description?: string
  envVariable: string
  defaultValue?: string
  userViewable?: boolean
  userEditable?: boolean
  rules?: string
}

export interface UpdateEggVariablePayload {
  name?: string
  description?: string
  envVariable?: string
  defaultValue?: string
  userViewable?: boolean
  userEditable?: boolean
  rules?: string
}
