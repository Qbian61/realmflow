import { constants, existsSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { access, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  shell,
} from 'electron'
import type { ExtensionPackagePlatform } from '../../domain/extension-package'
import type { AgentRuntimeRun } from '../../domain/agent-runtime'
import type { DshRunManifest } from '../../domain/dsh-run-manifest'
import type { KnowledgeSource } from '../../domain/knowledge-source'
import type { VectorIndexProfile } from '../../domain/vector-index-profile'
import { resolveAppIconPath } from './app-icon'
import { registerMainIpc } from './ipc/register-main-ipc'
import { NativeOverlayManager } from './overlay/native-overlay-manager'
import { IPC_EVENT_CHANNELS } from '../../shared/ipc-contract'
import { installProcessOutputErrorGuards } from './process/process-output-error-guard'
import { registerTerminationSignals } from './process/termination-signals'
import {
  createNodeQdrantProcessPort,
  QdrantProcessManager,
} from './qdrant/qdrant-process-manager'
import type { DshAiRunGateway } from './ai-run/infrastructure/dsh-ai-run-gateway'
import { DshHistorySync } from './application/dsh/dsh-history-sync'
import {
  createDshRuntimeBootstrap,
} from './bootstrap/dsh-runtime-bootstrap'
import {
  createDshControlPlaneBootstrap,
  DSH_RUNTIME_INSTANCE_ID,
  type DshControlPlaneBootstrap,
} from './bootstrap/dsh-control-plane-bootstrap'
import { QdrantHttpClient } from './qdrant/qdrant-client'
import { QdrantCollectionManager } from './qdrant/qdrant-collection-manager'
import {
  QdrantCatalogSearchAdapter,
  QdrantKnowledgeSearchAdapter,
} from './qdrant/qdrant-search-adapter'
import { QdrantKnowledgeIndexAdapter } from './qdrant/qdrant-index-adapter'
import { TerminalManager } from './terminal/terminal-manager'
import { CodeSnippetService } from './code-snippet/code-snippet-service'
import { WebWorkbenchManager } from './workbench/web-workbench'
import { createArtifactProtocolHandler } from './workspace/artifact-protocol'
import { WorkspaceService } from './workspace/workspace-service'
import { ManagedDirectoryRenamePolicyService } from './workspace/managed-directory-rename-policy'
import {
  CancelAiRunUseCase,
  GenerateStageArtifactUseCase,
} from './ai-run/application/generate-stage-artifact'
import { CommitFormalArtifactUseCase } from './ai-run/application/commit-formal-artifact'
import { RendererRunEventPublisher } from './ai-run/infrastructure/renderer-run-event-publisher'
import { AssembledNodeContextRepository } from './ai-run/infrastructure/assembled-node-context-repository'
import { SqliteArtifactRepository } from './ai-run/infrastructure/sqlite-artifact-repository'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase,
} from './infrastructure/sqlite/database'
import { REALMFLOW_SCHEMA_VERSION } from './infrastructure/sqlite/migrations'
import { applyPendingRestore } from './infrastructure/backup/startup-restore'
import { createSqliteRepositories } from './infrastructure/sqlite/repositories'
import { SqliteDocumentDeliveryRepository } from './infrastructure/sqlite/document-delivery-repository'
import { SqliteModelStatisticsRepository } from './infrastructure/sqlite/model-statistics-repository'
import { SqliteProductAnalyticsRepository } from './infrastructure/sqlite/product-analytics-repository'
import { SqliteOutboundCallRepository } from './infrastructure/sqlite/outbound-call-repository'
import { SqliteAppSupportRepository } from './infrastructure/sqlite/app-support-repository'
import { SqliteWorkbenchLayoutRepository } from './infrastructure/sqlite/workbench-layout-repository'
import { SqliteWorkbenchDashboardRepository } from './infrastructure/sqlite/workbench-dashboard-repository'
import { SqliteWorkbenchTaskRepository } from './infrastructure/sqlite/workbench-task-repository'
import { SqliteSystemStatusRepository } from './infrastructure/sqlite/system-status-repository'
import { SqliteKnowledgeSourceRepository } from './infrastructure/sqlite/knowledge-source-repository'
import { SqliteConnectorRepository } from './infrastructure/sqlite/connector-repository'
import { SqliteScheduleRepository } from './infrastructure/sqlite/schedule-repository'
import { SqliteBackupOperationRepository } from './infrastructure/sqlite/backup-operation-repository'
import { SqliteBackupSnapshot } from './infrastructure/sqlite/sqlite-backup-snapshot'
import { ProviderDiscoveryService } from './models/provider-discovery'
import { SqliteToolEventStore } from './infrastructure/sqlite/tool-event-store'
import { SqliteToolProjectionStore } from './infrastructure/sqlite/tool-projection-store'
import { SqliteMcpServerRepository } from './infrastructure/sqlite/mcp-server-repository'
import { SqliteRepositoryIngestionStore } from './infrastructure/sqlite/repository-ingestion-store'
import { SqliteVectorIndexRepository } from './infrastructure/sqlite/vector-index-repository'
import { SqliteRequirementMemoryRepository } from './infrastructure/sqlite/requirement-memory-repository'
import { SqliteKnowledgeNoteRepository } from './infrastructure/sqlite/knowledge-note-repository'
import { SqliteKnowledgeSearchStore } from './infrastructure/sqlite/knowledge-search-store'
import { SqliteKnowledgeRefreshRepository } from './infrastructure/sqlite/knowledge-refresh-repository'
import { SqliteIndexMaintenanceRepository } from './infrastructure/sqlite/index-maintenance-repository'
import { SqliteAgentRuntimeRunRepository } from './infrastructure/sqlite/agent-runtime-run-repository'
import { SqliteAgentRuntimeStateRepository } from './infrastructure/sqlite/agent-runtime-state-repository'
import { SqliteAgentRuntimeBudgetRepository } from './infrastructure/sqlite/agent-runtime-budget-repository'
import { SqliteAgentDelegationRepository } from './infrastructure/sqlite/agent-delegation-repository'
import { RuntimeDelegationService } from './application/agent-runtime/runtime-delegation-service'
import { ReconcileRuntimeDelegations } from './application/agent-runtime/runtime-delegation-recovery'
import { MediaProviderRuntime } from './application/media/media-provider-runtime'
import { RuntimeStateService } from './application/agent-runtime/runtime-state-service'
import { AgentRuntimeOrchestrator } from './application/agent-runtime/agent-runtime-orchestrator'
import { SqliteRuntimeGovernanceRepository } from './infrastructure/sqlite/runtime-governance-repository'
import { SqliteAssistantRunEventStore } from './infrastructure/sqlite/assistant-run-event-store'
import { SqliteCapabilityCatalogRepository } from './infrastructure/sqlite/capability-catalog-repository'
import { SqliteAgentProfileRepository } from './infrastructure/sqlite/agent-profile-repository'
import { SqliteCapabilityGenerationRepository } from './infrastructure/sqlite/capability-generation-repository'
import { SqliteConversationAttachmentRepository } from './infrastructure/sqlite/conversation-attachment-repository'
import { SqliteFollowUpSuggestionRepository } from './infrastructure/sqlite/follow-up-suggestion-repository'
import { QueryModelStatisticsUseCase } from './application/analytics/query-model-statistics'
import { QueryProductAnalyticsUseCase } from './application/analytics/query-product-analytics'
import { RuntimeGovernanceService } from './application/analytics/runtime-governance-service'
import { LocalEmbeddingService } from '../../dsh-plugins/realmflow-runtime/src/embedding/local-embedding-service'
import {
  createDshLocalEmbeddingWorkerFactory
} from '../../dsh-plugins/realmflow-runtime/src/embedding/local-embedding-process-worker'
import {
  createLocalDshEmbeddingProfile
} from '../../dsh-plugins/realmflow-runtime/src/embedding/local-embedding-worker'
import { BuiltinRuntimeEvaluationRunner } from './application/analytics/runtime-evaluation-runner'
import { OutboundCallAuditService } from './application/network/outbound-call-audit'
import { AppSupportService } from './application/support/app-support-service'
import { WorkbenchLayoutService } from './application/workbench-layout-service'
import { QueryDashboardSnapshot } from './application/workbench-hub/query-dashboard-snapshot'
import { QuerySystemStatus } from './application/workbench-hub/query-system-status'
import { ManageWorkbenchTasks } from './application/workbench-hub/manage-task-tables'
import { ManageWorkbenchAttachments } from './application/workbench-hub/manage-workbench-attachments'
import { WorkbenchAttachmentStore } from './workbench-hub/workbench-attachment-store'
import { ConversationAttachmentRegistry } from './application/conversation/conversation-attachment-registry'
import { ManageConversationAttachments } from './application/conversation/manage-conversation-attachments'
import { ConversationInputPreprocessor } from './application/conversation/conversation-input-preprocessor'
import { ConversationAttachmentChunkReader } from './application/conversation/conversation-attachment-chunk-reader'
import { LocalDocumentTextExtractor } from './application/documents/local-document-text-extractor'
import { FileContentExtractionCache } from './application/content-extraction/content-extraction-cache'
import { LocalContentExtractionService } from './application/content-extraction/local-content-extraction-service'
import {
  DocumentContentExtractor,
  TextContentExtractor,
} from './application/content-extraction/extractors/text-document-extractor'
import { PdfContentExtractor } from './application/content-extraction/extractors/pdf-content-extractor'
import { SpreadsheetContentExtractor } from './application/content-extraction/extractors/spreadsheet-content-extractor'
import { PresentationContentExtractor } from './application/content-extraction/extractors/presentation-content-extractor'
import {
  FixedLayoutContentExtractor,
  ImageOcrContentExtractor,
} from './application/content-extraction/extractors/fixed-layout-image-extractor'
import {
  LegacyOfficeContentExtractor,
  OfficeConversionContentExtractor,
  OfficeSanitizedContentExtractor,
  type ModernOfficeContentPort,
} from './application/content-extraction/extractors/office-conversion-extractor'
import { ArchiveContentExtractor } from './application/content-extraction/extractors/archive-content-extractor'
import { EcosystemContentExtractor } from './application/content-extraction/extractors/ecosystem-content-extractor'
import { CapabilityProbeContentExtractor } from './application/content-extraction/extractors/capability-probe-content-extractor'
import { DocumentDeliveryService } from './application/files/document-delivery-service'
import {
  HtmlChromiumPdfBackend,
  type ChromiumPdfPrinter,
} from './application/files/html-chromium-pdf-backend'
import {
  PdfGenerationService,
  createPdfSessionSaveAsBackend,
  createSidecarDocxPdfBackend,
} from './application/files/pdf-generation-service'
import { LocalSpreadsheetSessionService } from './application/files/local-spreadsheet-session-service'
import { LocalWordSessionService } from './application/files/local-word-session-service'
import { LocalPresentationSessionService } from './application/files/local-presentation-session-service'
import { LegacyOfficeImportService } from './application/files/legacy-office-import-service'
import { LegacyOfficeRuntimeCapabilityProvider } from './application/files/legacy-office-runtime-capability'
import { OfficeSafeCopyService } from './application/files/office-safe-copy-service'
import { OfficeReadOnlySessionService } from './application/files/office-read-only-session-service'
import { PrivatePythonWorkerClient } from './application/files/private-python-worker-client'
import { ArchiveAdapter } from './application/files/archive-adapter'
import { ArchiveService } from './application/files/archive-service'
import { NodeArchiveStorage } from './application/files/node-archive-storage'
import { FixedLayoutAdapter } from './application/files/fixed-layout-adapter'
import {
  FixedLayoutService,
  NodeFixedLayoutStorage,
} from './application/files/fixed-layout-service'
import { LocalImageSessionService } from './application/files/local-image-session-service'
import { LocalTesseractOcrAdapter } from './application/files/local-tesseract-ocr-adapter'
import { SharpImageAdapter } from './application/files/image-adapter'
import { LocalPdfSessionService } from './application/files/local-pdf-session-service'
import { PdfLibAdapter } from './application/files/pdf-adapter'
import { NodeSpreadsheetSessionStorage } from './application/files/node-spreadsheet-session-storage'
import { ManageWorkbenchSites } from './application/workbench-hub/manage-workbench-sites'
import { SqliteWorkbenchSiteRepository } from './infrastructure/sqlite/workbench-site-repository'
import { ManageWorkbenchMemos } from './application/workbench-hub/manage-workbench-memos'
import { SqliteWorkbenchMemoRepository } from './infrastructure/sqlite/workbench-memo-repository'
import { SystemResourceSampler } from './workbench-hub/system-resource-sampler'
import { ConnectorService } from './application/connectors/connector-service'
import { ScheduleService } from './application/schedules/schedule-service'
import { ModelSkillExecutionRuntime } from './application/schedules/model-skill-execution-runtime'
import { CronSchedulePlanner } from './application/schedules/cron-schedule-planner'
import { CronScheduleScheduler } from './application/schedules/cron-schedule-scheduler'
import { ToolProjectionRunner } from './application/tools/tool-projection-runner'
import { ExtensionPackageService } from './application/tools/extension-package-service'
import {
  CapabilityPackageService,
  satisfiesCapabilityVersion,
} from './application/capabilities/capability-package-service'
import { CapabilityAtomicInstaller } from './application/capabilities/capability-atomic-installer'
import { CapabilityImportCoordinator } from './application/capabilities/capability-import-coordinator'
import { CapabilityBuilderService } from './application/capabilities/capability-builder-service'
import { CapabilityDraftWorkspace } from './application/capabilities/capability-draft-workspace'
import { CapabilitySpecCompiler } from './application/capabilities/capability-spec-compiler'
import { DeterministicCapabilityContractTestRunner } from './application/capabilities/deterministic-capability-contract-test-runner'
import { CapabilityLifecycleService } from './application/capabilities/capability-lifecycle-service'
import { assertCapabilityDependencyGraph } from '../../domain/capability'
import { BuiltinCatalogLoader } from './application/tools/builtin-catalog-loader'
import { BuiltinCatalogSyncService } from './application/tools/builtin-catalog-sync-service'
import { ToolCatalogService } from './application/tools/tool-catalog-service'
import {
  PluginContributionRegistry,
} from './application/plugins/plugin-contribution-registry'
import { ToolPolicyConfigurationService } from './application/tools/tool-policy-configuration-service'
import { RuntimeFilteredToolProjectionStore } from './application/tools/runtime-filtered-tool-projection-store'
import {
  CompositeRuntimeToolAvailabilityProvider,
  McpRuntimeToolAvailabilityProvider,
  WebRuntimeToolAvailabilityProvider,
} from './application/tools/runtime-tool-availability'
import { SkillInstructionReader } from './application/tools/skill-instruction-reader'
import { ExtensionCatalogImportService } from './application/tools/extension-catalog-import-service'
import { SdkMcpClientFactory } from './application/tools/sdk-mcp-client-factory'
import { McpDiscoveryService } from './application/tools/mcp-discovery-service'
import { McpCatalogPublisher } from './application/tools/mcp-catalog-publisher'
import { McpServerService } from './application/tools/mcp-server-service'
import { WebProviderConfigurationService } from './application/web/web-provider-configuration-service'
import { SqliteWebProviderRepository } from './infrastructure/sqlite/web-provider-repository'
import { ConversationMemoryService } from './application/conversation/conversation-memory-service'
import { SqliteConversationContextRepository } from './infrastructure/sqlite/conversation-context-repository'
import { SqliteSkillRegistryRepository } from './infrastructure/sqlite/skill-registry-repository'
import { SkillRegistryService } from './application/skills/skill-registry-service'
import { SkillSourceScanner } from './application/skills/skill-source-scanner'
import { FilesystemGitRepositoryResolver } from './application/tools/git-repository-resolver'
import { ApprovalObservabilityService } from './application/tools/approval-observability-service'
import { SqliteApprovalDefaultRepository } from './infrastructure/sqlite/approval-default-repository'
import { RecoverInterruptedRunsUseCase } from './application/recover-interrupted-runs'
import { RecoverAgentRuntimeRunsUseCase } from './application/recover-agent-runtime-runs'
import { AgentRunRecoveryActions } from './application/agent-run-recovery-actions'
import {
  CreateSpaceUseCase,
  DeleteSpaceUseCase,
  RelocateSpaceUseCase,
  RestoreSpaceUseCase,
  SelectWorkRootUseCase,
  UpdateSpaceUseCase,
} from './application/commands/manage-workspaces'
import {
  CreateRequirementUseCase,
  DeleteRequirementUseCase,
  RestoreRequirementUseCase,
  UpdateRequirementUseCase,
} from './application/commands/manage-requirements'
import {
  RenameRequirementDirectoryUseCase,
  RenameSpaceDirectoryUseCase,
} from './application/commands/rename-managed-directories'
import {
  ListTrashItemsUseCase,
  PurgeRequirementUseCase,
  PurgeSpaceUseCase,
} from './application/commands/manage-trash'
import { KnowledgeSourceService } from './application/knowledge/knowledge-source-service'
import { OnlineDocumentSnapshotService } from './application/knowledge/online-document-snapshot-service'
import { LocalFileIngestionService } from './application/knowledge/local-file-ingestion-service'
import { runLocalFileIngestionWithIndexDispatch } from './application/knowledge/local-file-index-dispatch'
import { RepositoryIngestionService } from './application/knowledge/repository-ingestion-service'
import { runRepositoryIngestionWithIndexDispatch } from './application/knowledge/repository-index-dispatch'
import { KnowledgeIndexCoordinator } from './application/knowledge/knowledge-index-coordinator'
import { KnowledgeIndexWorker } from './application/knowledge/knowledge-index-worker'
import { KnowledgeIndexGarbageCollector } from './application/knowledge/knowledge-index-garbage-collector'
import {
  KnowledgeIndexRecoveryService,
  StartupKnowledgeRebuildService,
} from './application/knowledge/knowledge-index-recovery-service'
import { KnowledgeIndexStartupRecoveryCoordinator } from './application/knowledge/knowledge-index-startup-recovery-coordinator'
import { KnowledgeRefreshService } from './application/knowledge/knowledge-refresh-service'
import { KnowledgeRefreshScheduler } from './application/knowledge/knowledge-refresh-scheduler'
import { KnowledgeRuntimeHealthService } from './application/knowledge/knowledge-runtime-health-service'
import { WorkspaceQdrantCleanupService } from './application/knowledge/workspace-qdrant-cleanup-service'
import { KnowledgeNoteService } from './application/knowledge/knowledge-note-service'
import { KnowledgeSourceQueryService } from './application/knowledge/knowledge-source-query-service'
import { MainKnowledgeIndexSourceReader } from './application/knowledge/knowledge-index-source-reader'
import { HybridKnowledgeSearchService } from './application/knowledge/hybrid-knowledge-search-service'
import { CatalogIndexService } from './application/knowledge/catalog-index-service'
import {
  toRepositorySnapshotViewDto,
  toRepositorySyncResultDto,
} from './application/knowledge/repository-ingestion-dto'
import { WorkflowRuntime } from './application/workflow/workflow-runtime'
import type {
  BusinessHandlers,
  WorkflowRollbackErrorCode,
  RollbackWorkflowToNodeResult,
  WorkflowNodeControlAction,
  WorkflowNodeControlResult,
  KnowledgeNoteDto,
  WorkflowTemplateDraftDto,
  WorkflowTemplateLibraryItemDto,
  WorkflowTemplateNodeDto,
  WorkflowTemplateVersionSummaryDto,
} from '../../shared/business'
import {
  GetAiRunUseCase,
  ListAiRunEventsUseCase,
} from './application/query-ai-runs'
import { SqliteWorkspaceMetadataStore } from './workspace/workspace-metadata-store'
import { CredentialVault } from './models/credential-vault'
import { ModelService } from './models/model-service'
import {
  RecoverInterruptedNodeRunsUseCase,
  RecoverPendingWorkflowRollbacksUseCase,
} from './application/workflow/recover-workflows'
import { ManageNodeExecutionUseCase } from './application/workflow/manage-node-execution'
import { ManageNodeQuestionsUseCase } from './application/workflow/manage-node-questions'
import { ManageNodeTodosUseCase } from './application/workflow/manage-node-todos'
import { ExecuteWorkflowNodeUseCase } from './application/workflow/execute-workflow-node'
import { NodeCompletionGateEvaluator } from './application/workflow/node-completion-gate-evaluator'
import { AdvanceWorkflowUseCase } from './application/workflow/advance-workflow'
import { ReconcileWorkflowDispatchesUseCase } from './application/workflow/reconcile-workflow-dispatches'
import { ResolveNodeGateUseCase } from './application/workflow/resolve-node-gate'
import { ResolveNodeQuestionUseCase } from './application/workflow/resolve-node-question'
import { ManageRequirementWorkflowUseCase } from './application/workflow/manage-requirement-workflow'
import { StartedNodeProtection } from './application/workflow/started-node-protection'
import {
  ControlWorkflowNodeUseCase,
  WorkflowNodeControlError,
} from './application/workflow/control-workflow-node'
import { ManageWorkflowTemplatesUseCase } from './application/workflow/manage-workflow-templates'
import { TemplateMigrationService } from './application/workflow/template-migration-service'
import { WorkflowTemplatePublicationValidationError } from './application/workflow/validate-workflow-template-publication'
import { GetRequirementExecutionViewUseCase } from './application/workflow/get-requirement-execution-view'
import {
  SetWorkflowParallelismUseCase,
  WorkflowParallelismError,
} from './application/workflow/set-workflow-parallelism'
import {
  RollbackWorkflowError,
  RollbackWorkflowToNodeUseCase,
} from './application/workflow/rollback-workflow-to-node'
import { CoordinateWorkflowRollbackUseCase } from './application/workflow/coordinate-workflow-rollback'
import { SyncRequirementArtifactsUseCase } from './application/knowledge/sync-requirement-artifacts'
import { RequirementMemoryService } from './application/knowledge/requirement-memory-service'
import { SendConversationMessageUseCase } from './application/conversation/send-conversation-message'
import { CancelConversationRunUseCase } from './application/conversation/cancel-conversation-run'
import { ConversationTurnViewAssembler } from './application/conversation/conversation-turn-view-assembler'
import { SendFollowUpSuggestionUseCase } from './application/conversation/send-follow-up-suggestion'
import {
  FollowUpSuggestionCoordinator,
} from './application/conversation/follow-up-suggestion-coordinator'
import { RealModelFollowUpSuggestionGenerator } from './application/conversation/model-follow-up-suggestion-generator'
import {
  projectConversationRunEvent,
  toAssistantRunEvent,
} from './application/conversation/assistant-turn-projector'
import { DshInteractionTimelinePresenter } from './application/dsh/dsh-interaction-timeline-presenter'
import { ConversationGeneratedArtifactService } from './application/conversation/conversation-generated-artifacts'
import { SqliteGeneratedArtifactStateRepository } from './infrastructure/sqlite/generated-artifact-state-repository'
import type { AiRunEvent } from '../../domain/ai-run'
import { CreateGeneralConversationUseCase } from './application/conversation/create-general-conversation'
import { CreateFolderConversationUseCase } from './application/conversation/create-folder-conversation'
import { CreateSpaceConversationUseCase } from './application/conversation/create-space-conversation'
import { SpaceConversationContextAssembler } from './application/conversation/space-conversation-context'
import { BeginRequirementNodeTurnUseCase } from './application/conversation/begin-requirement-node-turn'
import { RequirementNodeConversationContextAssembler } from './application/conversation/requirement-node-context'
import { SendRequirementNodeMessageUseCase } from './application/conversation/send-requirement-node-message'
import { ManageConversations } from './application/conversation/manage-conversations'
import { ContextAssembler } from './application/context/context-assembler'
import { PrepareNodeContextSnapshotUseCase } from './application/context/prepare-node-context-snapshot'
import { SqliteContextSources } from './infrastructure/context/sqlite-context-sources'
import { NetworkGateway } from './network/network-gateway'
import {
  coordinateRepository,
  getSqliteConnectionCoordinator,
} from './infrastructure/sqlite/connection-coordinator'
import { SecurePathService } from './workspace/secure-path-service'
import { BackupService } from './application/backup/backup-service'
import { RestoreStagingService } from './application/backup/restore-staging-service'
import { ManagedBackupCatalog } from './application/backup/managed-backup-catalog'
import { BackupBundleWriter } from './infrastructure/backup/backup-bundle'
import { BackupBundleValidator } from './infrastructure/backup/backup-bundle-validator'

installProcessOutputErrorGuards()

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
let dshControlPlane: DshControlPlaneBootstrap | undefined
let qdrant: QdrantProcessManager | undefined
let knowledgeIndexWorker: KnowledgeIndexWorker | undefined
let knowledgeStartupRebuildRun: Promise<void> | undefined
let knowledgeRefreshScheduler: KnowledgeRefreshScheduler | undefined
let outboundCallAudit: OutboundCallAuditService | undefined
const networkGateway = new NetworkGateway({
  audit: {
    start: (input) => requireOutboundCallAudit().start(input),
    finish: (id, input) => requireOutboundCallAudit().finish(id, input),
  },
})
let mainWindow: BrowserWindow | null = null
let rendererCloseApproved = false
let closeRequestPending = false
let shutdownStarted = false
let shutdownComplete = false
let webWorkbench: WebWorkbenchManager | null = null
let terminalManager: TerminalManager | null = null
let nativeOverlayManager: NativeOverlayManager | null = null
let database: RealmFlowDatabase | null = null
let scheduleScheduler: CronScheduleScheduler | null = null
let workspaceCleanupTimer: ReturnType<typeof setTimeout> | undefined
let workspaceCleanupRun: Promise<void> | undefined

function requestRendererCloseApproval(): void {
  if (closeRequestPending) return
  const window = mainWindow
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed()
  ) {
    rendererCloseApproved = true
    app.quit()
    return
  }
  closeRequestPending = true
  window.webContents.send(IPC_EVENT_CHANNELS.appCloseRequested)
}

function broadcastToolPermissionChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send(IPC_EVENT_CHANNELS.toolPermissionChanged)
  }
}

function conversationMemoryId(noteId: string, version: number): string {
  return `conversation-memory:${noteId}:v${version}`
}

function knowledgeNoteMemoryKind(
  kind: 'conversation_note' | 'decision' | 'retrospective'
): 'fact' | 'decision' | 'outcome' {
  if (kind === 'decision') return 'decision'
  if (kind === 'retrospective') return 'outcome'
  return 'fact'
}

function respondToRendererCloseRequest(approved: boolean): void {
  closeRequestPending = false
  if (!approved) return
  rendererCloseApproved = true
  app.quit()
}

function requireOutboundCallAudit(): OutboundCallAuditService {
  if (!outboundCallAudit) {
    throw new Error('Outbound call audit is unavailable')
  }
  return outboundCallAudit
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'realmflow-artifact',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

function createWindow(): void {
  const icon = resolveAppIconPath({
    isPackaged: app.isPackaged && !process.env.ELECTRON_RENDERER_URL,
    resourcesPath: process.resourcesPath,
    cwd: process.cwd(),
  })
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 920,
    minHeight: 620,
    title: 'RealmFlow',
    icon,
    backgroundColor: '#f1f1f1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition:
      process.platform === 'darwin' ? { x: 26, y: 16 } : undefined,
    webPreferences: {
      preload: join(moduleDirectory, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`Preload failed: ${preloadPath}`, error)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.on('close', (event) => {
    if (shutdownComplete) return
    event.preventDefault()
    if (!rendererCloseApproved) requestRendererCloseApproval()
  })
  window.on('closed', () => {
    nativeOverlayManager?.dispose()
    webWorkbench?.dispose()
    if (mainWindow === window) mainWindow = null
  })
  mainWindow = window

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(moduleDirectory, '../renderer/index.html'))
  }
}

const hasInstanceLock = app.requestSingleInstanceLock()
if (!hasInstanceLock) app.exit(0)
app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
})
registerTerminationSignals(process, () => {
  rendererCloseApproved = true
  app.quit()
})

app
  .whenReady()
  .then(async () => {
    if (process.platform === 'darwin') {
      app.dock.setIcon(
        resolveAppIconPath({
          isPackaged: app.isPackaged && !process.env.ELECTRON_RENDERER_URL,
          resourcesPath: process.resourcesPath,
          cwd: process.cwd(),
        }),
      )
    }
    const userDataPath = app.getPath('userData')
    const databasePath = join(userDataPath, 'realmflow.db')
    const dshRuntimeBootstrap = createDshRuntimeBootstrap({
      isPackaged: app.isPackaged,
      projectRoot: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      userDataPath,
      platform: process.platform,
      arch: process.arch,
      environment: process.env,
      startRuntime:
        app.isPackaged || process.env.REALMFLOW_START_DSH_RUNTIME === '1',
    })
    await dshRuntimeBootstrap.start()
    const restoreResult = await applyPendingRestore({
      userDataPath,
      databasePath,
      currentSchemaVersion: REALMFLOW_SCHEMA_VERSION,
    })
    if (restoreResult.status === 'blocked') {
      throw new Error(restoreResult.diagnostic)
    }
    const qdrantExecutable =
      process.platform === 'win32' ? 'qdrant.exe' : 'qdrant'
    const qdrantBinaryPath = app.isPackaged
      ? join(process.resourcesPath, 'qdrant', qdrantExecutable)
      : join(
          app.getAppPath(),
          'resources',
          'qdrant',
          `${process.platform}-${process.arch}`,
          qdrantExecutable,
        )
    qdrant = new QdrantProcessManager(
      createNodeQdrantProcessPort({
        binaryPath: qdrantBinaryPath,
        userDataPath,
      }),
      {
        log: (stream, message) => {
          const output = `[Qdrant ${stream}] ${message}`
          if (stream === 'stderr') console.warn(output)
          else console.info(output)
        },
      },
    )
    const qdrantConnection = await qdrant.start()
    const qdrantClient = new QdrantHttpClient(qdrantConnection)
    const qdrantCollections = new QdrantCollectionManager({
      client: qdrantClient,
      runtime: qdrant,
    })
    database = openRealmFlowDatabase(databasePath)
    const repositories = createSqliteRepositories(database)
    const manageConversations = new ManageConversations({
      sessions: repositories.chatSessions
    })
    const agentProfiles = new SqliteAgentProfileRepository(database)
    const toolEvents = new SqliteToolEventStore(database)
    const persistedToolProjections = new SqliteToolProjectionStore(database)
    let webProviderRepository!: SqliteWebProviderRepository
    let mcpServerRepository!: SqliteMcpServerRepository
    const legacyOfficeRuntimeCapability =
      new LegacyOfficeRuntimeCapabilityProvider({
        platform: process.platform,
        environment: process.env,
      })
    const toolProjections = new RuntimeFilteredToolProjectionStore({
      source: persistedToolProjections,
      availability: new CompositeRuntimeToolAvailabilityProvider([
        legacyOfficeRuntimeCapability,
        new WebRuntimeToolAvailabilityProvider({
          configuration: { get: () => webProviderRepository.get() },
        }),
        new McpRuntimeToolAvailabilityProvider({
          servers: { list: () => mcpServerRepository.list() },
        }),
      ]),
    })
    const toolProjectionRunner = new ToolProjectionRunner(
      toolEvents,
      persistedToolProjections,
    )
    const toolIntegrity = await toolEvents.verifyIntegrity()
    if (toolIntegrity.status === 'corrupted') {
      throw new Error(toolIntegrity.message)
    }
    await toolProjectionRunner.rebuildCatalogProjection()
    const extensionPackages = new ExtensionPackageService({
      userDataPath,
      realmFlowVersion: app.getVersion(),
      platform: requireExtensionPlatform(process.platform),
      architecture: process.arch,
    })
    const capabilityCatalog = new SqliteCapabilityCatalogRepository(database)
    const capabilityContractTests =
      new DeterministicCapabilityContractTestRunner()
    const capabilityPackages = new CapabilityPackageService({
      userDataPath,
      realmFlowVersion: app.getVersion(),
      platform: requireExtensionPlatform(process.platform),
      resolveDependencies: async (dependencies, candidate) => {
        const definitions = await capabilityCatalog.listDefinitions()
        assertCapabilityDependencyGraph([...definitions, candidate])
        const missing = dependencies.filter(
          (dependency) =>
            dependency.required &&
            !definitions.some(
              (definition) =>
                definition.id === dependency.capabilityId &&
                definition.kind === dependency.kind &&
                satisfiesCapabilityVersion(
                  definition.version,
                  dependency.versionRange,
                ),
            ),
        )
        if (missing.length > 0) {
          throw new Error('Capability package dependencies are unavailable')
        }
      },
      runTest: (test, stagingPath) =>
        capabilityContractTests.run(test, stagingPath),
    })
    await capabilityPackages.recover(
      await capabilityCatalog.listReferencedPackageDigests(),
    )
    const capabilityInstaller = new CapabilityAtomicInstaller({
      catalog: capabilityCatalog,
    })
    const capabilityImporter = new CapabilityImportCoordinator({
      packages: capabilityPackages,
      installer: capabilityInstaller,
    })
    const capabilityBuilder = new CapabilityBuilderService({
      sessions: new SqliteCapabilityGenerationRepository(database),
      workspace: new CapabilityDraftWorkspace({ userDataPath }),
      compiler: new CapabilitySpecCompiler(),
      packages: capabilityPackages,
      installer: capabilityInstaller,
    })
    const capabilityLifecycle = new CapabilityLifecycleService({
      catalog: capabilityCatalog,
      packages: capabilityPackages,
    })
    const recoveredCatalog = await persistedToolProjections.getCatalog()
    await extensionPackages.recover(
      new Set(
        recoveredCatalog.packages
          .filter(({ origin }) => origin === 'local_upload')
          .map(({ packageDigest }) => packageDigest),
      ),
    )
    const builtinCatalogRoot = app.isPackaged
      ? join(process.resourcesPath, 'builtin-extensions')
      : join(app.getAppPath(), 'resources', 'extensions', 'builtin')
    const builtinCatalogLoader = new BuiltinCatalogLoader(builtinCatalogRoot)
    const builtinCatalogPackages = await builtinCatalogLoader.load()
    await new BuiltinCatalogSyncService({
      loader: { load: async () => builtinCatalogPackages },
      events: toolEvents,
      projections: persistedToolProjections,
      projectionRunner: toolProjectionRunner,
    }).synchronize()
    const builtinSkillInstructions = new SkillInstructionReader({
      builtins: builtinCatalogPackages,
      local: extensionPackages,
    })
    const skillRegistry = new SkillRegistryService({
      store: new SqliteSkillRegistryRepository(database),
      scanner: new SkillSourceScanner(),
      resolveWorkspaceRootId: async (workspaceId) =>
        (await repositories.workspaces.get(workspaceId))?.workRootId,
    })
    skillRegistry.synchronizeBuiltins(
      await Promise.all(
        builtinCatalogPackages.map(async (packageItem) => ({
          packageId: packageItem.manifest.packageId,
          displayName: packageItem.manifest.name,
          skills: await Promise.all(
            packageItem.skills.map(async (definition) => ({
              definition,
              instructions:
                await builtinSkillInstructions.readInstructions(definition),
            })),
          ),
        })),
      ),
    )
    const configuredSkillSync = await skillRegistry.synchronizeConfiguredSources({
      workspaceRoots: (await repositories.workRoots.list()).map((root) => ({
        id: root.id,
        label: root.id,
        path: root.path,
      })),
      userGlobalRoot: join(homedir(), '.realmflow', 'skills'),
      pluginRoots: [],
      generatedRoots: [],
    })
    for (const error of configuredSkillSync.errors) {
      console.warn(
        `[Skill Registry] ${error.sourceId}:${error.relativePath}:${error.code}`,
      )
    }
    const runtimeSkillInstructions = new SkillInstructionReader({
      builtins: builtinCatalogPackages,
      local: extensionPackages,
      registry: skillRegistry,
    })
    const pluginContributions = new PluginContributionRegistry()
    const mediaRuntime = new MediaProviderRuntime({
      registry: pluginContributions,
      adapters: [],
      resolveCredentialHandle: async () => undefined,
    })
    const toolCatalog = new ToolCatalogService({
      events: toolEvents,
      projections: toolProjections,
      projectionRunner: toolProjectionRunner,
      skillRegistry,
      mediaRuntime,
    })
    const extensionCatalogImporter = new ExtensionCatalogImportService({
      packages: extensionPackages,
      events: toolEvents,
      projections: toolProjections,
      projectionRunner: toolProjectionRunner,
      unitOfWork: repositories.unitOfWork,
      skillRegistry,
    })
    const sqliteCoordinator = getSqliteConnectionCoordinator(database)
    const approvalDefaults = coordinateRepository(new SqliteApprovalDefaultRepository(database), sqliteCoordinator)
    const vectorIndexes = coordinateRepository(
      new SqliteVectorIndexRepository(database),
      sqliteCoordinator,
    )
    const storedProfile = await vectorIndexes.getActiveProfile()
    let activeProfile: VectorIndexProfile =
      storedProfile ?? (await vectorIndexes.ensureActiveProfile(Date.now()))
    await vectorIndexes.recoverInterrupted({
      profileId: activeProfile.id,
      at: Date.now(),
    })
    const privatePythonWorkerRoot =
      app.isPackaged && !process.env.ELECTRON_RENDERER_URL
        ? join(process.resourcesPath, 'dsh', 'python-workers', 'realmflow-runtime')
        : join(app.getAppPath(), 'python-service')
    const privatePythonWorkerScript =
      app.isPackaged && !process.env.ELECTRON_RENDERER_URL
        ? join(privatePythonWorkerRoot, 'realmflow_private_worker.py')
        : join(
            app.getAppPath(),
            'dsh-plugins',
            'realmflow-runtime',
            'python',
            'realmflow_private_worker.py',
          )
    const dshEmbeddingLocalPython = join(
      privatePythonWorkerRoot,
      '.venv',
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    )
    const privatePythonExecutable =
      process.env.REALMFLOW_PYTHON ||
      (existsSync(dshEmbeddingLocalPython)
        ? dshEmbeddingLocalPython
        : 'python3')
    const privatePythonWorkers = new PrivatePythonWorkerClient({
      pythonExecutable: privatePythonExecutable,
      workerRoot: privatePythonWorkerRoot,
      workerScript: privatePythonWorkerScript,
    })
    const privateWorkerStatus = {
      getStatus: () => 'ready' as const,
    }
    const dshEmbeddingProfile = createLocalDshEmbeddingProfile(
      createHash('sha256')
        .update(
          JSON.stringify({
            provider: 'local',
            model: activeProfile.embeddingModel,
            revision: activeProfile.embeddingRevision,
            dimensions: activeProfile.dimensions,
            normalization: activeProfile.normalize,
            distance: activeProfile.distance,
          }),
        )
        .digest('hex'),
    )
    const dshLocalEmbeddingService = new LocalEmbeddingService({
      profile: dshEmbeddingProfile,
      workerFactory: createDshLocalEmbeddingWorkerFactory({
        pythonExecutable: privatePythonExecutable,
        serviceRoot: privatePythonWorkerRoot,
        assetRoot: join(
          privatePythonWorkerRoot,
          'model-assets',
          'gte-multilingual-base',
        ),
      }),
    })
    const dshKnowledgeEmbedding = {
      chunkKnowledgeDocuments: (
        documents: Array<{ documentKey: string; content: string }>,
        signal: AbortSignal,
      ) =>
        dshLocalEmbeddingService.chunkKnowledgeDocuments({
          documents,
          signal,
        }),
      embedKnowledgeDocuments: async (
        documents: Array<{ id: string; text: string }>,
        signal: AbortSignal,
      ) => {
        const embedded = await dshLocalEmbeddingService.embedDocuments({
          profile: dshEmbeddingProfile,
          documents,
          signal,
        })
        return {
          embeddingModel: dshEmbeddingProfile.model,
          embeddingRevision: dshEmbeddingProfile.revision,
          dimensions: dshEmbeddingProfile.dimensions,
          embeddings: embedded.map(({ id, vector }) => ({
            id,
            embedding: vector,
          })),
        }
      },
      embedKnowledgeQuery: async (query: string, signal: AbortSignal) => {
        const [embedding] = await dshLocalEmbeddingService.embedQueries({
          profile: dshEmbeddingProfile,
          texts: [query],
          signal,
        })
        return {
          embeddingModel: dshEmbeddingProfile.model,
          embeddingRevision: dshEmbeddingProfile.revision,
          dimensions: dshEmbeddingProfile.dimensions,
          embedding,
        }
      },
    }
    const catalogIndexAdapter = new QdrantKnowledgeIndexAdapter(qdrantClient)
    const catalogSearchAdapter = new QdrantCatalogSearchAdapter(qdrantClient)
    const catalogIndex = new CatalogIndexService({
      profile: () => activeProfile,
      embedding: dshKnowledgeEmbedding,
      qdrant: {
        upsertPoints: (collection, points, signal) =>
          catalogIndexAdapter.upsertPoints(collection, points, signal),
        deletePoints: (collection, pointIds, signal) =>
          catalogIndexAdapter.deletePoints(collection, pointIds, signal),
        searchCatalog: (input) => catalogSearchAdapter.searchCatalog(input),
      },
    })
    const securePaths = new SecurePathService()
    const backupOperations = new SqliteBackupOperationRepository(database)
    const backupService = new BackupService({
      repository: backupOperations,
      coordinator: sqliteCoordinator,
      snapshot: new SqliteBackupSnapshot(database),
      catalog: new ManagedBackupCatalog(database, securePaths),
      bundle: new BackupBundleWriter(),
      applicationVersion: () => app.getVersion(),
    })
    const restoreStaging = new RestoreStagingService({
      repository: backupOperations,
      validator: new BackupBundleValidator({
        currentSchemaVersion: REALMFLOW_SCHEMA_VERSION,
      }),
      userDataPath,
    })
    const backupIpc = {
      getStatus: async () => {
        const [latestBackup, latestRestore] = await Promise.all([
          backupOperations.getLatestByKind('backup'),
          backupOperations.getLatestByKind('restore'),
        ])
        return {
          ...(latestBackup ? { latestBackup } : {}),
          ...(latestRestore ? { latestRestore } : {}),
        }
      },
      createBackup: (input: { requestId: string; destinationPath: string }) =>
        backupService.create(input),
      inspectRestore: (bundlePath: string) =>
        restoreStaging.inspect(bundlePath),
      prepareRestore: (command: {
        requestId: string
        previewId: string
        expectedChecksum: string
      }) => restoreStaging.prepare(command),
      restartForRestore: async () => {
        if (!(await restoreStaging.canRestart())) {
          throw new Error('No valid pending restore is available')
        }
        app.relaunch()
        app.exit(0)
        return true
      },
    }
    const queryModelStatistics = new QueryModelStatisticsUseCase(
      coordinateRepository(
        new SqliteModelStatisticsRepository(database),
        sqliteCoordinator,
      ),
    )
    const queryProductAnalytics = new QueryProductAnalyticsUseCase(
      coordinateRepository(
        new SqliteProductAnalyticsRepository(database),
        sqliteCoordinator,
      ),
    )
    const runtimeGovernanceRepository =
      new SqliteRuntimeGovernanceRepository(database)
    const runtimeGovernance = new RuntimeGovernanceService({
      database,
      repository: runtimeGovernanceRepository,
      evaluationRunner: new BuiltinRuntimeEvaluationRunner({ database }),
    })
    outboundCallAudit = new OutboundCallAuditService({
      repository: coordinateRepository(
        new SqliteOutboundCallRepository(database),
        sqliteCoordinator,
      ),
    })
    await outboundCallAudit.recoverInterrupted()
    const appSupport = new AppSupportService({
      currentVersion: () => app.getVersion(),
      network: networkGateway,
      audit: outboundCallAudit,
      store: coordinateRepository(
        new SqliteAppSupportRepository(database),
        sqliteCoordinator,
      ),
      unitOfWork: repositories.unitOfWork,
      openExternal: (url) => shell.openExternal(url),
    })
    const workbenchLayout = new WorkbenchLayoutService(
      coordinateRepository(
        new SqliteWorkbenchLayoutRepository(database),
        sqliteCoordinator,
      ),
    )
    const workbenchDashboard = new QueryDashboardSnapshot(
      coordinateRepository(
        new SqliteWorkbenchDashboardRepository(database),
        sqliteCoordinator,
      ),
    )
    const workbenchTasks = new ManageWorkbenchTasks(
      coordinateRepository(
        new SqliteWorkbenchTaskRepository(database),
        sqliteCoordinator,
      ),
      () => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (window.isDestroyed()) continue
          window.webContents.send(
            IPC_EVENT_CHANNELS.workbenchDashboardInvalidated,
            { reason: 'tasks', occurredAt: Date.now() },
          )
        }
      },
    )
    const workbenchAttachmentStore = new WorkbenchAttachmentStore(
      database,
      join(userDataPath, 'workbench', 'attachments'),
    )
    await workbenchAttachmentStore.reconcile().catch((error) => {
      console.error('Workbench attachment reconciliation failed', error)
    })
    const conversationAttachmentRepository =
      new SqliteConversationAttachmentRepository(database)
    await conversationAttachmentRepository.expireDrafts(
      Date.now() - 24 * 60 * 60 * 1000,
      Date.now(),
    )
    const conversationAttachmentRoot = join(
      userDataPath,
      'conversation-attachments',
    )
    const conversationAttachmentRegistry =
      new ConversationAttachmentRegistry(
        conversationAttachmentRepository,
        conversationAttachmentRoot,
      )
    const documentTextExtractor = new LocalDocumentTextExtractor()
    const localOcr = new LocalTesseractOcrAdapter({
      packageRoot: app.isPackaged
        ? join(process.resourcesPath, 'app.asar.unpacked')
        : app.getAppPath(),
    })
    const pdfAdapter = new PdfLibAdapter()
    const pdfSessions = new LocalPdfSessionService({
      adapter: pdfAdapter,
      localOcr,
      storage: new NodeSpreadsheetSessionStorage({
        metadataPath: join(userDataPath, 'pdf', 'pdf-revisions.json'),
        snapshotsRoot: join(userDataPath, 'pdf', 'pdf-snapshots'),
      }),
    })
    const fixedLayout = new FixedLayoutService({
      adapter: new FixedLayoutAdapter(),
      storage: new NodeFixedLayoutStorage(),
      localOcr,
    })
    const imageSessions = new LocalImageSessionService({
      adapter: new SharpImageAdapter(),
      localOcr,
      storage: new NodeSpreadsheetSessionStorage({
        metadataPath: join(userDataPath, 'images', 'image-revisions.json'),
        snapshotsRoot: join(userDataPath, 'images', 'image-snapshots'),
      }),
    })
    const contentExtractionCache = new FileContentExtractionCache({
      rootPath: join(userDataPath, 'content-extraction-cache'),
    })
    await contentExtractionCache.reconcile()
    const documentContentExtractor = new DocumentContentExtractor(
      documentTextExtractor,
    )
    const pdfContentExtractor = new PdfContentExtractor(pdfSessions)
    const spreadsheetContentExtractor = new SpreadsheetContentExtractor({
      extractText: async ({ bytes, format, signal }) => {
        const response = await privatePythonWorkers.computeSpreadsheet(
          {
            format,
            operation: 'extract_text',
            documentBase64: Buffer.from(bytes).toString('base64'),
            parameters: {},
          },
          signal,
        )
        return response.result as {
          sheets: Array<{
            name: string
            rows: string[][]
            nonEmptyCellCount: number
          }>
        }
      },
    })
    const presentationContentExtractor = new PresentationContentExtractor({
      extractText: async ({ bytes, signal }) => {
        const response = await privatePythonWorkers.computePresentation(
          {
            format: 'pptx',
            operation: 'extract_text',
            documentBase64: Buffer.from(bytes).toString('base64'),
            parameters: {},
          },
          signal,
        )
        return response.result as {
          slides: Array<{
            number: number
            title: string
            text: string[]
            tables: string[][]
            chartLabels: string[]
            notes: string
          }>
        }
      },
    })
    const modernOfficeContent: ModernOfficeContentPort = {
      extract: (format, input) => {
        if (format === 'docx') return documentContentExtractor.extract(input)
        if (format === 'xlsx') {
          return spreadsheetContentExtractor.extract(input)
        }
        return presentationContentExtractor.extract(input)
      },
    }
    let legacyOfficeImporter: LegacyOfficeImportService
    let officeSafeCopy: OfficeSafeCopyService
    const archiveAdapter = new ArchiveAdapter()
    let localContentExtraction: LocalContentExtractionService
    localContentExtraction = new LocalContentExtractionService({
      cache: contentExtractionCache,
      extractors: [
        new TextContentExtractor(),
        documentContentExtractor,
        pdfContentExtractor,
        spreadsheetContentExtractor,
        presentationContentExtractor,
        new FixedLayoutContentExtractor(fixedLayout),
        new ImageOcrContentExtractor(imageSessions),
        new LegacyOfficeContentExtractor(
          {
            convertBytes: (input) =>
              legacyOfficeImporter.convertBytes(input),
          },
          modernOfficeContent,
        ),
        new OfficeConversionContentExtractor(
          {
            convertBytes: (input) =>
              legacyOfficeImporter.convertBytes(input),
          },
          modernOfficeContent,
        ),
        new OfficeSanitizedContentExtractor(
          {
            sanitizeBytes: (input) => officeSafeCopy.sanitizeBytes(input),
          },
          modernOfficeContent,
        ),
        new ArchiveContentExtractor(archiveAdapter, {
          extract: (input) => localContentExtraction.extract(input),
        }),
        new EcosystemContentExtractor({
          converter: {
            convertBytes: (input) =>
              legacyOfficeImporter.convertBytes(input),
          },
          modern: modernOfficeContent,
          children: {
            extract: (input) => localContentExtraction.extract(input),
          },
        }),
        new CapabilityProbeContentExtractor({
          capabilities: () =>
            privatePythonWorkers.getOfficeConversionCapabilities(
              new AbortController().signal,
            ),
          convert: async ({
            bytes,
            sourceFormat,
            outputFormat,
            signal,
          }) => {
            const result = await privatePythonWorkers.convertOptionalOffice(
              {
                sourceFormat,
                documentBase64: Buffer.from(bytes).toString('base64'),
              },
              signal,
            )
            if (result.outputFormat !== outputFormat) {
              throw new Error('Optional Office output format mismatch')
            }
            return {
              bytes: Uint8Array.from(
                Buffer.from(result.documentBase64, 'base64'),
              ),
              outputFormat: result.outputFormat,
            }
          },
          modern: {
            extract: (format, input) => {
              if (format === 'pdf') {
                return pdfContentExtractor.extract(input)
              }
              return modernOfficeContent.extract(format, input)
            },
          },
        }),
      ],
    })
    const workbenchAttachments = new ManageWorkbenchAttachments({
      store: workbenchAttachmentStore,
      picker: dialog,
      shell,
      contentExtractor: localContentExtraction,
    })
    const documentDeliveryJournal = coordinateRepository(
      new SqliteDocumentDeliveryRepository(database),
      sqliteCoordinator,
    )
    const documentDeliveryStorage = new NodeSpreadsheetSessionStorage({
      metadataPath: join(
        userDataPath,
        'office',
        'document-delivery-revisions.json',
      ),
      snapshotsRoot: join(userDataPath, 'office', 'document-delivery'),
    })
    const docxPdfBackend = createSidecarDocxPdfBackend({
      exportDocumentPdf: (input, signal) =>
        privatePythonWorkers.exportDocumentPdf(input, signal),
    })
    const pdfGeneration = new PdfGenerationService({
      storage: documentDeliveryStorage,
      backends: {
        libreoffice_docx_pdf: docxPdfBackend,
        cupsfilter_docx_text_pdf: docxPdfBackend,
        chromium_html_pdf: new HtmlChromiumPdfBackend({
          printToPdf: printHtmlToPdfWithElectron,
          renderFirstPage: async (pdf, pageNumber, signal) => {
            if (signal.aborted) throwAbortError('PDF generation was cancelled')
            return pdfAdapter.renderPage(pdf, pageNumber, 512)
          },
        }),
        pdf_lib_session_save_as: createPdfSessionSaveAsBackend(pdfSessions),
      },
      getReadiness: async () => {
        const checkedAt = Date.now()
        const libreOffice =
          await legacyOfficeRuntimeCapability.getPdfGenerationLibreOfficeReadiness()
        return {
          checkedAt,
          backends: {
            ...libreOffice,
            cupsfilter_docx_text_pdf:
              await detectCupsfilterPdfReadiness(checkedAt),
            chromium_html_pdf: {
              status: 'ready' as const,
              reasonCode: 'electron_chromium_ready',
              quality: 'visual_print' as const,
            },
            pdf_lib_session_save_as: {
              status: 'ready' as const,
              reasonCode: 'pdf_session_service_ready',
              quality: 'edit_preserve' as const,
            },
          },
        }
      },
    })
    const documentDelivery = new DocumentDeliveryService({
      engine: {
        createDocument: (input, signal) =>
          privatePythonWorkers.createDocument(input, signal),
        exportDocumentPdf: (input, signal) =>
          privatePythonWorkers.exportDocumentPdf(input, signal),
        verifyDocumentArtifact: (input, signal) =>
          privatePythonWorkers.verifyDocumentArtifact(input, signal),
      },
      storage: documentDeliveryStorage,
      journal: documentDeliveryJournal,
      artifacts: repositories.artifacts,
      pdfGeneration,
    })
    await documentDelivery.recover()
    const spreadsheetSessions = new LocalSpreadsheetSessionService({
      compute: (input, signal) =>
        privatePythonWorkers.computeSpreadsheet(input, signal),
      recalculate: (input, signal) =>
        privatePythonWorkers.recalculateSpreadsheet(input, signal),
      storage: new NodeSpreadsheetSessionStorage({
        metadataPath: join(
          userDataPath,
          'office',
          'spreadsheet-revisions.json',
        ),
        snapshotsRoot: join(userDataPath, 'office', 'spreadsheet-snapshots'),
      }),
    })
    const wordSessions = new LocalWordSessionService({
      compute: (input, signal) =>
        privatePythonWorkers.computeWordDocument(input, signal),
      storage: new NodeSpreadsheetSessionStorage({
        metadataPath: join(
          userDataPath,
          'office',
          'word-document-revisions.json',
        ),
        snapshotsRoot: join(userDataPath, 'office', 'word-document-snapshots'),
      }),
    })
    const presentationSessions = new LocalPresentationSessionService({
      compute: (input, signal) =>
        privatePythonWorkers.computePresentation(input, signal),
      storage: new NodeSpreadsheetSessionStorage({
        metadataPath: join(
          userDataPath,
          'office',
          'presentation-revisions.json',
        ),
        snapshotsRoot: join(userDataPath, 'office', 'presentation-snapshots'),
      }),
    })
    legacyOfficeImporter = new LegacyOfficeImportService({
      convert: (input, signal) =>
        privatePythonWorkers.convertLegacyOffice(input, signal),
      storage: new NodeSpreadsheetSessionStorage({
        metadataPath: join(
          userDataPath,
          'office',
          'legacy-office-import-revisions.json',
        ),
        snapshotsRoot: join(
          userDataPath,
          'office',
          'legacy-office-import-snapshots',
        ),
      }),
      sessions: {
        word: wordSessions,
        spreadsheet: spreadsheetSessions,
        presentation: presentationSessions,
      },
    })
    officeSafeCopy = new OfficeSafeCopyService({
      sanitize: (input, signal) =>
        privatePythonWorkers.createSafeOfficeCopy(input, signal),
      storage: new NodeSpreadsheetSessionStorage({
        metadataPath: join(
          userDataPath,
          'office',
          'safe-copy-revisions.json',
        ),
        snapshotsRoot: join(
          userDataPath,
          'office',
          'safe-copy-snapshots',
        ),
      }),
      sessions: {
        word: wordSessions,
        spreadsheet: spreadsheetSessions,
        presentation: presentationSessions,
      },
    })
    const officeReadOnlySessions = new OfficeReadOnlySessionService({
      word: wordSessions,
      spreadsheet: spreadsheetSessions,
      presentation: presentationSessions,
    })
    const archives = new ArchiveService({
      adapter: archiveAdapter,
      storage: new NodeArchiveStorage(),
    })
    const conversationInputPreprocessor = new ConversationInputPreprocessor(
      conversationAttachmentRepository,
      conversationAttachmentRoot,
      { contentExtractor: localContentExtraction },
    )
    const conversationAttachmentChunks =
      new ConversationAttachmentChunkReader(
        conversationAttachmentRepository,
      )
    const workbenchSites = new ManageWorkbenchSites(
      coordinateRepository(
        new SqliteWorkbenchSiteRepository(database),
        sqliteCoordinator,
      ),
    )
    const workbenchMemos = new ManageWorkbenchMemos(
      coordinateRepository(
        new SqliteWorkbenchMemoRepository(database),
        sqliteCoordinator,
      ),
    )
    const credentialVault = await CredentialVault.open(
      join(userDataPath, 'model-credentials.key'),
      {
        allowCreate: (await repositories.modelCredentials.list()).length === 0,
      },
    )
    webProviderRepository = new SqliteWebProviderRepository(database)
    const webProviders = new WebProviderConfigurationService({
      store: webProviderRepository,
      vault: await CredentialVault.open(join(userDataPath, 'web-credentials.key'), {
        allowCreate: !webProviderRepository.get().hasBraveCredential,
      }),
    })
    mcpServerRepository = new SqliteMcpServerRepository(database)
    let mcpServers!: McpServerService
    const mcpClients = new SdkMcpClientFactory({
      credentials: {
        resolve: (credentialId) => mcpServers.resolveCredential(credentialId),
      },
      audit: {
        start: async ({ serverId }) => {
          const record = await requireOutboundCallAudit().start({
            idempotencyKey: `mcp-connect:${serverId}:${randomUUID()}`,
            callType: 'mcp',
            target: { type: 'mcp_server', id: serverId },
            owner: { type: 'application', id: 'realmflow' },
          })
          return record.id
        },
        finish: async (auditId, status) => {
          await requireOutboundCallAudit().finish(auditId, {
            status,
            retryCount: 0,
            ...(status === 'failed' ? { errorCode: 'target_unavailable' } : {}),
          })
        },
      },
    })
    const mcpDiscovery = new McpDiscoveryService({
      clients: mcpClients,
      publisher: new McpCatalogPublisher({
        events: toolEvents,
        projections: toolProjectionRunner,
      }),
    })
    mcpServers = new McpServerService({
      store: mcpServerRepository,
      vault: credentialVault,
      clients: mcpClients,
      discovery: mcpDiscovery,
    })
    const connectorRepository = coordinateRepository(
      new SqliteConnectorRepository(database),
      sqliteCoordinator,
    )
    const connectors = new ConnectorService({
      store: connectorRepository,
      vault: credentialVault,
      network: networkGateway,
    })
    const modelService = new ModelService({
      modelPool: repositories.modelPool,
      modelDefaults: repositories.modelDefaults,
      credentials: repositories.modelCredentials,
      credentialKeyRotations: repositories.modelCredentialKeyRotations,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      availabilityChecks: repositories.modelAvailabilityChecks,
      availabilityProbe: networkGateway,
      unitOfWork: repositories.unitOfWork,
      vault: credentialVault,
    })
    const providerDiscovery = new ProviderDiscoveryService({
      environment: process.env,
      homeDirectory: homedir(),
      readTextFile: (path) => readFile(path, 'utf8'),
    })
    const catalogReconciliation =
      await modelService.reconcileBuiltinProviderCatalogs()
    for (const result of catalogReconciliation) {
      if (result.outcome === 'failed') {
        console.error(
          `Model catalog reconciliation failed for ${result.providerId}: ${result.message}`,
        )
      }
    }
    const workspace = new WorkspaceService(
      coordinateRepository(
        new SqliteWorkspaceMetadataStore(database),
        sqliteCoordinator,
      ),
    )
    const conversationAttachments = new ManageConversationAttachments({
      picker: dialog,
      registry: conversationAttachmentRegistry,
      repository: conversationAttachmentRepository,
      workspace,
    })
    let liveModelSkillRuntime: ModelSkillExecutionRuntime | undefined
    const deferredToolRuntime = {
      prepare: async () => {
        throw new Error('DSH owns scheduled Tool execution')
      },
      execute: async () => ({
        outcome: 'executed' as const,
        execution: {
          id: `dsh-owned-tool-${randomUUID()}`,
          status: 'failed' as const,
          error: { code: 'dsh_tool_runtime_unavailable' },
          finishedAt: Date.now(),
        },
      }),
    }
    const requireModelSkillRuntime = (): ModelSkillExecutionRuntime => {
      if (!liveModelSkillRuntime) {
        throw new Error('Model Skill runtime is not initialized')
      }
      return liveModelSkillRuntime
    }
    const deferredModelSkillRuntime = {
      prepare: (
        command: Parameters<ModelSkillExecutionRuntime['prepare']>[0],
      ) => requireModelSkillRuntime().prepare(command),
      execute: (
        command: Parameters<ModelSkillExecutionRuntime['execute']>[0],
      ) => requireModelSkillRuntime().execute(command),
    }
    const scheduleStore = coordinateRepository(
      new SqliteScheduleRepository(database),
      sqliteCoordinator,
    )
    const schedules = new ScheduleService({
      store: scheduleStore,
      models: repositories.modelPool,
      tools: deferredToolRuntime,
      skills: deferredModelSkillRuntime,
      getModelExecution: async (id) => {
        const run = await agentRuntimeRuns.getById(id)
        return run ? { id, status: run.status, finishedAt: run.updatedAt } : undefined
      },
      onScheduleChanged: () => scheduleScheduler?.refresh(),
    })
    await schedules.recoverInterrupted()
    scheduleScheduler = new CronScheduleScheduler({
      store: scheduleStore,
      planner: new CronSchedulePlanner(),
      runScheduled: (command) => schedules.runScheduled(command),
    })
    const selectWorkRoot = new SelectWorkRootUseCase(
      repositories.workRoots,
      workspace,
    )
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      workspace,
    )
    const createRequirement = new CreateRequirementUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      repositories.nodeRuns,
      repositories.nodeTodos,
      repositories.unitOfWork,
      workspace,
    )
    const manageWorkflowTemplates = new ManageWorkflowTemplatesUseCase(
      repositories.workflowTemplates,
      Date.now,
      catalogIndex,
    )
    const updateSpace = new UpdateSpaceUseCase(repositories.workspaces)
    const updateRequirement = new UpdateRequirementUseCase(
      repositories.requirements,
    )
    const knowledgeSourceRepository = coordinateRepository(
      new SqliteKnowledgeSourceRepository(database),
      sqliteCoordinator,
    )
    const knowledgeSources = new KnowledgeSourceService({
      workspaces: repositories.workspaces,
      repository: knowledgeSourceRepository,
      localFiles: knowledgeSourceRepository,
    })
    await knowledgeSources.recoverInterrupted()
    const repositoryIngestionStore = coordinateRepository(
      new SqliteRepositoryIngestionStore(database),
      sqliteCoordinator,
    )
    const repositoryIngestion = new RepositoryIngestionService({
      workspaces: repositories.workspaces,
      workspaceFiles: workspace,
      connectors,
      store: repositoryIngestionStore,
      knowledgeSources,
      contentExtractor: localContentExtraction,
    })
    await repositoryIngestion.recover()
    const onlineDocuments = new OnlineDocumentSnapshotService({
      workspaces: repositories.workspaces,
      connectors,
      store: knowledgeSourceRepository,
      contentExtractor: localContentExtraction,
    })
    const localFileIngestion = new LocalFileIngestionService({
      workspaces: repositories.workspaces,
      workspaceFiles: workspace,
      knowledgeSources,
    })
    await localFileIngestion.recover()
    const artifactRepository = coordinateRepository(
      new SqliteArtifactRepository(database),
      sqliteCoordinator,
    )
    const requirementMemories = coordinateRepository(
      new SqliteRequirementMemoryRepository(database),
      sqliteCoordinator,
    )
    const knowledgeNotes = coordinateRepository(
      new SqliteKnowledgeNoteRepository(database),
      sqliteCoordinator,
    )
    const knowledgeIndexReader = new MainKnowledgeIndexSourceReader({
      sources: knowledgeSourceRepository,
      localFiles: knowledgeSourceRepository,
      onlineDocuments: knowledgeSourceRepository,
      repositories: repositoryIngestionStore,
      workspaces: repositories.workspaces,
      artifacts: artifactRepository,
      requirementMemories,
      knowledgeNotes,
      contentExtractor: localContentExtraction,
    })
    const knowledgeIndexCoordinator = new KnowledgeIndexCoordinator({
      repository: vectorIndexes,
      reader: knowledgeIndexReader,
    })
    const qdrantIndex = new QdrantKnowledgeIndexAdapter(qdrantClient)
    const indexMaintenance = coordinateRepository(
      new SqliteIndexMaintenanceRepository(database),
      sqliteCoordinator,
    )
    const workspaceCleanup = new WorkspaceQdrantCleanupService({
      repository: indexMaintenance,
      qdrant: qdrantIndex,
    })
    const scheduleWorkspaceCleanup = (delayMs = 0): void => {
      if (workspaceCleanupTimer || workspaceCleanupRun) return
      workspaceCleanupTimer = setTimeout(() => {
        workspaceCleanupTimer = undefined
        let retry = false
        workspaceCleanupRun = (async () => {
          while (true) {
            const result = await workspaceCleanup.runOnce()
            if (result.status === 'completed') continue
            if (result.status === 'retry_scheduled') {
              retry = true
            }
            return
          }
        })()
          .catch((error: unknown) => {
            console.error('Workspace knowledge cleanup failed', error)
            retry = true
          })
          .finally(() => {
            workspaceCleanupRun = undefined
            if (retry) scheduleWorkspaceCleanup(60_000)
          })
      }, delayMs)
    }
    const createKnowledgeIndexWorker = (profile: VectorIndexProfile) =>
      new KnowledgeIndexWorker({
        repository: vectorIndexes,
        reader: knowledgeIndexReader,
        embedding: dshKnowledgeEmbedding,
        qdrant: qdrantIndex,
        profile,
      })
    const createKnowledgeIndexGarbageCollector = (
      profile: VectorIndexProfile,
    ) =>
      new KnowledgeIndexGarbageCollector({
        repository: vectorIndexes,
        qdrant: qdrantIndex,
        profile,
      })
    const createKnowledgeIndexRecovery = (
      profile: VectorIndexProfile,
      garbageCollector: KnowledgeIndexGarbageCollector,
    ) =>
      new KnowledgeIndexRecoveryService({
        repository: vectorIndexes,
        qdrant: qdrantIndex,
        garbageCollector,
        profile,
      })
    const catalogStartup = {
      listStartupSyncTargets: async () => {
        const templates = await repositories.workflowTemplates.listTemplates()
        return templates.map((template) => ({
          kind: 'workflow_template' as const,
          id: template.id,
        }))
      },
      syncStartupTarget: async (target: {
        kind: 'workflow_template' | 'skill'
        id: string
      }) => {
        if (target.kind === 'workflow_template') {
          const template = await repositories.workflowTemplates.getTemplate(
            target.id,
          )
          if (!template) throw new Error('Workflow template not found')
          await catalogIndex.syncWorkflowTemplate(template)
          return
        }
        throw new Error('Skill catalog startup sync is not available')
      },
    }
    const createStartupKnowledgeRebuild = (
      profile: VectorIndexProfile,
      worker: KnowledgeIndexWorker,
    ) =>
      new StartupKnowledgeRebuildService({
        repository: vectorIndexes,
        reader: knowledgeIndexReader,
        coordinator: knowledgeIndexCoordinator,
        worker,
        catalog: catalogStartup,
      })
    const fullRebuildMarker = await indexMaintenance.getFullRebuildMarker()
    const knowledgeStartupRecovery =
      new KnowledgeIndexStartupRecoveryCoordinator({
        repository: vectorIndexes,
        collections: qdrantCollections,
        fullRebuilder: {
          rebuildAll: async (profile) => {
            activeProfile = profile
            const worker = createKnowledgeIndexWorker(profile)
            const garbageCollector =
              createKnowledgeIndexGarbageCollector(profile)
            await createKnowledgeIndexRecovery(
              profile,
              garbageCollector,
            ).recover()
            await createStartupKnowledgeRebuild(profile, worker).recover(
              profile,
              { requireSuccess: true },
            )
          },
        },
      })
    try {
      const startupRecoveryResult = await knowledgeStartupRecovery.recover()
      activeProfile = startupRecoveryResult.profile
    } catch {
      const recoveredProfile = await vectorIndexes.getActiveProfile()
      if (!recoveredProfile) {
        throw new Error('Vector index profile recovery failed')
      }
      activeProfile = recoveredProfile
      console.error('Vector index profile recovery is pending', {
        errorCode: 'vector_index_recovery_pending',
      })
    }
    knowledgeIndexWorker = createKnowledgeIndexWorker(activeProfile)
    const knowledgeIndexGarbageCollector =
      createKnowledgeIndexGarbageCollector(activeProfile)
    const knowledgeIndexRecovery = createKnowledgeIndexRecovery(
      activeProfile,
      knowledgeIndexGarbageCollector,
    )
    await knowledgeIndexRecovery.recover()
    const startupKnowledgeRebuild = createStartupKnowledgeRebuild(
      activeProfile,
      knowledgeIndexWorker,
    )
    knowledgeStartupRebuildRun = startupKnowledgeRebuild
      .recover(activeProfile)
      .then(async (result) => {
        if (
          fullRebuildMarker?.status === 'pending' &&
          result.workspace.failed === 0 &&
          result.catalog.failed === 0
        ) {
          await indexMaintenance.completeFullRebuild({
            requestId: fullRebuildMarker.requestId,
          })
        }
      })
      .catch(() => {
        console.error('Startup knowledge rebuild is pending', {
          errorCode: 'knowledge_rebuild_pending',
        })
      })
      .finally(() => {
        knowledgeStartupRebuildRun = undefined
      })
    await knowledgeStartupRecovery.deleteDueCollections()
    const drainKnowledgeIndexJobs = async (): Promise<void> => {
      while (knowledgeIndexWorker) {
        const result = await knowledgeIndexWorker.runNext()
        if (
          result === 'idle' ||
          result === 'busy' ||
          result === 'interrupted'
        ) {
          if (result === 'idle') {
            await knowledgeIndexGarbageCollector.collect()
          }
          return
        }
      }
    }
    const scheduleKnowledgeIndexDrain = (): void => {
      void drainKnowledgeIndexJobs().catch((error: unknown) => {
        console.error('Knowledge index worker failed', error)
      })
    }
    const runLocalFileIngestion = (
      ingest: () => ReturnType<LocalFileIngestionService['ingest']>,
    ) =>
      runLocalFileIngestionWithIndexDispatch({
        ingest,
        enqueue: (input) => knowledgeIndexCoordinator.enqueue(input),
        scheduleDrain: scheduleKnowledgeIndexDrain,
      })
    const runRepositoryIngestion = (
      ingest: () => ReturnType<RepositoryIngestionService['ingestLocal']>,
    ) =>
      runRepositoryIngestionWithIndexDispatch({
        ingest,
        enqueue: (input) => knowledgeIndexCoordinator.enqueue(input),
        scheduleDrain: scheduleKnowledgeIndexDrain,
      })
    const knowledgeNoteService = new KnowledgeNoteService({
      sessions: repositories.chatSessions,
      repository: knowledgeNotes,
      coordinator: {
        enqueueSnapshot: async (snapshot, triggerSource) => {
          const result = await knowledgeIndexCoordinator.enqueueSnapshot(
            snapshot,
            triggerSource,
          )
          scheduleKnowledgeIndexDrain()
          return result
        },
      },
      visibility: {
        hide: async () => {
          await knowledgeIndexGarbageCollector.collect()
        },
      },
    })
    const knowledgeRefreshRepository = coordinateRepository(
      new SqliteKnowledgeRefreshRepository(database),
      sqliteCoordinator,
    )
    const knowledgeRefresh = new KnowledgeRefreshService({
      repository: knowledgeRefreshRepository,
      sources: knowledgeSourceRepository,
      reader: knowledgeIndexReader,
      indexes: {
        hasCurrentIndex: async (input) => {
          const current = await vectorIndexes.getCurrentGenerationBySource({
            sourceId: input.sourceId,
            profileId: activeProfile.id,
          })
          return current?.sourceChecksum === input.sourceChecksum
        },
      },
      probes: {
        file: (sourceId) => localFileIngestion.probe(sourceId),
        document: (sourceId, idempotencyKey) =>
          onlineDocuments.probe(sourceId, idempotencyKey),
        repository: (sourceId, idempotencyKey) =>
          repositoryIngestion.probe(sourceId, idempotencyKey),
      },
      refreshers: {
        file: (command) => localFileIngestion.refresh(command),
        document: (command) => onlineDocuments.sync(command),
        repository: (command) => repositoryIngestion.refresh(command),
      },
      coordinator: knowledgeIndexCoordinator,
      planner: new CronSchedulePlanner(),
      onIndexQueued: scheduleKnowledgeIndexDrain,
      onScheduleChanged: () => knowledgeRefreshScheduler?.refresh(),
    })
    const knowledgeRuntimeHealth = new KnowledgeRuntimeHealthService({
      profile: activeProfile,
      qdrant: qdrantCollections,
      embedding: {
        getEmbeddingModelHealth: () =>
          dshLocalEmbeddingService.getEmbeddingModelHealth(),
      },
    })
    const systemStatusStore = new SqliteSystemStatusRepository(database)
    const workbenchSystem = new QuerySystemStatus({
      resources: new SystemResourceSampler({ diskPath: userDataPath }),
      sidecar: privateWorkerStatus,
      knowledge: knowledgeRuntimeHealth,
      sqlite: systemStatusStore,
      backgroundJobs: systemStatusStore,
    })
    await knowledgeRefresh.recover()
    knowledgeRefreshScheduler = new KnowledgeRefreshScheduler({
      store: knowledgeRefreshRepository,
      planner: new CronSchedulePlanner(),
      execute: (runId) => knowledgeRefresh.runClaimed(runId),
    })
    const knowledgeIndex = {
      get: async (sourceId: string) => {
        const source = await knowledgeSourceRepository.get(sourceId)
        if (!source) throw new Error('Knowledge source not found')
        const [generation, job, documentStates] = await Promise.all([
          vectorIndexes.getCurrentGenerationBySource({
            sourceId,
            profileId: activeProfile.id,
          }),
          vectorIndexes.getLatestJobBySource({
            sourceId,
            profileId: activeProfile.id,
          }),
          source.type === 'repository'
            ? vectorIndexes.listDocumentStates({
                sourceId,
                profileId: activeProfile.id,
              })
            : Promise.resolve([]),
        ])
        const activeJob =
          job && ['pending', 'running', 'qdrant_written'].includes(job.status)
        const failedDocument = documentStates.some(
          ({ status }) => status === 'failed',
        )
        const activeDocument = documentStates.some(
          ({ status }) => status === 'pending' || status === 'indexing',
        )
        return {
          source,
          health:
            activeJob || activeDocument
              ? ('building' as const)
              : failedDocument || job?.status === 'failed'
                ? ('failed' as const)
                : generation
                  ? ('ready' as const)
                  : ('missing' as const),
          ...(generation ? { index: generation } : {}),
          ...(job ? { job } : {}),
        }
      },
      build: async (command: {
        sourceId: string
        expectedRevision: number
      }) => {
        const source = await knowledgeSourceRepository.get(command.sourceId)
        if (!source) throw new Error('Knowledge source not found')
        if (source.revision !== command.expectedRevision) {
          throw new Error('Knowledge source revision conflict')
        }
        const enqueued = await knowledgeIndexCoordinator.enqueue({
          sourceId: command.sourceId,
          triggerSource: 'manual',
        })
        scheduleKnowledgeIndexDrain()
        return {
          ...(await knowledgeIndex.get(command.sourceId)),
          status: enqueued.status,
          jobId: enqueued.job.id,
        }
      },
    }
    const knowledgeSourceQueries = new KnowledgeSourceQueryService({
      sources: knowledgeSources,
      refresh: knowledgeRefreshRepository,
      indexes: knowledgeIndex,
      repositories: repositoryIngestionStore,
    })
    const knowledgeSearchStore = coordinateRepository(
      new SqliteKnowledgeSearchStore(database),
      sqliteCoordinator,
    )
    const knowledgeSearch = new HybridKnowledgeSearchService({
      profile: activeProfile,
      store: knowledgeSearchStore,
      sidecar: {
        embedKnowledgeQuery: (query, signal) =>
          dshKnowledgeEmbedding.embedKnowledgeQuery(query, signal),
      },
      qdrant: new QdrantKnowledgeSearchAdapter(
        qdrantClient,
        activeProfile.workspaceCollection,
      ),
      lexical: {
        search: (input) => knowledgeSearchStore.searchLexical(input),
      },
    })
    const directoryRenamePolicy = new ManagedDirectoryRenamePolicyService(
      workspace,
    )
    const renameSpaceDirectory = new RenameSpaceDirectoryUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      workspace,
      directoryRenamePolicy,
    )
    const renameRequirementDirectory = new RenameRequirementDirectoryUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      workspace,
      directoryRenamePolicy,
    )
    const relocateSpace = new RelocateSpaceUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      workspace,
    )
    const deleteSpace = new DeleteSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      workspace,
    )
    const deleteRequirement = new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      workspace,
    )
    const restoreSpace = new RestoreSpaceUseCase(
      repositories.workspaces,
      repositories.unitOfWork,
      workspace,
    )
    const restoreRequirement = new RestoreRequirementUseCase(
      repositories.requirements,
      repositories.unitOfWork,
      workspace,
    )
    const listTrashItems = new ListTrashItemsUseCase(repositories.trash)
    const purgeSpace = new PurgeSpaceUseCase(
      repositories.trash,
      repositories.unitOfWork,
      workspace,
    )
    const purgeRequirement = new PurgeRequirementUseCase(
      repositories.trash,
      repositories.unitOfWork,
      workspace,
    )
    const startedNodeProtection = new StartedNodeProtection({
      nodeRuns: repositories.nodeRuns,
      artifacts: repositories.artifacts,
    })
    const templateMigrations = new TemplateMigrationService({
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      templates: repositories.workflowTemplates,
      nodeProtection: startedNodeProtection,
      nodeRuns: repositories.nodeRuns,
      todos: repositories.nodeTodos,
      migrationRecords: repositories.templateMigrations,
      unitOfWork: repositories.unitOfWork,
    })
    const workflowRuntime = new WorkflowRuntime(
      repositories.requirementWorkflows,
      startedNodeProtection,
    )
    const manageRequirementWorkflow = new ManageRequirementWorkflowUseCase({
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      todos: repositories.nodeTodos,
      nodeProtection: startedNodeProtection,
      unitOfWork: repositories.unitOfWork,
    })
    const commitFormalArtifact = new CommitFormalArtifactUseCase(
      artifactRepository,
    )
    const syncRequirementArtifacts = new SyncRequirementArtifactsUseCase({
      requirements: {
        get: async (id) => {
          const requirement = await repositories.requirements.get(id)
          return requirement
            ? {
                id: requirement.id,
                workspaceId: requirement.workspaceId,
                status: requirement.status,
                syncCompletedArtifactsToKnowledge:
                  requirement.syncCompletedArtifactsToKnowledge ?? false,
              }
            : undefined
        },
      },
      artifacts: artifactRepository,
      contentExtractor: localContentExtraction,
      coordinator: {
        enqueueSnapshot: async (snapshot, triggerSource) => {
          const result = await knowledgeIndexCoordinator.enqueueSnapshot(
            snapshot,
            triggerSource,
          )
          scheduleKnowledgeIndexDrain()
          return result
        },
      },
    })
    const requirementMemory = new RequirementMemoryService({
      requirements: repositories.requirements,
      readRequirementBody: async (requirementId) => {
        const requirement = await repositories.requirements.get(requirementId)
        if (!requirement?.bodyRelativePath) return ''
        return (
          await workspace.readFile(requirementId, requirement.bodyRelativePath)
        ).content
      },
      executions: repositories.workflowExecutions,
      nodeRuns: {
        listLatestByExecution: async (executionId) =>
          repositories.nodeRuns.listLatestByExecution!(executionId),
      },
      questions: repositories.nodeQuestions,
      artifacts: repositories.artifacts,
      memories: requirementMemories,
      coordinator: {
        enqueueSnapshot: async (snapshot, triggerSource) => {
          const result = await knowledgeIndexCoordinator.enqueueSnapshot(
            snapshot,
            triggerSource,
          )
          scheduleKnowledgeIndexDrain()
          return result
        },
      },
    })
    const syncRequirementKnowledge = {
      execute: async (requirementId: string) => {
        const artifacts = await syncRequirementArtifacts.execute(requirementId)
        try {
          const memory = await requirementMemory.syncCompleted(requirementId)
          return {
            synced: artifacts.synced + (memory.status === 'enqueued' ? 1 : 0),
            skipped:
              artifacts.skipped +
              (memory.status === 'replayed' || memory.status === 'skipped'
                ? 1
                : 0),
            failed: artifacts.failed,
          }
        } catch {
          return { ...artifacts, failed: artifacts.failed + 1 }
        }
      },
    }
    const nodeCompletionGateEvaluator = new NodeCompletionGateEvaluator({
      artifacts: repositories.artifacts,
      todos: repositories.nodeTodos,
      questions: repositories.nodeQuestions,
      approvals: repositories.nodeApprovals,
    })
    const manageNodeExecution = new ManageNodeExecutionUseCase({
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      todos: repositories.nodeTodos,
      dispatches: repositories.workflowDispatches,
      completionGates: nodeCompletionGateEvaluator,
      unitOfWork: repositories.unitOfWork,
      knowledgeSync: syncRequirementKnowledge,
    })
    const setWorkflowParallelism = new SetWorkflowParallelismUseCase({
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      dispatches: repositories.workflowDispatches,
      unitOfWork: repositories.unitOfWork,
    })
    let cancelAiRun: CancelAiRunUseCase | undefined
    const rollbackCancel = {
      execute: async (runId: string, options?: { forceProvider?: boolean }) => {
        const initializedCancelAiRun = cancelAiRun
        if (!initializedCancelAiRun) {
          throw new Error('AI run cancellation is not initialized')
        }
        await initializedCancelAiRun.execute(runId, options)
      },
    }
    const rollbackCoordinator = new CoordinateWorkflowRollbackUseCase({
      workflowRollbacks: repositories.workflowRollbacks,
      cancel: rollbackCancel,
      knowledgeSync: syncRequirementKnowledge,
    })
    const rollbackWorkflowToNode = new RollbackWorkflowToNodeUseCase({
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      todos: repositories.nodeTodos,
      artifacts: repositories.artifacts,
      dispatches: repositories.workflowDispatches,
      workflowRollbacks: repositories.workflowRollbacks,
      workflowAudit: repositories.workflowAudit,
      unitOfWork: repositories.unitOfWork,
      cancel: rollbackCancel,
      knowledgeSync: syncRequirementKnowledge,
      requirementMemory: requirementMemories,
      coordinator: rollbackCoordinator,
    })
    const manageNodeTodos = new ManageNodeTodosUseCase({
      nodeRuns: repositories.nodeRuns,
      todos: repositories.nodeTodos,
      unitOfWork: repositories.unitOfWork,
    })
    const manageNodeQuestions = new ManageNodeQuestionsUseCase({
      questions: repositories.nodeQuestions,
      nodeRuns: repositories.nodeRuns,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      unitOfWork: repositories.unitOfWork,
    })
    const getRequirementExecutionView = new GetRequirementExecutionViewUseCase({
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      todos: repositories.nodeTodos,
      questions: repositories.nodeQuestions,
      approvals: repositories.nodeApprovals,
      artifacts: repositories.artifacts,
      contextSnapshots: repositories.contextSnapshots,
      models: repositories.modelPool,
      conversations: repositories.chatSessions,
      unitOfWork: repositories.unitOfWork,
    })
    const contextSources = coordinateRepository(
      new SqliteContextSources(database, workspace, knowledgeSearch),
      sqliteCoordinator,
    )
    const spaceConversationContext = new SpaceConversationContextAssembler(
      knowledgeSearch,
    )
    const agentRuntimeRuns = new SqliteAgentRuntimeRunRepository(database)
    const agentRuntimeState = new RuntimeStateService(new SqliteAgentRuntimeStateRepository(database))
    const agentRuntimeBudgets = new SqliteAgentRuntimeBudgetRepository(database)
    const agentDelegationStore = new SqliteAgentDelegationRepository(database)
    let dshRunGateway!: DshAiRunGateway
    const agentDelegations: RuntimeDelegationService = new RuntimeDelegationService({
      store: agentDelegationStore,
      runTask: (record, signal) => dshRunGateway.runDelegated(record, signal),
      finalizeArtifacts: (record, status) => conversationGeneratedArtifacts.finalizeRun({
        runId: record.runId, conversationId: record.sessionId, assistantMessageId: `${record.runId}:assistant`, status
      }),
    })
    const agentOrchestrator = new AgentRuntimeOrchestrator({
      runs: {
        get: async (id) => agentRuntimeRuns.getById(id),
        listByRoot: (id) => agentRuntimeRuns.listByRootRunId(id),
      },
      sessions: repositories.chatSessions,
      state: agentRuntimeState,
      delegations: agentDelegations,
    })
    const assistantTimeline = new SqliteAssistantRunEventStore(
      database,
      runtimeGovernanceRepository,
    )
    const conversationTurnViews = new ConversationTurnViewAssembler(
      repositories.chatSessions,
    )
    const dshInteractionDatabase = database
    dshControlPlane = createDshControlPlaneBootstrap({
      database,
      runtime: dshRuntimeBootstrap.runtime,
      userDataPath,
      toolCatalog: {
        list: () => toolCatalog.list(),
      },
      knowledgeRuntime: {
        profile: () => activeProfile,
        scopes: knowledgeSearchStore,
      },
      runtimeInput: {
        resolve: async ({ context }) => {
          const selectedSkill =
            'skill' in context ? context.skill : undefined
          const selectedMcpServerIds =
            'mcpServerIds' in context && Array.isArray(context.mcpServerIds)
              ? [...new Set(context.mcpServerIds)]
              : []
          const selectedConnectorIds =
            'connectorBindings' in context &&
            Array.isArray(context.connectorBindings)
              ? [
                  ...new Set(
                    context.connectorBindings.map(
                      ({ connectorId }) => connectorId,
                    ),
                  ),
                ]
              : []
          let customInstructions: string | undefined
          if (selectedSkill) {
            const catalog = await toolCatalog.list({
              runtimeWorkspaceId:
                'workspaceId' in context && context.workspaceId
                  ? context.workspaceId
                  : null,
            })
            const item = catalog.skills.find(
              (candidate) =>
                candidate.status === 'enabled' &&
                candidate.id === selectedSkill.id &&
                candidate.version === selectedSkill.version &&
                candidate.definitionDigest === selectedSkill.digest,
            )
            if (!item) {
              throw new Error(
                `Selected Skill is not enabled: ${selectedSkill.id}`,
              )
            }
            customInstructions =
              await runtimeSkillInstructions.readInstructions(item.definition)
          }
          const [mcpServerRecords, connectorRecords] = await Promise.all([
            Promise.all(
              selectedMcpServerIds.map((serverId) => mcpServers.get(serverId)),
            ),
            Promise.all(
              selectedConnectorIds.map((connectorId) =>
                connectors.get(connectorId),
              ),
            ),
          ])
          const disabledMcpServer = mcpServerRecords.find(
            ({ configuration }) => !configuration.enabled,
          )
          if (disabledMcpServer) {
            throw new Error(
              `Selected MCP server is disabled: ${disabledMcpServer.configuration.id}`,
            )
          }
          const disabledConnector = connectorRecords.find(
            ({ connector }) => !connector.enabled,
          )
          if (disabledConnector) {
            throw new Error(
              `Selected Connector is disabled: ${disabledConnector.connector.id}`,
            )
          }
          const credentialReferences = [
            ...mcpServerRecords.flatMap(({ configuration }) => {
              const bindings =
                configuration.transport.kind === 'stdio'
                  ? configuration.transport.environmentCredentialIds
                  : configuration.transport.headerCredentialIds
              return Object.values(bindings).map((ref) => ({
                kind: 'credential-reference' as const,
                ref,
                purpose: 'mcp' as const,
              }))
            }),
            ...connectorRecords.flatMap(({ connector }) =>
              connector.authentication.type === 'none'
                ? []
                : [
                    {
                      kind: 'credential-reference' as const,
                      ref: `credential-${connector.id}`,
                      purpose: 'connector' as const,
                    },
                  ],
            ),
          ]
          const selectedRuntime = {
            ...(customInstructions ? { customInstructions } : {}),
            ...(selectedMcpServerIds.length > 0
              ? {
                  mcpServerIds: selectedMcpServerIds,
                  mcpServerRecords,
                }
              : {}),
            ...(selectedConnectorIds.length > 0
              ? {
                  connectorIds: selectedConnectorIds,
                  connectorRecords,
                }
              : {}),
            ...(credentialReferences.length > 0
              ? { credentialReferences }
              : {}),
          }
          if ('folderPath' in context && context.folderPath) {
            return selectedRuntime
          }
          if ('requirementId' in context && context.requirementId) {
            const requirement = await repositories.requirements.get(
              context.requirementId,
            )
            if (requirement?.workspaceRootPath) {
              return {
                cwd: requirement.workspaceRootPath,
                ...selectedRuntime,
              }
            }
          }
          if ('workspaceId' in context && context.workspaceId) {
            const workspaceRecord = await repositories.workspaces.get(
              context.workspaceId,
            )
            const cwd = workspaceRecord?.rootPath ?? workspaceRecord?.path
            return cwd ? { cwd, ...selectedRuntime } : selectedRuntime
          }
          const workRoot = await repositories.workRoots.getCurrent()
          return workRoot
            ? {
                cwd: workRoot.path,
                contextRootIds: [workRoot.id],
                ...selectedRuntime,
              }
            : selectedRuntime
        },
      },
      modelCredentials: {
        resolveProviderCredentialMaterial: (providerId) =>
          modelService.resolveProviderCredentialMaterial(providerId),
      },
      interactionPresenter: new DshInteractionTimelinePresenter({
        timeline: assistantTimeline,
        resolveConversationId: ({ projection }) => {
          const row = dshInteractionDatabase.prepare(
            `SELECT session_id
             FROM chat_messages
             WHERE id = ? AND run_id = ? AND turn_id = ? AND role = 'assistant'`
          ).get(
            projection.assistantMessageId,
            projection.runId,
            projection.turnId
          ) as { session_id: string } | undefined
          return row?.session_id
        },
        publishProjection: ({ sessionId, turnId, projection }) => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          mainWindow.webContents.send(
            IPC_EVENT_CHANNELS.conversationTurnProjection,
            { sessionId, turnId, projection }
          )
          broadcastToolPermissionChanged()
        },
      }),
    })
    const dshSessionBindings = dshControlPlane.sessions
    const dshRuntimeEventIngestor = dshControlPlane.runtimeEvents
    const dshManifestPublications = dshControlPlane.manifests
    dshRunGateway = dshControlPlane.gateway
    liveModelSkillRuntime = new ModelSkillExecutionRuntime({
      models: modelService,
      gateway: dshRunGateway,
    })
    const followUpSuggestions = new SqliteFollowUpSuggestionRepository(database)
    const conversationGeneratedArtifacts =
      new ConversationGeneratedArtifactService(new SqliteGeneratedArtifactStateRepository(database))
    const followUpSuggestionCoordinator = new FollowUpSuggestionCoordinator({
      repository: followUpSuggestions,
      generator: new RealModelFollowUpSuggestionGenerator({
        models: modelService,
        gateway: dshRunGateway,
      }),
      enabled: () => true,
    })
    const conversationContexts =
      new SqliteConversationContextRepository(database)
    const cancelConversationRun = new CancelConversationRunUseCase({
      sessions: repositories.chatSessions,
      timeline: assistantTimeline,
      publishProjection: ({ sessionId, turnId, projection }) => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send(
          IPC_EVENT_CHANNELS.conversationTurnProjection,
          { sessionId, turnId, projection }
        )
        broadcastToolPermissionChanged()
      },
    })
    const sendConversationMessage = new SendConversationMessageUseCase({
      sessions: repositories.chatSessions,
      memory: new ConversationMemoryService({
        repository: conversationContexts
      }),
      getDefaultApprovalProfile: async () => (await approvalDefaults.get()).approvalProfileId,
      timeline: assistantTimeline,
      onProjectionUpdated: ({ sessionId, turnId, projection }) => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send(
          IPC_EVENT_CHANNELS.conversationTurnProjection,
          { sessionId, turnId, projection }
        )
      },
      spaceContext: {
        assertAvailable: async (workspaceId) => {
          if (!(await repositories.workspaces.get(workspaceId))) {
            throw new Error(`Workspace not found: ${workspaceId}`)
          }
        },
        assembleSnapshot: (scope, query) =>
          spaceConversationContext.assembleSnapshot(scope, query),
      },
      folderContext: {
        assertAvailable: (folderPath) =>
          workspace.assertSessionDirectoryAvailable(folderPath),
      },
      gateway: dshRunGateway,
      models: modelService,
      attachments: {
        listByOwner: (ownerId) =>
          conversationAttachmentRepository.listByOwner(ownerId),
        prepare: (input) => conversationInputPreprocessor.prepare(input),
      },
      generatedArtifacts: conversationGeneratedArtifacts,
      onCompleted: (input) => followUpSuggestionCoordinator.schedule(input),
    })
    const sendFollowUpSuggestion = new SendFollowUpSuggestionUseCase({
      suggestions: followUpSuggestions,
      sender: sendConversationMessage,
    })
    const createGeneralConversation = new CreateGeneralConversationUseCase({
      sender: sendConversationMessage,
    })
    const createFolderConversation = new CreateFolderConversationUseCase({
      folders: workspace,
      sender: sendConversationMessage,
    })
    const createSpaceConversation = new CreateSpaceConversationUseCase({
      workspaces: repositories.workspaces,
      sender: sendConversationMessage,
    })
    const getWorkflowNodeExecution = async (input: {
      requirementId: string
      nodeId: string
    }) => {
      const execution =
        await repositories.workflowExecutions.getActiveByRequirement(
          input.requirementId,
        )
      if (!execution) return undefined
      const nodeRun = await repositories.nodeRuns.getLatestByNode(
        execution.id,
        input.nodeId,
      )
      if (!nodeRun) return undefined
      const approval = await repositories.nodeApprovals.getByNodeRun(nodeRun.id)
      return {
        execution,
        nodeRun,
        ...(approval ? { approval } : {}),
      }
    }
    let controlWorkflowNode!: ControlWorkflowNodeUseCase
    let prepareWorkflowNodeContext!: PrepareNodeContextSnapshotUseCase
    const executeWorkflowControl = async (
      action: WorkflowNodeControlAction,
      execute: () => Promise<
        Exclude<WorkflowNodeControlResult, { outcome: 'rejected' }>
      >,
    ): Promise<WorkflowNodeControlResult> => {
      try {
        return await execute()
      } catch (error) {
        if (error instanceof WorkflowNodeControlError) {
          return {
            outcome: 'rejected',
            action,
            error: { code: error.code, message: error.message },
          }
        }
        const message = error instanceof Error ? error.message : String(error)
        return {
          outcome: 'rejected',
          action,
          error: {
            code: message.toLowerCase().includes('revision conflict')
              ? 'revision_conflict'
              : 'persistence_failed',
            message,
          },
        }
      }
    }
    let resolveWorkflowNodeGate!: ResolveNodeGateUseCase
    let resolveNodeQuestion!: ResolveNodeQuestionUseCase
    let requirementNodeConversation!: SendRequirementNodeMessageUseCase
    const business: BusinessHandlers = {
      selectWorkRoot,
      listWorkRoots: { execute: () => repositories.workRoots.list() },
      createSpace,
      listSpaces: { execute: () => repositories.workspaces.list() },
      updateSpace,
      renameSpaceDirectory,
      relocateSpace,
      deleteSpace: {
        execute: async (command) => {
          const deleted = await deleteSpace.execute(command)
          if (deleted) scheduleWorkspaceCleanup()
          return deleted
        },
      },
      restoreSpace: {
        execute: (command) => restoreSpace.execute(command),
      },
      purgeSpace: {
        execute: (command) => purgeSpace.execute(command),
      },
      createRequirement,
      listRequirements: {
        execute: ({ workspaceId }) =>
          repositories.requirements.listByWorkspace(workspaceId),
      },
      updateRequirement,
      renameRequirementDirectory,
      deleteRequirement: {
        execute: (command) => deleteRequirement.execute(command),
      },
      restoreRequirement: {
        execute: (command) => restoreRequirement.execute(command),
      },
      purgeRequirement: {
        execute: (command) => purgeRequirement.execute(command),
      },
      listTrashItems: {
        execute: () => listTrashItems.execute(),
      },
      listWorkflowTemplates: {
        execute: () => repositories.workflowTemplates.listPublishedVersions(),
      },
      listWorkflowTemplateLibrary: {
        execute: async () =>
          (await manageWorkflowTemplates.list()).map(
            toWorkflowTemplateLibraryItem,
          ),
      },
      listWorkflowTemplateVersions: {
        execute: async ({ templateId }) =>
          (await manageWorkflowTemplates.listVersions(templateId)).map(
            toWorkflowTemplateVersionSummary,
          ),
      },
      getWorkflowTemplateVersion: {
        execute: async ({ templateId, versionId }) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.getVersion(templateId, versionId),
          ),
      },
      getWorkflowTemplateDraft: {
        execute: async ({ templateId }) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.getDraft(templateId),
          ),
      },
      listTemplateMigrationCandidates: {
        execute: ({ requirementId }) =>
          templateMigrations.listCandidates(requirementId),
      },
      previewTemplateMigration: {
        execute: ({ requirementId, targetTemplateVersionId }) =>
          templateMigrations.preview(requirementId, targetTemplateVersionId),
      },
      createWorkflowTemplate: {
        execute: async (command) =>
          toWorkflowTemplateLibraryItem(
            await manageWorkflowTemplates.create(command),
          ),
      },
      copyWorkflowTemplate: {
        execute: async (command) =>
          toWorkflowTemplateLibraryItem(
            await manageWorkflowTemplates.copy(command),
          ),
      },
      updateWorkflowTemplate: {
        execute: async (command) =>
          toWorkflowTemplateLibraryItem(
            await manageWorkflowTemplates.update(command),
          ),
      },
      createWorkflowTemplateVersion: {
        execute: async (command) =>
          toWorkflowTemplateLibraryItem(
            await manageWorkflowTemplates.createNextVersion(command),
          ),
      },
      publishWorkflowTemplate: {
        execute: async (command) => {
          try {
            return toWorkflowTemplateLibraryItem(
              await manageWorkflowTemplates.publish(command),
            )
          } catch (error) {
            if (error instanceof WorkflowTemplatePublicationValidationError) {
              return {
                outcome: 'invalid' as const,
                validation: error.validation,
              }
            }
            throw error
          }
        },
      },
      archiveWorkflowTemplate: {
        execute: async (command) =>
          toWorkflowTemplateLibraryItem(
            await manageWorkflowTemplates.archive(command),
          ),
      },
      addWorkflowTemplateNode: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.addNode(command),
          ),
      },
      copyWorkflowTemplateNode: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.copyNode(command),
          ),
      },
      updateWorkflowTemplateNode: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.updateNode(command),
          ),
      },
      configureWorkflowTemplateNode: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.configureNode(command),
          ),
      },
      removeWorkflowTemplateNode: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.removeNode(command),
          ),
      },
      restoreWorkflowTemplateNode: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.restoreNode(command),
          ),
      },
      reorderWorkflowTemplateNodes: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.reorderNodes(command),
          ),
      },
      updateWorkflowTemplateNodePositions: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.updateNodePositions(command),
          ),
      },
      addWorkflowTemplateEdge: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.addEdge(command),
          ),
      },
      removeWorkflowTemplateEdge: {
        execute: async (command) =>
          toWorkflowTemplateDraft(
            await manageWorkflowTemplates.removeEdge(command),
          ),
      },
      applyTemplateMigration: {
        execute: (command) => templateMigrations.apply(command),
      },
      getRequirementWorkflow: {
        execute: ({ requirementId }) =>
          repositories.requirementWorkflows.get(requirementId),
      },
      getRequirementExecutionView: {
        execute: (query) => getRequirementExecutionView.execute(query),
      },
      setWorkflowParallelism: {
        execute: async (command) => {
          try {
            return await setWorkflowParallelism.execute(command)
          } catch (error) {
            if (error instanceof WorkflowParallelismError) {
              return {
                outcome: 'rejected' as const,
                error: {
                  code: error.code,
                  message:
                    error.code === 'persistence_failed'
                      ? 'Unable to update workflow parallelism'
                      : error.message,
                  ...(error.latestWorkflowRevision === undefined
                    ? {}
                    : {
                        latestWorkflowRevision: error.latestWorkflowRevision,
                      }),
                  ...(error.latestExecutionRevision === undefined
                    ? {}
                    : {
                        latestExecutionRevision: error.latestExecutionRevision,
                      }),
                  ...(error.conflictingNodeIds === undefined
                    ? {}
                    : { conflictingNodeIds: error.conflictingNodeIds }),
                },
              }
            }
            return {
              outcome: 'rejected' as const,
              error: {
                code: 'persistence_failed' as const,
                message: 'Unable to update workflow parallelism',
              },
            }
          }
        },
      },
      listRequirementWorkflowRevisions: {
        execute: ({ requirementId }) =>
          repositories.requirementWorkflows.listRevisions(requirementId),
      },
      insertWorkflowNode: {
        execute: async (command) => {
          const result = await manageRequirementWorkflow.insertNode({
            requirementId: command.requirementId,
            expectedRevision: command.expectedRevision,
            mutation: {
              node: command.node,
              ...(command.afterNodeId
                ? { afterNodeId: command.afterNodeId }
                : {}),
              ...(command.beforeNodeId
                ? { beforeNodeId: command.beforeNodeId }
                : {}),
            },
          })
          return result.workflow
        },
      },
      updateWorkflowNode: {
        execute: (command) => manageRequirementWorkflow.updateNode(command),
      },
      removeWorkflowNode: {
        execute: (command) => manageRequirementWorkflow.removeNode(command),
      },
      updateWorkflowEdge: {
        execute: (command) => workflowRuntime.updateEdge(command),
      },
      reorderWorkflowNodes: {
        execute: (command) => workflowRuntime.reorder(command),
      },
      getWorkflowNodeExecution: { execute: getWorkflowNodeExecution },
      startWorkflowNode: {
        execute: (command) =>
          executeWorkflowControl('start', () =>
            controlWorkflowNode.start(command),
          ),
      },
      pauseWorkflowNode: {
        execute: (command) =>
          executeWorkflowControl('pause', () =>
            controlWorkflowNode.pause(command),
          ),
      },
      resumeWorkflowNode: {
        execute: (command) =>
          executeWorkflowControl('resume', () =>
            controlWorkflowNode.resume(command),
          ),
      },
      cancelWorkflowNode: {
        execute: (command) =>
          executeWorkflowControl('cancel', () =>
            controlWorkflowNode.cancel(command),
          ),
      },
      retryWorkflowNode: {
        execute: (command) =>
          executeWorkflowControl('retry', () =>
            controlWorkflowNode.retry(command),
          ),
      },
      rollbackWorkflowToNode: {
        execute: async (command): Promise<RollbackWorkflowToNodeResult> => {
          try {
            return await rollbackWorkflowToNode.execute(command)
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            return {
              outcome: 'rejected',
              error: {
                code: mapWorkflowRollbackErrorCode(error),
                message,
              },
            }
          }
        },
      },
      prepareWorkflowNodeContext: {
        execute: (command) => prepareWorkflowNodeContext.execute(command),
      },
      skipWorkflowNode: {
        execute: (command) =>
          executeWorkflowControl('skip', () =>
            controlWorkflowNode.skip(command),
          ),
      },
      resolveWorkflowNodeGate: {
        execute: (command) => resolveWorkflowNodeGate.execute(command),
      },
      listRecentConversations: {
        execute: (query) => repositories.chatSessions.listRecent(query),
      },
      listWorkspaceConversations: {
        execute: ({ workspaceId }) =>
          repositories.chatSessions.listByWorkspace(workspaceId),
      },
      getConversation: {
        execute: ({ sessionId }) => repositories.chatSessions.get(sessionId),
      },
      listConversationTurns: {
        execute: (query) => conversationTurnViews.execute(query),
      },
      getConversationContextDiagnostics: {
        execute: async ({ sessionId }) =>
          conversationContexts.getLatestDiagnostics(sessionId),
      },
      searchConversationTranscript: {
        execute: async ({ sessionId, query, limit }) =>
          conversationContexts.searchTranscript({
            conversationId: sessionId,
            query,
            limit: limit ?? 8
          }),
      },
      renameConversation: {
        execute: (command) => manageConversations.rename(command),
      },
      deleteConversation: {
        execute: async (command) => {
          const result = await manageConversations.delete(command)
          return result.status === 'conflict'
            ? {
                status: 'conflict' as const,
                conversation: result.entity,
              }
            : result
        },
      },
      createConversation: {
        execute: (command, onUpdate) =>
          command.kind === 'space'
            ? createSpaceConversation.execute(command, onUpdate)
            : command.kind === 'requirement_node'
              ? requirementNodeConversation.create(command, onUpdate)
              : command.folderBindingId
                ? createFolderConversation.execute(command, onUpdate)
                : createGeneralConversation.execute(command, onUpdate),
      },
      appendConversationMessage: {
        execute: async (command, onUpdate) => {
          const session = await repositories.chatSessions.get(command.sessionId)
          // #region debug-point B,D:main-command
          void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'conversation-send-cancelled', runId: 'post-fix', hypothesisId: 'B,D', location: 'electron/src/main.ts:appendConversationMessage', msg: '[DEBUG] Main received conversation message command', data: { conversationId: command.sessionId, expectedRevision: command.expectedRevision, persistedRevision: session?.revision ?? null, latestTurnStatus: session?.turns.at(-1)?.status ?? null, pendingAssistantCount: session?.messages.filter((message) => message.role === 'assistant' && message.status === 'pending').length ?? null, modelProfileId: command.modelProfileId ?? null }, ts: Date.now() }) }).catch(() => undefined)
          // #endregion
          if (session?.kind === 'requirement_node') {
            return requirementNodeConversation.append(command, onUpdate)
          }
          return sendConversationMessage.execute({
            sessionId: command.sessionId,
            ...(command.approvalProfileId ? { approvalProfileId: command.approvalProfileId } : {}),
            content: command.content,
            expectedRevision: command.expectedRevision,
            messageId: command.messageId,
            ...(command.references
              ? { messageReferences: command.references }
              : {}),
            ...(command.modelProfileId
              ? { modelProfileId: command.modelProfileId }
              : {}),
            ...(command.reasoningMode
              ? { reasoningMode: command.reasoningMode }
              : {}),
            ...(command.contextMode
              ? { contextMode: command.contextMode }
              : {}),
            ...(command.applicationLocale
              ? { applicationLocale: command.applicationLocale }
              : {}),
            ...(command.attachments
              ? { attachments: command.attachments }
              : {}),
            ...(onUpdate ? { onUpdate } : {}),
          })
        },
      },
      sendFollowUpSuggestion: {
        execute: (command, onUpdate) =>
          sendFollowUpSuggestion.execute(command, onUpdate),
      },
      listKnowledgeSources: {
        execute: (query) => knowledgeSourceQueries.list(query),
      },
      listKnowledgeSourceEvents: {
        execute: (query) => knowledgeSources.listEvents(query),
      },
      getOnlineDocumentSnapshot: {
        execute: ({ sourceId }) => onlineDocuments.get(sourceId),
      },
      getRepositorySnapshot: {
        execute: async ({ sourceId }) => {
          const view = toRepositorySnapshotViewDto(
            await repositoryIngestion.get(sourceId),
          )
          if (!view.snapshot) return view
          const [states, currentManifest, latestJob] = await Promise.all([
            vectorIndexes.listDocumentStates({
              sourceId,
              profileId: activeProfile.id,
            }),
            vectorIndexes.getCurrentGenerationManifest({
              sourceId,
              profileId: activeProfile.id,
            }),
            vectorIndexes.getLatestJobBySource({
              sourceId,
              profileId: activeProfile.id,
            }),
          ])
          const statesByKey = new Map(
            states.map((state) => [state.documentKey, state]),
          )
          const indexedChecksums = new Map(
            (currentManifest?.documents ?? []).map((document) => [
              document.documentKey,
              document.checksum,
            ]),
          )
          return {
            ...view,
            ...(latestJob ? { indexJobStatus: latestJob.status } : {}),
            snapshot: {
              ...view.snapshot,
              files: view.snapshot.files.map((file) => ({
                ...file,
                indexStatus: (() => {
                  const state = statesByKey.get(file.relativePath)
                  return state
                    ? {
                        status: state.status,
                        ...(state.generationId
                          ? { generationId: state.generationId }
                          : {}),
                        ...(state.errorCode
                          ? { errorCode: state.errorCode }
                          : {}),
                        updatedAt: state.updatedAt,
                      }
                    : {
                        status:
                          indexedChecksums.get(file.relativePath) ===
                          file.contentChecksum
                            ? ('indexed' as const)
                            : ('pending' as const),
                        ...(currentManifest &&
                        indexedChecksums.get(file.relativePath) ===
                          file.contentChecksum
                          ? { generationId: currentManifest.generationId }
                          : {}),
                        updatedAt: view.snapshot!.scannedAt,
                      }
                })(),
              })),
            },
          }
        },
      },
      listRepositoryBranches: {
        execute: (query) => repositoryIngestion.listBranches(query),
      },
      getKnowledgeIndex: {
        execute: async ({ sourceId }) =>
          toKnowledgeIndexDto(await knowledgeIndex.get(sourceId)),
      },
      getKnowledgeRuntimeHealth: {
        execute: () => knowledgeRuntimeHealth.get(),
      },
      listKnowledgeNotes: {
        execute: async ({ workspaceId }) =>
          (await knowledgeNoteService.listActive(workspaceId)).map(
            toKnowledgeNoteDto,
          ),
      },
      createKnowledgeNote: {
        execute: async (command) => {
          const create =
            command.kind === 'decision'
              ? knowledgeNoteService.createDecisionNote.bind(
                  knowledgeNoteService,
                )
              : command.kind === 'retrospective'
                ? knowledgeNoteService.createRetrospectiveNote.bind(
                    knowledgeNoteService,
                  )
                : knowledgeNoteService.createConversationNote.bind(
                    knowledgeNoteService,
                  )
          const created = await create(command)
          conversationContexts.saveMemory({
            id: conversationMemoryId(
              created.note.id,
              created.version.version
            ),
            scope: 'conversation',
            scopeId: command.sessionId,
            kind: knowledgeNoteMemoryKind(created.note.kind),
            content: created.version.content,
            sourceMessageIds: created.version.sourceMessageIds,
            sourceDigest: created.version.checksum,
            importance: 0.9,
            validFrom: created.version.createdAt,
            trust: 'user_confirmed'
          })
          return toKnowledgeNoteDto({
            note: created.note,
            currentVersion: created.version,
          })
        },
      },
      editKnowledgeNote: {
        execute: async (command) => {
          const edited = await knowledgeNoteService.edit(command)
          if (edited.note.sessionId) {
            conversationContexts.replaceMemory(
              conversationMemoryId(
                edited.note.id,
                edited.currentVersion.version - 1
              ),
              {
                id: conversationMemoryId(
                  edited.note.id,
                  edited.currentVersion.version
                ),
                scope: 'conversation',
                scopeId: edited.note.sessionId,
                kind: knowledgeNoteMemoryKind(edited.note.kind),
                content: edited.currentVersion.content,
                sourceMessageIds: edited.currentVersion.sourceMessageIds,
                sourceDigest: edited.currentVersion.checksum,
                importance: 0.9,
                validFrom: edited.currentVersion.createdAt,
                trust: 'user_confirmed'
              }
            )
          }
          return toKnowledgeNoteDto(edited)
        },
      },
      archiveKnowledgeNote: {
        execute: async (command) => {
          const archived = await knowledgeNoteService.archive(command)
          if (archived.note.sessionId) {
            conversationContexts.expireMemory(
              conversationMemoryId(
                archived.note.id,
                archived.currentVersion.version
              ),
              Math.max(
                archived.note.updatedAt,
                archived.currentVersion.createdAt + 1
              )
            )
          }
          return toKnowledgeNoteDto(archived)
        },
      },
      searchKnowledge: {
        execute: (query) => knowledgeSearch.search(query),
      },
      searchCatalog: {
        execute: (query) => catalogIndex.search(query),
      },
      registerKnowledgeSource: {
        execute: (command) => knowledgeSources.register(command),
      },
      ingestLocalFiles: {
        execute: (command) =>
          runLocalFileIngestion(() => localFileIngestion.ingest(command)),
      },
      refreshLocalFileSource: {
        execute: (command) =>
          localFileIngestion.refresh({
            sourceId: command.id,
            expectedRevision: command.expectedRevision,
            idempotencyKey: command.idempotencyKey,
          }),
      },
      openLocalFileSource: {
        execute: (command) => localFileIngestion.open(command),
      },
      ingestLocalRepository: {
        execute: async (command) => {
          const result = await runRepositoryIngestion(() =>
            repositoryIngestion.ingestLocal(command),
          )
          return toRepositorySyncResultDto(
            result.source,
            await repositoryIngestion.get(result.source.id),
          )
        },
      },
      ingestRemoteRepository: {
        execute: async (command) => {
          const result = await runRepositoryIngestion(() =>
            repositoryIngestion.ingestRemote(command),
          )
          return toRepositorySyncResultDto(
            result.source,
            await repositoryIngestion.get(result.source.id),
          )
        },
      },
      refreshRepositorySource: {
        execute: async (command) => {
          const result = await runRepositoryIngestion(() =>
            repositoryIngestion.refresh(command),
          )
          return toRepositorySyncResultDto(
            result.source,
            await repositoryIngestion.get(result.source.id),
          )
        },
      },
      updateRepositoryBranch: {
        execute: async (command) => {
          const result = await runRepositoryIngestion(() =>
            repositoryIngestion.updateBranch(command),
          )
          return toRepositorySyncResultDto(
            result.source,
            await repositoryIngestion.get(result.source.id),
          )
        },
      },
      retryRepositoryFileIndex: {
        execute: async (command) => {
          const source = await knowledgeSourceRepository.get(command.sourceId)
          const view = await repositoryIngestion.get(command.sourceId)
          if (
            !source ||
            source.revision !== command.expectedSourceRevision ||
            view.snapshot?.version !== command.expectedSnapshotVersion
          ) {
            throw new Error('Repository file index revision conflict')
          }
          const states = await vectorIndexes.listDocumentStates({
            sourceId: command.sourceId,
            profileId: activeProfile.id,
          })
          const state = states.find(
            ({ documentKey }) => documentKey === command.documentKey,
          )
          const file = view.snapshot.files.find(
            ({ relativePath }) => relativePath === command.documentKey,
          )
          if (
            !state ||
            state.status !== 'failed' ||
            !file ||
            state.sourceVersion !== `repository:${view.snapshot.version}` ||
            state.checksum !== file.contentChecksum
          ) {
            throw new Error('Repository file index retry conflict')
          }
          const enqueued = await knowledgeIndexCoordinator.enqueue({
            sourceId: command.sourceId,
            triggerSource: 'manual',
            targetDocumentKey: command.documentKey,
          })
          await vectorIndexes.transitionDocumentState({
            sourceId: command.sourceId,
            profileId: activeProfile.id,
            documentKey: command.documentKey,
            expectedSourceVersion: state.sourceVersion,
            expectedChecksum: state.checksum,
            expectedStatus: 'failed',
            status: 'pending',
            at: Date.now(),
          })
          scheduleKnowledgeIndexDrain()
          return { status: enqueued.status, jobId: enqueued.job.id }
        },
      },
      buildKnowledgeIndex: {
        execute: async (command) =>
          toKnowledgeIndexDto(
            await knowledgeIndex.build({
              sourceId: command.id,
              expectedRevision: command.expectedRevision,
            }),
          ) as ReturnType<typeof toKnowledgeIndexDto> & {
            status: 'enqueued' | 'replayed' | 'coalesced'
            jobId: string
          },
      },
      refreshKnowledgeSource: {
        execute: async (command) => {
          const claimed = await knowledgeRefresh.refreshNow(command)
          return knowledgeRefresh.runClaimed(claimed.id)
        },
      },
      setKnowledgeRefreshPolicy: {
        execute: async (command) => {
          await knowledgeRefresh.setPolicy(command)
          return knowledgeRefreshRepository.getPolicy(command.sourceId)
        },
      },
      createOnlineDocumentSource: {
        execute: (command) => onlineDocuments.create(command),
      },
      syncOnlineDocumentSource: {
        execute: (command) => onlineDocuments.sync(command),
      },
      retryKnowledgeSource: {
        execute: (command) => knowledgeSources.retry(command),
      },
      removeKnowledgeSource: {
        execute: async (command) => {
          const source = await knowledgeSourceRepository.get(command.id)
          return source?.type === 'repository'
            ? repositoryIngestion.remove({
                sourceId: command.id,
                expectedRevision: command.expectedRevision,
                idempotencyKey: command.idempotencyKey,
              })
            : localFileIngestion.remove(command)
        },
      },
      listNodeTodos: {
        execute: ({ nodeRunId }) =>
          repositories.nodeTodos.listByNodeRun(nodeRunId),
      },
      saveNodeTodo: {
        execute: (command) => manageNodeTodos.save(command),
      },
      deleteNodeTodo: {
        execute: (command) => manageNodeTodos.delete(command),
      },
      listNodeQuestions: {
        execute: ({ nodeRunId }) =>
          repositories.nodeQuestions.listByNodeRun(nodeRunId),
      },
      openNodeQuestion: {
        execute: (command) => manageNodeQuestions.open(command),
      },
      answerNodeQuestion: {
        execute: async (command) =>
          (
            await resolveNodeQuestion.execute({
              ...command,
              status: 'answered',
            })
          ).question,
      },
      dismissNodeQuestion: {
        execute: async (command) =>
          (
            await resolveNodeQuestion.execute({
              ...command,
              status: 'dismissed',
            })
          ).question,
      },
      listModels: { execute: () => modelService.listModels() },
      listEffectiveModels: {
        execute: () => modelService.listEffectiveModels(),
      },
      getApplicationModelDefault: {
        execute: () => modelService.getApplicationModelDefault(),
      },
      discoverModelProviders: {
        execute: () => providerDiscovery.discover(),
      },
      saveApplicationModelDefault: {
        execute: ({ preference, expectedRevision }) =>
          modelService.saveApplicationModelDefault(
            preference,
            expectedRevision,
          ),
      },
      configureDiscoveredModelProvider: {
        execute: async ({ catalogId }) => {
          const credential =
            await providerDiscovery.resolveCredential(catalogId)
          if (!credential) {
            throw new Error('Detected model credential is no longer available')
          }
          return modelService.configureBuiltinProvider(catalogId, credential)
        },
      },
      listConnectors: { execute: () => connectors.list() },
      saveConnector: {
        execute: (command) => connectors.save(command),
      },
      deleteConnector: {
        execute: (command) => connectors.delete(command),
      },
      validateConnector: {
        execute: (command) => connectors.validate(command),
      },
      listSchedules: {
        execute: () => schedules.list(),
      },
      listScheduleRuns: {
        execute: (query) =>
          schedules.listRuns({ ...query, limit: query.limit ?? 50 }),
      },
      createSchedule: {
        execute: (command) => schedules.create(command),
      },
      updateSchedule: {
        execute: (command) => schedules.update(command),
      },
      pauseSchedule: {
        execute: (command) => schedules.pause(command),
      },
      resumeSchedule: {
        execute: (command) => schedules.resume(command),
      },
      runScheduleNow: {
        execute: (command) => schedules.runNow(command),
      },
      deleteSchedule: {
        execute: (command) => schedules.delete(command),
      },
      routeModel: { execute: (request) => modelService.routeModel(request) },
      saveModelProvider: {
        execute: ({
          expectedRevision,
          credential,
          customHeaders,
          ...provider
        }) =>
          modelService.saveProvider(
            provider,
            expectedRevision,
            credential !== undefined || customHeaders !== undefined
              ? {
                  ...(credential !== undefined ? { apiKey: credential } : {}),
                  ...(customHeaders !== undefined
                    ? {
                        customHeaders: Object.fromEntries(
                          customHeaders
                            .filter(
                              (
                                header,
                              ): header is { name: string; value: string } =>
                                header.value !== undefined,
                            )
                            .map(({ name, value }) => [name, value]),
                        ),
                        retainedCustomHeaderNames: customHeaders
                          .filter(({ value }) => value === undefined)
                          .map(({ name }) => name),
                      }
                    : {}),
                }
              : undefined,
          ),
      },
      configureBuiltinModelProvider: {
        execute: ({ catalogId, credential }) =>
          modelService.configureBuiltinProvider(catalogId, credential),
      },
      deleteModelProvider: {
        execute: ({ id, expectedRevision }) =>
          modelService.deleteProvider(id, expectedRevision),
      },
      removeModelProviderCredential: {
        execute: ({ providerId, expectedRevision }) =>
          modelService.removeProviderCredential(providerId, expectedRevision),
      },
      rotateModelCredentialKey: {
        execute: ({ requestId }) => modelService.rotateCredentialKey(requestId),
      },
      saveModelProfile: {
        execute: ({ expectedRevision, ...profile }) =>
          modelService.saveProfile(profile, expectedRevision),
      },
      deleteModelProfile: {
        execute: ({ id, expectedRevision }) =>
          modelService.deleteProfile(id, expectedRevision),
      },
      setModelProfilesEnabled: {
        execute: (command) => modelService.setProfilesEnabled(command),
      },
      validateModelProfile: {
        execute: (command) => modelService.validateProfile(command),
      },
      queryModelStatistics,
      queryProductAnalytics,
      queryOutboundCallAudit: {
        execute: (query) => outboundCallAudit!.query(query),
      },
      getAppSupportInfo: { execute: () => appSupport.getInfo() },
      checkForUpdates: {
        execute: (command) => appSupport.checkForUpdates(command),
      },
      openSupportLink: {
        execute: (command) => appSupport.openSupportLink(command),
      },
    }
    const runs = repositories.aiRuns
    const runEvents = new RendererRunEventPublisher((event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue
        window.webContents.send(
          IPC_EVENT_CHANNELS.workbenchDashboardInvalidated,
          { reason: 'workflow', occurredAt: event.timestamp },
        )
      }
    })
    const contextAssembler = new ContextAssembler({
      artifacts: contextSources,
      knowledge: contextSources,
      questions: {
        listByNodeRun: async (nodeRunId) =>
          (await repositories.nodeQuestions.listByNodeRun(nodeRunId)).map(
            (question) => ({ ...question, version: question.revision }),
          ),
      },
      todos: {
        listByNodeRun: async (nodeRunId) =>
          (await repositories.nodeTodos.listByNodeRun(nodeRunId)).map(
            (todo) => ({
              ...todo,
              version: todo.revision,
            }),
          ),
      },
      attachments: {
        read: async (requirementId, path) => {
          const [file, canonicalPath] = await Promise.all([
            workspace.readFile(requirementId, path),
            workspace.resolvePreviewPath(requirementId, path),
          ])
          const bytes = new Uint8Array(await readFile(canonicalPath))
          return {
            version: Math.trunc(file.modifiedAt),
            bytes,
            fileName: basename(path),
            sourceChecksum: `sha256:${createHash('sha256')
              .update(bytes)
              .digest('hex')}`,
          }
        },
        extract: (input) => localContentExtraction.extract(input),
      },
    })
    const contexts = new AssembledNodeContextRepository({
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      snapshots: repositories.contextSnapshots,
      models: repositories.modelPool,
      unitOfWork: repositories.unitOfWork,
      assembler: contextAssembler,
      workspace: {
        getBinding: (requirementId) => workspace.getBinding(requirementId),
        readRequirementBody: async (requirementId) => {
          const requirement = await repositories.requirements.get(requirementId)
          if (!requirement?.bodyRelativePath) return ''
          return (
            await workspace.readFile(
              requirementId,
              requirement.bodyRelativePath,
            )
          ).content
        },
      },
    })
    prepareWorkflowNodeContext = new PrepareNodeContextSnapshotUseCase({
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      models: modelService,
      contexts,
      snapshots: repositories.contextSnapshots,
    })
    const generateStageArtifact = new GenerateStageArtifactUseCase({
      runs,
      gateway: dshRunGateway,
      contexts,
      artifactCommitter: commitFormalArtifact,
      publisher: runEvents,
      models: modelService,
    })
    cancelAiRun = new CancelAiRunUseCase({
      runs,
      gateway: dshRunGateway,
      publisher: runEvents,
    })
    let advanceWorkflow!: AdvanceWorkflowUseCase
    const executeWorkflowNode = new ExecuteWorkflowNodeUseCase({
      generate: {
        execute: (input) => generateStageArtifact.executeNode(input),
      },
      cancel: cancelAiRun,
      runs,
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      models: modelService,
      advance: {
        drain: () => advanceWorkflow.drain(),
      },
      manager: manageNodeExecution,
    })
    advanceWorkflow = new AdvanceWorkflowUseCase({
      dispatches: repositories.workflowDispatches,
      executions: repositories.workflowExecutions,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      executeNode: executeWorkflowNode,
    })
    resolveWorkflowNodeGate = new ResolveNodeGateUseCase({
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      approvals: repositories.nodeApprovals,
      unitOfWork: repositories.unitOfWork,
      manager: manageNodeExecution,
      worker: advanceWorkflow,
    })
    resolveNodeQuestion = new ResolveNodeQuestionUseCase({
      questions: {
        resolve: (input) => manageNodeQuestions.resolve(input),
        listByNodeRun: (nodeRunId) =>
          repositories.nodeQuestions.listByNodeRun(nodeRunId),
      },
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      manager: manageNodeExecution,
      worker: advanceWorkflow,
    })
    const beginRequirementNodeTurn = new BeginRequirementNodeTurnUseCase({
      sessions: repositories.chatSessions,
      questions: manageNodeQuestions,
      unitOfWork: repositories.unitOfWork,
    })
    const requirementNodeContext =
      new RequirementNodeConversationContextAssembler({
        requirements: repositories.requirements,
        workflows: repositories.requirementWorkflows,
        executions: repositories.workflowExecutions,
        nodeRuns: repositories.nodeRuns,
        assembler: contextAssembler,
        workspace: {
          readRequirementBody: async (requirementId) => {
            const requirement =
              await repositories.requirements.get(requirementId)
            if (!requirement?.bodyRelativePath) return ''
            return (
              await workspace.readFile(
                requirementId,
                requirement.bodyRelativePath,
              )
            ).content
          },
        },
      })
    requirementNodeConversation = new SendRequirementNodeMessageUseCase({
      sessions: repositories.chatSessions,
      questions: repositories.nodeQuestions,
      todos: repositories.nodeTodos,
      artifacts: repositories.artifacts,
      context: requirementNodeContext,
      turns: beginRequirementNodeTurn,
      reevaluator: resolveNodeQuestion,
      sender: sendConversationMessage,
    })
    controlWorkflowNode = new ControlWorkflowNodeUseCase({
      manager: manageNodeExecution,
      nodeRuns: repositories.nodeRuns,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      cancel: cancelAiRun,
      executeNode: executeWorkflowNode,
    })
    webWorkbench = new WebWorkbenchManager(() => mainWindow)
    await schedules.reconcilePermissions()
    await new ReconcileRuntimeDelegations({
      store: agentDelegationStore, runs: agentRuntimeRuns,
    }).execute()
    await assistantTimeline.reconcileTerminalConversations(conversationGeneratedArtifacts)
    agentDelegations.restore()
    for (const run of await agentRuntimeRuns.listUnfinished()) {
      if (run.status === 'waiting_input' || run.status === 'paused') agentDelegations.recoveryBlocked(run.id)
    }
    await networkGateway.start()
    await scheduleScheduler.start()
    try {
      const scheduleRecoveryResults = await schedules.recoverMissed()
      for (const result of scheduleRecoveryResults) {
        if (result.outcome !== 'failed') continue
        console.error('Missed schedule recovery failed', {
          scheduleId: result.scheduleId,
          scheduleRevision: result.scheduleRevision,
          missedDueAt: result.missedDueAt,
          errorCode: result.errorCode,
        })
      }
    } catch {
      console.error('Missed schedule recovery failed', {
        errorCode: 'schedule_persistence_unavailable',
      })
    } finally {
      await scheduleScheduler.refresh()
    }
    await knowledgeRefreshScheduler.start()
    scheduleKnowledgeIndexDrain()
    scheduleWorkspaceCleanup()
    await new RecoverPendingWorkflowRollbacksUseCase({
      workflowRollbacks: repositories.workflowRollbacks,
      coordinator: rollbackCoordinator,
    }).execute()
    await new RecoverInterruptedRunsUseCase(
      repositories.aiRuns,
      modelService,
    ).execute()
    const dshHistorySync = new DshHistorySync({
      sessions: dshSessionBindings,
      history: {
        readRange: (input) => ({
          session: {
            runtimeInstanceId: input.runtimeInstanceId,
            sessionId: input.sessionId,
            runId: input.runId,
            manifestDigest: input.manifestDigest,
            owner: input.owner,
          },
          afterSequence: input.afterSequence,
          nextAfterSequence: input.afterSequence,
          hasMore: false,
          events: [],
        }),
      },
      ingestor: dshRuntimeEventIngestor,
      productCommandResults: {
        reconcileCompletedResult: async () => 'duplicate' as const,
      },
    })
    const dshRunManifests = {
      getByRunId: async (runId: string) =>
        (await dshManifestPublications.getByRunId(runId))?.manifest,
    }
    const resumeDshSession = async (
      _run: AgentRuntimeRun,
      manifest: DshRunManifest
    ) => {
      if (!dshControlPlane) {
        throw new Error('DSH control plane is not initialized')
      }
      await dshControlPlane.resumeSession({
        manifest,
        cwd: userDataPath,
      })
    }
    const projectRecoveryEvent = async (
      run: AgentRuntimeRun,
      recoveryEvent: { type: AiRunEvent['type']; data: Record<string, unknown> }
    ) => {
      if (recoveryEvent.type === 'run.recovery_blocked') agentDelegations.recoveryBlocked(run.id)
      const projection = await assistantTimeline.getSnapshot(run.id)
      if (!projection) return
      const sequence = projection.lastSequence + 1
      const event: AiRunEvent = {
        id: `${run.id}:recovery:${sequence}`,
        runId: run.id,
        sequence,
        type: recoveryEvent.type,
        timestamp: new Date().toISOString(),
        data: recoveryEvent.data,
      }
      const next = projectConversationRunEvent(projection, event)
      const timelineEvent = toAssistantRunEvent(event)
      if (next && timelineEvent) {
        let appended: boolean
        if (agentDelegationStore.get(event.runId)) {
          appended = await assistantTimeline.appendAndProject(
            timelineEvent,
            next
          )
        } else {
          appended = await assistantTimeline.appendRecoveredAndProject(
            timelineEvent,
            next
          )
        }
        const sessionId = run.snapshot.conversationId
        if (appended && sessionId && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            IPC_EVENT_CHANNELS.conversationTurnProjection,
            { sessionId, turnId: next.turnId, projection: next }
          )
        }
        const conversation = sessionId ? await repositories.chatSessions.get(sessionId) : undefined
        if (conversation && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_EVENT_CHANNELS.conversationEvent, { conversation })
        }
      }
    }
    const recoveryActions = new AgentRunRecoveryActions({
      runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
      runs: agentRuntimeRuns,
      manifests: dshRunManifests,
      sessions: dshSessionBindings,
      historySync: dshHistorySync,
      resumeSession: resumeDshSession,
      cancelSession: async (_run, _manifest, binding) => {
        if (!dshControlPlane) {
          throw new Error('DSH control plane is not initialized')
        }
        await dshControlPlane.cancelSession(binding)
      },
      cancelDelegations: (runId) => agentDelegations.cancel(runId),
      projectRecoveryEvent,
    })
    const recoverRuntimeRuns = new RecoverAgentRuntimeRunsUseCase({
      runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
      runs: agentRuntimeRuns,
      manifests: dshRunManifests,
      sessions: dshSessionBindings,
      historySync: dshHistorySync,
      resumeSession: resumeDshSession,
      projectRecoveryEvent,
    })
    await new RecoverInterruptedNodeRunsUseCase({
      executions: repositories.workflowExecutions,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      dispatches: repositories.workflowDispatches,
      manager: manageNodeExecution,
    }).execute()
    await advanceWorkflow.drain()
    await new ReconcileWorkflowDispatchesUseCase({
      executions: repositories.workflowExecutions,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      dispatches: repositories.workflowDispatches,
      worker: advanceWorkflow,
    }).execute()
    terminalManager = new TerminalManager({ workspace })
    nativeOverlayManager = new NativeOverlayManager({
      getHostWindow: () => mainWindow,
      preloadPath: join(
        moduleDirectory,
        '../preload/native-overlay-preload.cjs',
      ),
      rendererUrl: process.env.ELECTRON_RENDERER_URL,
      rendererFile: join(moduleDirectory, '../renderer/index.html'),
    })
    registerMainIpc({
      sidecar: privateWorkerStatus,
      webProviders,
      agentRuntime: {
        orchestrator: agentOrchestrator,
        resolveRunId: async (id) => (await agentRuntimeRuns.getById(id))?.id,
        resolveRun: async (id) => agentRuntimeRuns.getById(id),
        cancel: async (id, sessionId) => {
          await dshRunGateway.cancelRun(id)
          const conversation = await cancelConversationRun.execute({
            sessionId,
            runId: id,
          })
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
              IPC_EVENT_CHANNELS.conversationEvent,
              { conversation },
            )
          }
        },
      },
      aiRuns: {
        executeNode: executeWorkflowNode,
        cancel: cancelAiRun,
        getRun: new GetAiRunUseCase(runs),
        listEvents: new ListAiRunEventsUseCase(runs),
        publisher: runEvents,
        recovery: {
          execute: (input) => recoveryActions.execute(input),
        },
      },
      business,
      toolCatalog: {
        catalog: toolCatalog,
        policy: new ToolPolicyConfigurationService({
          profiles: agentProfiles,
          catalog: toolCatalog,
          workspaceExists: async (id) => Boolean(await repositories.workspaces.get(id)),
          sandbox: async () => ({
            available: false,
            networkAllowed: false,
          }),
        }),
        importer: extensionCatalogImporter,
        mcpServers,
      },
      skillRegistry: {
        service: skillRegistry,
        synchronize: async () => {
          const report = await skillRegistry.synchronizeConfiguredSources({
            workspaceRoots: (await repositories.workRoots.list()).map((root) => ({
              id: root.id,
              label: root.id,
              path: root.path,
            })),
            userGlobalRoot: join(homedir(), '.realmflow', 'skills'),
            pluginRoots: [],
            generatedRoots: [],
          })
          for (const error of report.errors) {
            console.warn(
              `[Skill Registry] ${error.sourceId}:${error.relativePath}:${error.code}`,
            )
          }
          return {
            published: report.published,
            errorCount: report.errors.length,
          }
        },
      },
      toolPermissions: {
        defaults: approvalDefaults,
        observability: new ApprovalObservabilityService({ events: toolEvents }),
        permissions: {
          listPendingPermissions: async () => {
            const pending =
              await (dshControlPlane?.interactionPermissions.listPendingPermissions() ??
                Promise.resolve([]))
            const filtered = []
            for (const permission of pending) {
              const projection = await assistantTimeline.getSnapshot(permission.runId)
              if (
                projection &&
                ['completed', 'failed', 'cancelled'].includes(projection.status)
              ) {
                continue
              }
              filtered.push(permission)
            }
            return filtered
          },
        },
        decisions: {
          listGrants: async () => [],
          revokeGrant: async () => undefined,
          resolve: (command) => {
            if (!dshControlPlane) {
              throw new Error('DSH control plane is unavailable')
            }
            return dshControlPlane.interactionPermissions.resolve(command)
          },
        },
        onChanged: () => broadcastToolPermissionChanged(),
      },
      capabilityCatalog: {
        catalog: capabilityCatalog,
        importer: capabilityImporter,
        lifecycle: capabilityLifecycle,
      },
      capabilityBuilder: {
        builder: capabilityBuilder,
      },
      runtimeGovernance: {
        service: runtimeGovernance,
      },
      workbenchLayout,
      workbenchDashboard,
      workbenchSystem,
      workbenchTasks,
      workbenchAttachments,
      conversationAttachments,
      workbenchSites,
      workbenchMemos,
      backup: backupIpc,
      quitApp: () => app.quit(),
      respondToCloseRequest: respondToRendererCloseRequest,
      workspace,
      terminalManager,
      codeSnippetService: new CodeSnippetService({ dialog }),
      nativeOverlayManager,
      webWorkbenchManager: webWorkbench,
      ipcMain,
      dialog,
      shell,
    })
    protocol.handle(
      'realmflow-artifact',
      createArtifactProtocolHandler(workspace),
    )
    createWindow()
    // Recovery may wait for a delegated execution slot; keep the window and IPC responsive.
    void recoverRuntimeRuns.execute().catch(() => {
      console.error('Agent Runtime recovery failed', { errorCode: 'runtime_recovery_failed' })
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  .catch((error: unknown) => {
    console.error('RealmFlow initialization failed', error)
    dialog.showErrorBox(
      'RealmFlow 无法启动',
      error instanceof Error ? error.message : String(error),
    )
    app.quit()
  })

function toWorkflowTemplateLibraryItem(
  template: Awaited<ReturnType<ManageWorkflowTemplatesUseCase['create']>>,
): WorkflowTemplateLibraryItemDto {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    status: template.status,
    revision: template.revision,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    currentVersion: {
      id: template.currentVersion.id,
      version: template.currentVersion.version,
      status: template.currentVersion.status,
      checksum: template.currentVersion.checksum,
      nodeCount: template.currentVersion.nodes.length,
      edgeCount: template.currentVersion.edges.length,
      ...(template.currentVersion.createdAt === undefined
        ? {}
        : { createdAt: template.currentVersion.createdAt }),
      ...(template.currentVersion.publishedAt === undefined
        ? {}
        : { publishedAt: template.currentVersion.publishedAt }),
    },
  }
}

function toWorkflowTemplateVersionSummary(
  version: Awaited<
    ReturnType<ManageWorkflowTemplatesUseCase['listVersions']>
  >[number],
): WorkflowTemplateVersionSummaryDto {
  return {
    id: version.id,
    templateId: version.templateId,
    version: version.version,
    status: version.status,
    checksum: version.checksum,
    nodeCount: version.nodes.length,
    edgeCount: version.edges.length,
    ...(version.createdAt === undefined
      ? {}
      : { createdAt: version.createdAt }),
    ...(version.publishedAt === undefined
      ? {}
      : { publishedAt: version.publishedAt }),
  }
}

function toWorkflowTemplateDraft(
  template: Awaited<ReturnType<ManageWorkflowTemplatesUseCase['getDraft']>>,
): WorkflowTemplateDraftDto {
  const summary = toWorkflowTemplateLibraryItem(template)
  return {
    ...summary,
    currentVersion: {
      ...summary.currentVersion,
      nodes: template.currentVersion.nodes.map(toWorkflowTemplateNode),
      edges: structuredClone(template.currentVersion.edges),
    },
  }
}

function toWorkflowTemplateNode(
  node: Awaited<
    ReturnType<ManageWorkflowTemplatesUseCase['getDraft']>
  >['currentVersion']['nodes'][number],
): WorkflowTemplateNodeDto {
  const { executor, completionGate, ...draftNode } = node
  if (draftNode.configuration || !executor) return draftNode
  return {
    ...draftNode,
    configuration: {
      input: {
        includeRequirementBody: true,
        predecessorArtifacts: 'direct',
        includeSpaceKnowledge: false,
        attachments: [...(executor.context?.attachments ?? [])],
      },
      prompt: executor.prompt,
      model: { strategy: 'inherit' },
      connectorIds: [],
      permissions: [],
      artifact: {
        required: true,
        relativePath: executor.artifact.relativePath,
        kind: executor.artifact.kind,
      },
      todos: [],
      completionGate: {
        requireApproval: completionGate?.requireApproval ?? false,
        ...(completionGate?.customGateId
          ? { customGateId: completionGate.customGateId }
          : {}),
      },
      retry: { maxAttempts: 1, backoffMs: 0 },
      skip: { allowed: node.allowSkip, requireReason: false },
    },
  }
}

function requireExtensionPlatform(
  platform: NodeJS.Platform,
): ExtensionPackagePlatform {
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
    return platform
  }
  throw new Error(`Unsupported Extension Package platform: ${platform}`)
}

function mapWorkflowRollbackErrorCode(
  error: unknown,
): WorkflowRollbackErrorCode {
  if (error instanceof RollbackWorkflowError) return error.code
  return 'persistence_failed'
}

function toKnowledgeNoteDto(aggregate: {
  note: {
    id: string
    workspaceId: string
    kind: KnowledgeNoteDto['kind']
    requirementId?: string
    sessionId?: string
    status: KnowledgeNoteDto['status']
    revision: number
    createdAt: number
    updatedAt: number
  }
  currentVersion: {
    title: string
    content: string
    sourceMessageIds: readonly string[]
    version: number
    checksum: string
  }
}): KnowledgeNoteDto {
  return {
    id: aggregate.note.id,
    workspaceId: aggregate.note.workspaceId,
    kind: aggregate.note.kind,
    ...(aggregate.note.requirementId
      ? { requirementId: aggregate.note.requirementId }
      : {}),
    ...(aggregate.note.sessionId
      ? { sessionId: aggregate.note.sessionId }
      : {}),
    title: aggregate.currentVersion.title,
    content: aggregate.currentVersion.content,
    sourceMessageIds: aggregate.currentVersion.sourceMessageIds,
    version: aggregate.currentVersion.version,
    checksum: aggregate.currentVersion.checksum,
    status: aggregate.note.status,
    revision: aggregate.note.revision,
    createdAt: aggregate.note.createdAt,
    updatedAt: aggregate.note.updatedAt,
  }
}

const CUPS_FILTER_EXECUTABLE = 'cupsfilter'

async function printHtmlToPdfWithElectron(
  input: Parameters<ChromiumPdfPrinter['printToPdf']>[0],
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throwAbortError('PDF generation was cancelled')
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })
  const abort = () => window.destroy()
  signal.addEventListener('abort', abort, { once: true })
  try {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('data:text/html')) event.preventDefault()
    })
    await window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(input.html)}`,
    )
    if (signal.aborted) throwAbortError('PDF generation was cancelled')
    await window.webContents.executeJavaScript(
      'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
      true,
    )
    if (signal.aborted) throwAbortError('PDF generation was cancelled')
    const pdf = await window.webContents.printToPDF(input.printOptions)
    return Uint8Array.from(pdf)
  } finally {
    signal.removeEventListener('abort', abort)
    if (!window.isDestroyed()) window.destroy()
  }
}

async function detectCupsfilterPdfReadiness(
  _checkedAt: number,
): Promise<{
  status: 'ready' | 'unavailable'
  reasonCode: string
  quality: 'degraded_text'
}> {
  for (const candidate of cupsfilterCandidates()) {
    try {
      await access(candidate, constants.X_OK)
      return {
        status: 'ready',
        reasonCode: 'runtime_ready',
        quality: 'degraded_text',
      }
    } catch {
      continue
    }
  }
  return {
    status: 'unavailable',
    reasonCode: 'local_dependency_unavailable',
    quality: 'degraded_text',
  }
}

function cupsfilterCandidates(): string[] {
  const pathCandidates = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, CUPS_FILTER_EXECUTABLE))
  return [...new Set([...pathCandidates, '/usr/sbin/cupsfilter'])]
}

function throwAbortError(message: string): never {
  const error = new Error(message)
  error.name = 'AbortError'
  throw error
}

async function shutdownMainRuntime(): Promise<void> {
  nativeOverlayManager?.dispose()
  terminalManager?.dispose()
  scheduleScheduler?.stop()
  scheduleScheduler = null
  knowledgeRefreshScheduler?.stop()
  knowledgeRefreshScheduler = undefined
  if (workspaceCleanupTimer) clearTimeout(workspaceCleanupTimer)
  workspaceCleanupTimer = undefined
  let firstError: unknown
  try {
    await workspaceCleanupRun
  } catch (error) {
    firstError = error
  }
  workspaceCleanupRun = undefined
  try {
    if (knowledgeIndexWorker) await knowledgeIndexWorker.stop()
  } catch (error) {
    firstError ??= error
  }
  knowledgeIndexWorker = undefined
  try {
    await knowledgeStartupRebuildRun
  } catch (error) {
    firstError ??= error
  }
  knowledgeStartupRebuildRun = undefined
  try {
    await dshControlPlane?.drainAndStop()
  } catch (error) {
    firstError ??= error
  }
  dshControlPlane = undefined
  try {
    if (qdrant) await qdrant.stop()
  } catch (error) {
    firstError ??= error
  }
  qdrant = undefined
  try {
    await networkGateway.stop()
  } catch (error) {
    firstError ??= error
  }
  database?.close()
  database = null
  if (firstError) throw firstError
}

app.on('before-quit', (event) => {
  if (shutdownComplete) return
  event.preventDefault()
  if (!rendererCloseApproved) {
    requestRendererCloseApproval()
    return
  }
  if (shutdownStarted) return
  shutdownStarted = true
  void shutdownMainRuntime()
    .catch((error: unknown) => {
      console.error('RealmFlow shutdown failed', error)
    })
    .finally(() => {
      shutdownComplete = true
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function toKnowledgeIndexDto<
  T extends {
    source: KnowledgeSource
    health: 'missing' | 'building' | 'ready' | 'failed'
    index?: {
      id: string
      sourceVersion: string
      sourceChecksum: string
      documentCount: number
      chunkCount: number
      createdAt: number
      committedAt: number | null
    }
    job?: {
      id: string
      status:
        | 'pending'
        | 'running'
        | 'qdrant_written'
        | 'completed'
        | 'failed'
        | 'cancelled'
        | 'interrupted'
      triggerSource:
        'manual' | 'source_event' | 'scheduled' | 'startup_recovery'
      createdAt: number
      updatedAt: number
      completedAt: number | null
      errorCode: string | null
    }
    status?: 'enqueued' | 'replayed' | 'coalesced'
    jobId?: string
  },
>(view: T) {
  return {
    source: view.source,
    health: view.health,
    ...(view.index
      ? {
          index: {
            id: view.index.id,
            sourceVersion: view.index.sourceVersion,
            sourceChecksum: view.index.sourceChecksum,
            embeddingModel: 'Alibaba-NLP/gte-multilingual-base' as const,
            dimensions: 768 as const,
            chunkerVersion: 'realmflow-token-aware-v1' as const,
            documentCount: view.index.documentCount,
            chunkCount: view.index.chunkCount,
            createdAt: view.index.createdAt,
            ...(view.index.committedAt === null
              ? {}
              : { committedAt: view.index.committedAt }),
          },
        }
      : {}),
    ...(view.job
      ? {
          job: {
            id: view.job.id,
            status: view.job.status,
            triggerSource: view.job.triggerSource,
            createdAt: view.job.createdAt,
            updatedAt: view.job.updatedAt,
            ...(view.job.completedAt === null
              ? {}
              : { completedAt: view.job.completedAt }),
            ...(view.job.errorCode === null
              ? {}
              : { errorCode: view.job.errorCode }),
          },
        }
      : {}),
    ...(view.status ? { status: view.status } : {}),
    ...(view.jobId ? { jobId: view.jobId } : {}),
  }
}
