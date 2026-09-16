import type { WorkbenchBounds } from './workbench'

export type NativeOverlayKind = 'workbench-menu'

export type WorkbenchActionId =
  | 'files'
  | 'folder'
  | 'browser'
  | 'terminal'

export type NativeOverlayRequest = {
  kind: NativeOverlayKind
  anchor: WorkbenchBounds
}

export type NativeOverlayEvent =
  | {
      kind: NativeOverlayKind
      type: 'action'
      action: WorkbenchActionId
    }
  | {
      kind: NativeOverlayKind
      type: 'closed'
    }

export interface NativeOverlayApi {
  show: (request: NativeOverlayRequest) => Promise<void>
  hide: (kind: NativeOverlayKind) => Promise<void>
  onEvent: (listener: (event: NativeOverlayEvent) => void) => () => void
}
