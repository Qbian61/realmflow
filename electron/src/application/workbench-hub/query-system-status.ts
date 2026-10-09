import type { SidecarStatus } from '../../../../shared/types'
import type {
  SystemResources,
  SystemServiceStatus,
  SystemStatusSnapshot
} from '../../../../shared/system-status'
import type { KnowledgeRuntimeHealth } from '../knowledge/knowledge-runtime-health-service'

type BackgroundJobCounts = { running: number; pending: number }

type Dependencies = {
  resources: { sample: () => Promise<SystemResources> }
  sidecar: { getStatus: () => SidecarStatus }
  knowledge: { get: () => Promise<KnowledgeRuntimeHealth> }
  sqlite: { check: () => Promise<void> }
  backgroundJobs: { count: () => Promise<BackgroundJobCounts> }
  now?: () => number
}

const EMPTY_RESOURCES: SystemResources = {
  cpuPercent: 0,
  memoryUsedBytes: 0,
  memoryTotalBytes: 0,
  memoryPercent: 0,
  diskUsedBytes: 0,
  diskTotalBytes: 0,
  diskPercent: 0,
  status: 'unavailable'
}

export class QuerySystemStatus {
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async execute(): Promise<SystemStatusSnapshot> {
    const [resources, sidecar, knowledge, sqlite, backgroundJobs] =
      await Promise.allSettled([
        this.dependencies.resources.sample(),
        Promise.resolve().then(() => this.dependencies.sidecar.getStatus()),
        this.dependencies.knowledge.get(),
        this.dependencies.sqlite.check(),
        this.dependencies.backgroundJobs.count()
      ])
    const knowledgeValue =
      knowledge.status === 'fulfilled' ? knowledge.value : undefined

    return {
      asOf: this.now(),
      resources:
        resources.status === 'fulfilled'
          ? { ...resources.value, status: 'ready' }
          : { ...EMPTY_RESOURCES },
      services: [
        {
          id: 'sidecar',
          status:
            sidecar.status === 'fulfilled'
              ? mapSidecarStatus(sidecar.value)
              : 'failed',
          detail:
            sidecar.status === 'fulfilled'
              ? sidecar.value
              : 'probe_failed'
        },
        {
          id: 'vector_store',
          status:
            knowledgeValue?.components.vectorStore === 'ready'
              ? 'ready'
              : 'degraded',
          detail:
            knowledgeValue?.components.vectorStore ?? 'probe_failed'
        },
        {
          id: 'embedding',
          status:
            knowledgeValue?.components.embeddings === 'ready'
              ? 'ready'
              : 'degraded',
          detail:
            knowledgeValue?.components.embeddings ?? 'probe_failed'
        },
        {
          id: 'sqlite',
          status: sqlite.status === 'fulfilled' ? 'ready' : 'failed',
          detail: sqlite.status === 'fulfilled' ? 'ready' : 'probe_failed'
        },
        {
          id: 'background_jobs',
          status:
            backgroundJobs.status === 'fulfilled' ? 'ready' : 'degraded',
          detail:
            backgroundJobs.status === 'fulfilled'
              ? backgroundJobs.value
              : 'probe_failed'
        }
      ]
    }
  }
}

function mapSidecarStatus(status: SidecarStatus): SystemServiceStatus {
  if (status === 'ready') return 'ready'
  if (status === 'starting') return 'starting'
  return 'failed'
}
