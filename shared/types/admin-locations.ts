export interface Location {
  id: string
  short: string
  long: string | null
  createdAt: string
  updatedAt: string
}

export interface LocationWithNodeCount extends Location {
  nodeCount: number
}

export interface CreateLocationPayload {
  short: string
  long?: string
}

export interface UpdateLocationPayload {
  short?: string
  long?: string
}
