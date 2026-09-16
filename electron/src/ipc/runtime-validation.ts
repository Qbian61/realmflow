import type {
  NativeOverlayKind,
  NativeOverlayRequest,
  WorkbenchActionId
} from '../../../shared/native-overlay'
import {
  PERSISTENCE_DATASETS,
  type PersistenceDataset
} from '../../../shared/persistence'
import type { TerminalDimensions } from '../../../shared/terminal'
import type { WorkbenchBounds } from '../../../shared/workbench'
import type {
  RequirementManifest,
  WriteWorkspaceFileInput
} from '../../../shared/workspace'

const requirementStages = new Set([
  'analysis',
  'design',
  'implementation',
  'testing',
  'release',
  'retrospective'
])
const overlayKinds = new Set<NativeOverlayKind>(['workbench-menu'])
const workbenchActions = new Set<WorkbenchActionId>([
  'files',
  'folder',
  'browser',
  'terminal'
])
const persistenceDatasets = new Set<PersistenceDataset>(
  PERSISTENCE_DATASETS
)

export function requirePersistenceDataset(
  value: unknown,
  channel: string
): PersistenceDataset {
  if (!persistenceDatasets.has(value as PersistenceDataset)) {
    invalidIpcPayload(channel, 'dataset')
  }
  return value as PersistenceDataset
}

export function requireRevision(
  value: unknown,
  channel: string
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    invalidIpcPayload(channel, 'expectedRevision')
  }
  return value
}

export function invalidIpcPayload(channel: string, field: string): never {
  throw new TypeError(`Invalid IPC payload for ${channel}: ${field}`)
}

export function requireString(
  value: unknown,
  channel: string,
  field: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {}
): string {
  if (
    typeof value !== 'string' ||
    (!options.allowEmpty && value.length === 0) ||
    value.length > (options.maxLength ?? 4096)
  ) {
    invalidIpcPayload(channel, field)
  }
  return value
}

export function requireWorkbenchBounds(
  value: unknown,
  channel: string,
  field = 'bounds'
): WorkbenchBounds {
  const record = requireRecord(value, channel, field)
  const bounds = {
    x: requireFiniteNumber(record.x, channel, `${field}.x`),
    y: requireFiniteNumber(record.y, channel, `${field}.y`),
    width: requireFiniteNumber(record.width, channel, `${field}.width`),
    height: requireFiniteNumber(record.height, channel, `${field}.height`)
  }
  if (bounds.width < 0 || bounds.height < 0) {
    invalidIpcPayload(channel, field)
  }
  return bounds
}

export function requireTerminalDimensions(
  value: unknown,
  channel: string
): TerminalDimensions {
  const record = requireRecord(value, channel, 'dimensions')
  const cols = record.cols
  const rows = record.rows
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    (cols as number) < 2 ||
    (cols as number) > 500 ||
    (rows as number) < 1 ||
    (rows as number) > 300
  ) {
    invalidIpcPayload(channel, 'dimensions')
  }
  return { cols: cols as number, rows: rows as number }
}

export function requireNativeOverlayRequest(
  value: unknown,
  channel: string
): NativeOverlayRequest {
  const record = requireRecord(value, channel, 'request')
  if (!overlayKinds.has(record.kind as NativeOverlayKind)) {
    invalidIpcPayload(channel, 'request.kind')
  }
  return {
    kind: record.kind as NativeOverlayKind,
    anchor: requireWorkbenchBounds(record.anchor, channel, 'request.anchor')
  }
}

export function requireNativeOverlayKind(
  value: unknown,
  channel: string
): NativeOverlayKind {
  if (!overlayKinds.has(value as NativeOverlayKind)) {
    invalidIpcPayload(channel, 'kind')
  }
  return value as NativeOverlayKind
}

export function requireWorkbenchAction(
  value: unknown,
  channel: string
): WorkbenchActionId {
  if (!workbenchActions.has(value as WorkbenchActionId)) {
    invalidIpcPayload(channel, 'action')
  }
  return value as WorkbenchActionId
}

export function requireWriteWorkspaceFileInput(
  value: unknown,
  channel: string
): WriteWorkspaceFileInput {
  const record = requireRecord(value, channel, 'input')
  return {
    requirementId: requireString(
      record.requirementId,
      channel,
      'input.requirementId'
    ),
    path: requireString(record.path, channel, 'input.path'),
    content: requireString(record.content, channel, 'input.content', {
      allowEmpty: true,
      maxLength: 2 * 1024 * 1024
    }),
    expectedVersion: requireString(
      record.expectedVersion,
      channel,
      'input.expectedVersion'
    )
  }
}

export function requireRequirementManifest(
  value: unknown,
  channel: string
): RequirementManifest {
  const manifest = requireRecord(value, channel, 'manifest')
  requireString(
    manifest.requirementId,
    channel,
    'manifest.requirementId'
  )
  const stages = requireRecord(manifest.stages, channel, 'manifest.stages')
  if (manifest.version !== 1) invalidIpcPayload(channel, 'manifest.version')

  for (const [stageId, stage] of Object.entries(stages)) {
    if (!requirementStages.has(stageId)) {
      invalidIpcPayload(channel, `manifest.stages.${stageId}`)
    }
    const stageRecord = requireRecord(
      stage,
      channel,
      `manifest.stages.${stageId}`
    )
    if (!Array.isArray(stageRecord.artifacts)) {
      invalidIpcPayload(channel, `manifest.stages.${stageId}.artifacts`)
    }
    for (const [index, artifact] of stageRecord.artifacts.entries()) {
      const artifactRecord = requireRecord(
        artifact,
        channel,
        `manifest.stages.${stageId}.artifacts.${index}`
      )
      requireString(
        artifactRecord.path,
        channel,
        `manifest.stages.${stageId}.artifacts.${index}.path`
      )
      if (
        artifactRecord.primary !== undefined &&
        typeof artifactRecord.primary !== 'boolean'
      ) {
        invalidIpcPayload(
          channel,
          `manifest.stages.${stageId}.artifacts.${index}.primary`
        )
      }
    }
  }

  return value as RequirementManifest
}

function requireRecord(
  value: unknown,
  channel: string,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidIpcPayload(channel, field)
  }
  return value as Record<string, unknown>
}

function requireFiniteNumber(
  value: unknown,
  channel: string,
  field: string
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidIpcPayload(channel, field)
  }
  return value
}
