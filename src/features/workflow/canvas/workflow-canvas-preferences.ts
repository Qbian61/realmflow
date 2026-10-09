export type WorkflowCanvasPreferences = {
  version: 1
  viewport?: {
    x: number
    y: number
    zoom: number
  }
  inspector: {
    open: boolean
    width: number
  }
  minimapVisible: boolean
}

export const DEFAULT_WORKFLOW_CANVAS_PREFERENCES: WorkflowCanvasPreferences = {
  version: 1,
  inspector: {
    open: true,
    width: 360
  },
  minimapVisible: true
}

const POSITION_LIMIT = 1_000_000
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const MIN_INSPECTOR_WIDTH = 280
const MAX_INSPECTOR_WIDTH = 520

export function workflowCanvasPreferenceKey(templateVersionId: string): string {
  return `realmflow:workflow-canvas:v1:${templateVersionId}`
}

export function loadWorkflowCanvasPreferences(
  templateVersionId: string,
  storage: Storage = window.localStorage
): WorkflowCanvasPreferences {
  try {
    const raw = storage.getItem(workflowCanvasPreferenceKey(templateVersionId))
    if (!raw) return defaultPreferences()
    const parsed = JSON.parse(raw) as unknown
    return isWorkflowCanvasPreferences(parsed)
      ? structuredClone(parsed)
      : defaultPreferences()
  } catch {
    return defaultPreferences()
  }
}

export function saveWorkflowCanvasPreferences(
  templateVersionId: string,
  preferences: WorkflowCanvasPreferences,
  storage: Storage = window.localStorage
): boolean {
  if (!isWorkflowCanvasPreferences(preferences)) return false
  try {
    storage.setItem(
      workflowCanvasPreferenceKey(templateVersionId),
      JSON.stringify(preferences)
    )
    return true
  } catch {
    return false
  }
}

function defaultPreferences(): WorkflowCanvasPreferences {
  return structuredClone(DEFAULT_WORKFLOW_CANVAS_PREFERENCES)
}

function isWorkflowCanvasPreferences(
  value: unknown
): value is WorkflowCanvasPreferences {
  if (!isRecord(value) || value.version !== 1) return false
  if (
    typeof value.minimapVisible !== 'boolean' ||
    !isRecord(value.inspector) ||
    typeof value.inspector.open !== 'boolean' ||
    !isFiniteNumber(value.inspector.width) ||
    value.inspector.width < MIN_INSPECTOR_WIDTH ||
    value.inspector.width > MAX_INSPECTOR_WIDTH
  ) {
    return false
  }
  if (value.viewport === undefined) return true
  if (!isRecord(value.viewport)) return false
  return (
    isBoundedCoordinate(value.viewport.x) &&
    isBoundedCoordinate(value.viewport.y) &&
    isFiniteNumber(value.viewport.zoom) &&
    value.viewport.zoom >= MIN_ZOOM &&
    value.viewport.zoom <= MAX_ZOOM
  )
}

function isBoundedCoordinate(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= POSITION_LIMIT
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
