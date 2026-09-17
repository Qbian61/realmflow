import type { AiRunApi } from './ai-run'
import type { BusinessApi } from './business'
import type { NativeOverlayApi } from './native-overlay'
import type { LegacyPersistenceReadApi } from './persistence'
import type { WorkspaceApi } from './workspace'
import type { WebWorkbenchApi } from './workbench'
import type { TerminalApi } from './terminal'

export type SidecarStatus = 'starting' | 'ready' | 'stopped' | 'error'

export interface RealmFlowApi {
  platform: NodeJS.Platform
  getSidecarStatus: () => Promise<SidecarStatus>
  aiRuns: AiRunApi
  business: BusinessApi
  quitApp: () => Promise<void>
  persistence: LegacyPersistenceReadApi
  nativeOverlay?: NativeOverlayApi
  workspace: WorkspaceApi
  webWorkbench: WebWorkbenchApi
  terminal: TerminalApi
}
