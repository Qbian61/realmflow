import type {
  DashboardInvalidatedEvent,
  DashboardSnapshotDto,
  DashboardSnapshotQuery
} from './workbench-dashboard'
import type { SystemStatusApi } from './system-status'
import type { WorkbenchAttachmentApi } from './workbench-attachments'
import type { WorkbenchMemoApi } from './workbench-memos'
import type { WorkbenchSiteApi } from './workbench-sites'
import type { WorkbenchTaskApi } from './workbench-tasks'

export const WORKBENCH_MODULE_IDS = [
  'overview',
  'tasks',
  'sites',
  'memos',
  'terminal',
  'system'
] as const

export type WorkbenchModuleId = (typeof WORKBENCH_MODULE_IDS)[number]
export type ConfigurableWorkbenchModuleId = Exclude<
  WorkbenchModuleId,
  'overview'
>

export const DEFAULT_WORKBENCH_MODULE_ORDER = [
  'tasks',
  'sites',
  'memos',
  'terminal',
  'system'
] as const satisfies readonly ConfigurableWorkbenchModuleId[]

export type WorkbenchLayout = {
  revision: number
  moduleOrder: ConfigurableWorkbenchModuleId[]
  hiddenModules: ConfigurableWorkbenchModuleId[]
}

export type UpdateWorkbenchLayoutCommand = Omit<
  WorkbenchLayout,
  'revision'
> & {
  requestId: string
  expectedRevision: number
}

export type UpdateWorkbenchLayoutResult =
  | { ok: true; layout: WorkbenchLayout }
  | {
      ok: false
      code: 'revision_conflict'
      current: WorkbenchLayout
    }

export interface WorkbenchHubApi {
  layout: {
    get: () => Promise<WorkbenchLayout>
    update: (
      command: UpdateWorkbenchLayoutCommand
    ) => Promise<UpdateWorkbenchLayoutResult>
  }
  dashboard: {
    getSnapshot: (
      query?: DashboardSnapshotQuery
    ) => Promise<DashboardSnapshotDto>
    onInvalidated: (
      listener: (event: DashboardInvalidatedEvent) => void
    ) => () => void
  }
  attachments: WorkbenchAttachmentApi
  memos: WorkbenchMemoApi
  sites: WorkbenchSiteApi
  tasks: WorkbenchTaskApi
  system: SystemStatusApi
}

export const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayout = Object.freeze({
  revision: 0,
  moduleOrder: [...DEFAULT_WORKBENCH_MODULE_ORDER],
  hiddenModules: []
})

const CONFIGURABLE_MODULES = new Set<string>(
  DEFAULT_WORKBENCH_MODULE_ORDER
)

export function parseUpdateWorkbenchLayoutCommand(
  value: unknown
): UpdateWorkbenchLayoutCommand {
  if (!isRecord(value)) {
    throw new Error('Invalid workbench layout command')
  }
  assertRevision(value.expectedRevision, 'expectedRevision')
  const requestId = parseIdentifier(value.requestId, 'requestId')
  const moduleOrder = parseModuleList(value.moduleOrder, 'moduleOrder')
  if (
    moduleOrder.length !== DEFAULT_WORKBENCH_MODULE_ORDER.length ||
    moduleOrder.some(
      (moduleId) => !CONFIGURABLE_MODULES.has(moduleId)
    )
  ) {
    throw new Error('Invalid workbench layout command: moduleOrder')
  }
  const hiddenModules = parseModuleList(
    value.hiddenModules,
    'hiddenModules'
  )
  if (
    hiddenModules.some(
      (moduleId) => !CONFIGURABLE_MODULES.has(moduleId)
    )
  ) {
    throw new Error('Invalid workbench layout command: hiddenModules')
  }
  return {
    requestId,
    expectedRevision: value.expectedRevision,
    moduleOrder,
    hiddenModules
  }
}

function parseIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new Error(`Invalid workbench layout command: ${field}`)
  }
  return value.trim()
}

export function createWorkbenchLayout(value: unknown): WorkbenchLayout {
  if (!isRecord(value)) throw new Error('Invalid workbench layout')
  assertRevision(value.revision, 'revision')
  const command = parseUpdateWorkbenchLayoutCommand({
    requestId: 'layout-validation',
    expectedRevision: value.revision,
    moduleOrder: value.moduleOrder,
    hiddenModules: value.hiddenModules
  })
  return {
    revision: value.revision,
    moduleOrder: command.moduleOrder,
    hiddenModules: command.hiddenModules
  }
}

function parseModuleList(
  value: unknown,
  field: string
): ConfigurableWorkbenchModuleId[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string') ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`Invalid workbench layout command: ${field}`)
  }
  return value as ConfigurableWorkbenchModuleId[]
}

function assertRevision(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Invalid workbench layout command: ${field}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
