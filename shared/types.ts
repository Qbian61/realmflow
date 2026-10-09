import type { AiRunApi } from './ai-run'
import type { BusinessApi } from './business'
import type { NativeOverlayApi } from './native-overlay'
import type { LegacyPersistenceReadApi } from './persistence'
import type { WorkspaceApi } from './workspace'
import type { WebWorkbenchApi } from './workbench'
import type { TerminalApi } from './terminal'
import type { CodeSnippetApi } from './code-snippet'
import type { WorkbenchHubApi } from './workbench-hub'
import type { ToolCatalogApi } from './tool-catalog'
import type {
  CapabilityBuilderApi,
  CapabilityCatalogApi
} from './capability-catalog'
import type { ConversationAttachmentApi } from './conversation-attachments'
import type { RuntimeGovernanceApi } from './runtime-governance'
import type { ToolPermissionApi } from './tool-permissions'

export type SidecarStatus = 'starting' | 'ready' | 'stopped' | 'error'

export interface AppLifecycleApi {
  onCloseRequested: (listener: () => void) => () => void
  respondToCloseRequest: (approved: boolean) => Promise<void>
}

export interface RealmFlowApi {
  platform: NodeJS.Platform
  getSidecarStatus: () => Promise<SidecarStatus>
  workbenchHub: WorkbenchHubApi
  aiRuns: AiRunApi
  business: BusinessApi
  toolCatalog: ToolCatalogApi
  toolPermissions: ToolPermissionApi
  capabilityCatalog?: CapabilityCatalogApi
  capabilityBuilder?: CapabilityBuilderApi
  runtimeGovernance?: RuntimeGovernanceApi
  conversationAttachments?: ConversationAttachmentApi
  quitApp: () => Promise<void>
  appLifecycle?: AppLifecycleApi
  persistence: LegacyPersistenceReadApi
  nativeOverlay?: NativeOverlayApi
  workspace: WorkspaceApi
  webWorkbench: WebWorkbenchApi
  terminal: TerminalApi
  codeSnippet?: CodeSnippetApi
}
