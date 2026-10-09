export type SystemResourceStatus = 'ready' | 'unavailable'
export type SystemServiceStatus =
  | 'ready'
  | 'degraded'
  | 'starting'
  | 'failed'

export type SystemResources = {
  cpuPercent: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  memoryPercent: number
  diskUsedBytes: number
  diskTotalBytes: number
  diskPercent: number
  status?: SystemResourceStatus
}

export type SystemServiceId =
  | 'sidecar'
  | 'vector_store'
  | 'embedding'
  | 'sqlite'
  | 'background_jobs'

export type SystemServiceStatusRow = {
  id: SystemServiceId
  status: SystemServiceStatus
  detail: string | { running: number; pending: number }
}

export type SystemStatusSnapshot = {
  asOf: number
  resources: SystemResources
  services: SystemServiceStatusRow[]
}

export interface SystemStatusApi {
  getStatus: () => Promise<SystemStatusSnapshot>
}
