import type { NativeOverlayApi } from './native-overlay'
import type { WorkspaceApi } from './workspace'
import type { WebWorkbenchApi } from './workbench'
import type { TerminalApi } from './terminal'

export type SidecarStatus = 'starting' | 'ready' | 'stopped' | 'error'

export interface RealmFlowApi {
  platform: NodeJS.Platform
  getSidecarStatus: () => Promise<SidecarStatus>
  quitApp: () => Promise<void>
  nativeOverlay?: NativeOverlayApi
  workspace: WorkspaceApi
  webWorkbench: WebWorkbenchApi
  terminal: TerminalApi
}
