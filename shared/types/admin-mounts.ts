
export interface AdminMount {
  id: string
  uuid: string
  name: string
  description: string | null
  source: string
  target: string
  readOnly: boolean
  userMountable: boolean
  createdAt: string
  updatedAt: string
}

export interface MountWithRelations extends AdminMount {
  eggs: string[]
  nodes: string[]
  servers: string[]
}

export interface CreateMountPayload {
  name: string
  description?: string
  source: string
  target: string
  readOnly?: boolean
  userMountable?: boolean
  eggs?: string[]
  nodes?: string[]
}

export interface UpdateMountPayload {
  name?: string
  description?: string
  source?: string
  target?: string
  readOnly?: boolean
  userMountable?: boolean
  eggs?: string[]
  nodes?: string[]
}
