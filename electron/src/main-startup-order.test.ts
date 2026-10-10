import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Main startup recovery order', () => {
  it('owns the sanitized Gateway Runtime and binds it to audited Main services', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const gatewayStart = mainSource.indexOf('new GatewayRuntimeService')
    const runtimeStart = mainSource.indexOf(
      'new ToolExecutionApplicationService',
      gatewayStart
    )
    const gatewaySource = mainSource.slice(gatewayStart, runtimeStart)

    expect(gatewayStart).toBeGreaterThan(-1)
    expect(runtimeStart).toBeGreaterThan(gatewayStart)
    expect(gatewaySource).toContain('appSupport.checkForUpdates')
    expect(gatewaySource).toContain('toolAdapters!.health')
    expect(gatewaySource).toContain('repositories.workRoots.list')
    expect(gatewaySource).toContain('webProviders.get')
    expect(gatewaySource).toContain('REALMFLOW_SCHEMA_VERSION')
    expect(gatewaySource).not.toContain('root.path')
    expect(mainSource).toContain(
      'runGatewayCommand: (input, context) =>'
    )
    expect(mainSource).toContain('gatewayRuntime.execute(input, context)')
  })

  it('derives bundled asset paths without CommonJS globals', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')

    expect(mainSource).toContain('fileURLToPath(import.meta.url)')
    expect(mainSource).not.toContain('__dirname')
  })

  it('recovers pending rollback cancellation before terminalizing AI runs', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const rollbackRecovery = mainSource.indexOf(
      'new RecoverPendingWorkflowRollbacksUseCase'
    )
    const aiRunRecovery = mainSource.indexOf(
      'new RecoverInterruptedRunsUseCase'
    )

    expect(rollbackRecovery).toBeGreaterThan(-1)
    expect(aiRunRecovery).toBeGreaterThan(rollbackRecovery)
  })

  it('starts Qdrant before SQLite, profile initialization and the Sidecar', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const storageMigration = mainSource.indexOf(
      'await prepareQdrantIndexStorageUpgrade'
    )
    const qdrantStart = mainSource.indexOf(
      'const qdrantConnection = await qdrant.start()'
    )
    const qdrantClient = mainSource.indexOf(
      'new QdrantHttpClient',
      qdrantStart
    )
    const sqliteOpen = mainSource.indexOf(
      'openRealmFlowDatabase(databasePath)',
      qdrantClient
    )
    const profileRepository = mainSource.indexOf(
      'new SqliteVectorIndexRepository',
      sqliteOpen
    )
    const profileInitialization = mainSource.indexOf(
      'await vectorIndexes.getActiveProfile()',
      profileRepository
    )
    const sidecarStart = mainSource.indexOf(
      'await sidecar.start()',
      profileInitialization
    )
    const rendererCreation = mainSource.indexOf('createWindow()', qdrantStart)

    expect(storageMigration).toBeGreaterThan(-1)
    expect(qdrantStart).toBeGreaterThan(storageMigration)
    expect(qdrantClient).toBeGreaterThan(qdrantStart)
    expect(sqliteOpen).toBeGreaterThan(qdrantClient)
    expect(profileRepository).toBeGreaterThan(sqliteOpen)
    expect(profileInitialization).toBeGreaterThan(profileRepository)
    expect(sidecarStart).toBeGreaterThan(profileInitialization)
    expect(rendererCreation).toBeGreaterThan(sidecarStart)
  })

  it('recovers profile and written generations before startup rebuild and schedulers', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const profileRecoveryService = mainSource.indexOf(
      'new KnowledgeIndexStartupRecoveryCoordinator'
    )
    const profileRecovery = mainSource.indexOf(
      'await knowledgeStartupRecovery.recover()',
      profileRecoveryService
    )
    const recoveryService = mainSource.indexOf(
      'const knowledgeIndexRecovery = createKnowledgeIndexRecovery(',
      profileRecovery
    )
    const recovery = mainSource.indexOf(
      'await knowledgeIndexRecovery.recover()',
      recoveryService
    )
    const startupRebuild = mainSource.indexOf(
      'knowledgeStartupRebuildRun = startupKnowledgeRebuild',
      recovery
    )
    const refreshScheduler = mainSource.indexOf(
      'await knowledgeRefreshScheduler.start()',
      startupRebuild
    )
    const scheduleScheduler = mainSource.indexOf(
      'await scheduleScheduler.start()',
      startupRebuild
    )

    expect(profileRecoveryService).toBeGreaterThan(-1)
    expect(profileRecovery).toBeGreaterThan(profileRecoveryService)
    expect(recoveryService).toBeGreaterThan(-1)
    expect(recovery).toBeGreaterThan(profileRecovery)
    expect(startupRebuild).toBeGreaterThan(recovery)
    expect(refreshScheduler).toBeGreaterThan(startupRebuild)
    expect(scheduleScheduler).toBeGreaterThan(startupRebuild)
  })

  it('does not rebuild the removed legacy Skill catalog', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const sidecarStart = mainSource.indexOf('await sidecar.start()')

    expect(sidecarStart).toBeGreaterThan(-1)
    expect(mainSource).not.toContain('await skillCatalog.recover()')
  })

  it('shares one Agent Tool Loop Gateway across conversations and AI runs', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const coordinatorMatches = mainSource.match(
      /new AgentToolLoopCoordinator/g
    )
    const conversationStart = mainSource.indexOf(
      'const sendConversationMessage'
    )
    const conversationEnd = mainSource.indexOf(
      'const createGeneralConversation',
      conversationStart
    )
    const conversationSource = mainSource.slice(
      conversationStart,
      conversationEnd
    )

    expect(coordinatorMatches).toHaveLength(1)
    expect(conversationSource).toContain('gateway: runGateway')
    expect(mainSource).toContain('gateway: runGateway')
  })

  it('wires follow-up suggestions to the real model generator', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')

    expect(mainSource).toContain(
      'generator: new RealModelFollowUpSuggestionGenerator'
    )
    expect(mainSource).not.toContain(
      'generator: new DeterministicFollowUpSuggestionGenerator'
    )
  })

  it('injects the authoritative SQLite Agent Profile Catalog into the Runtime', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const repository = mainSource.indexOf(
      'new SqliteAgentProfileRepository(database)'
    )
    const resolver = mainSource.indexOf(
      'new CatalogAgentProfileResolver(agentProfiles)'
    )
    const coordinator = mainSource.indexOf(
      'new AgentToolLoopCoordinator',
      resolver
    )
    const coordinatorEnd = mainSource.indexOf(
      'liveModelSkillRuntime',
      coordinator
    )
    const coordinatorSource = mainSource.slice(coordinator, coordinatorEnd)

    expect(repository).toBeGreaterThan(-1)
    expect(resolver).toBeGreaterThan(repository)
    expect(coordinator).toBeGreaterThan(resolver)
    expect(coordinatorSource).toContain('profiles: agentProfileResolver')
  })

  it('resolves and revokes real Skill Connector grants in Main', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const skillRuntimeStart = mainSource.indexOf(
      'new SidecarSkillExecutableAdapter'
    )
    const skillRuntimeEnd = mainSource.indexOf(
      'const runGateway',
      skillRuntimeStart
    )
    const skillRuntimeSource = mainSource.slice(
      skillRuntimeStart,
      skillRuntimeEnd
    )

    expect(skillRuntimeStart).toBeGreaterThan(-1)
    expect(skillRuntimeSource).toContain('connectors.resolveSkillBindings')
    expect(skillRuntimeSource).toContain('connectors.authorizeSkillService')
    expect(skillRuntimeSource).toContain('connectors.revokeSkillConnector')
    expect(skillRuntimeSource).not.toContain('resolve: async () => []')
  })

  it('runs Capability package tests through the deterministic contract runner', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const packageServiceStart = mainSource.indexOf(
      'new CapabilityPackageService'
    )
    const packageServiceEnd = mainSource.indexOf(
      'await capabilityPackages.recover',
      packageServiceStart
    )
    const packageServiceSource = mainSource.slice(
      packageServiceStart,
      packageServiceEnd
    )

    expect(packageServiceSource).toContain(
      'capabilityContractTests.run'
    )
    expect(packageServiceSource).not.toContain("status: 'passed'")
  })

  it('recovers Tool facts before Agent Runs and resumes through the coordinator', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const permissionRestore = mainSource.indexOf(
      'await liveToolRuntime.restorePendingPermissions()'
    )
    const outboxDrain = mainSource.indexOf(
      'await toolOutboxDispatcher.dispatchBatch()'
    )
    const toolRecovery = mainSource.indexOf(
      'await liveToolRuntime.recoverInterrupted()'
    )
    const agentRecovery = mainSource.indexOf(
      'new RecoverAgentRuntimeRunsUseCase'
    )
    const recoverySource = mainSource.slice(
      mainSource.indexOf('const runtimeRunResumer'),
      mainSource.indexOf('new RecoverInterruptedNodeRunsUseCase')
    )

    expect(permissionRestore).toBeGreaterThan(-1)
    expect(outboxDrain).toBeGreaterThan(permissionRestore)
    expect(toolRecovery).toBeGreaterThan(outboxDrain)
    const terminalReconciliation = mainSource.indexOf('await assistantTimeline.reconcileTerminalConversations')
    expect(terminalReconciliation).toBeGreaterThan(outboxDrain)
    expect(agentRecovery).toBeGreaterThan(terminalReconciliation)
    expect(agentRecovery).toBeGreaterThan(toolRecovery)
    expect(recoverySource).toContain('runGateway.attachRecoveredRun')
    expect(recoverySource).toContain('runGateway.streamEvents')
    expect(recoverySource).toContain('assistantTimeline.appendRecoveredAndProject')
    expect(recoverySource).not.toContain(
      'sidecar.getClient().streamEvents'
    )
    expect(mainSource).not.toContain('recoverPendingTurns')
    const registration = mainSource.indexOf('registerMainIpc({', agentRecovery)
    const window = mainSource.indexOf('createWindow()', registration)
    const start = mainSource.indexOf('void recoverRuntimeRuns.execute().catch', window)
    expect(registration).toBeGreaterThan(agentRecovery)
    expect(window).toBeGreaterThan(registration)
    expect(start).toBeGreaterThan(window)
  })

  it('reconciles pending Agent calls from durable Tool projections', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const recoverySource = mainSource.slice(
      mainSource.indexOf('const pendingCallReconciler'),
      mainSource.indexOf('new RecoverInterruptedNodeRunsUseCase')
    )

    expect(recoverySource).toContain(
      'new PendingCallReconciler(toolProjections)'
    )
    expect(recoverySource).toContain(
      'pendingCallReconciler.reconcile(checkpoint.pendingCalls)'
    )
    expect(recoverySource).not.toContain(
      "call.effect === 'none'"
    )
  })

  it('routes recovery IPC actions through the audited recovery action service', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const actionService = mainSource.indexOf(
      'new AgentRunRecoveryActions'
    )
    const ipcRecovery = mainSource.indexOf(
      'recovery: {',
      actionService
    )
    const ipcRecoveryEnd = mainSource.indexOf(
      'business,',
      ipcRecovery
    )
    const recoverySource = mainSource.slice(ipcRecovery, ipcRecoveryEnd)

    expect(actionService).toBeGreaterThan(-1)
    expect(recoverySource).toContain('recoveryActions.execute')
    expect(recoverySource).not.toContain(
      "if (action === 'branch')"
    )
  })

  it('stops knowledge activity and child processes before closing SQLite', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const shutdownStart = mainSource.indexOf(
      'async function shutdownMainRuntime'
    )
    const refreshStop = mainSource.indexOf(
      'knowledgeRefreshScheduler?.stop()',
      shutdownStart
    )
    const qdrantStop = mainSource.indexOf(
      'await qdrant.stop()',
      shutdownStart
    )
    const workerStop = mainSource.indexOf(
      'await knowledgeIndexWorker.stop()',
      shutdownStart
    )
    const sidecarStop = mainSource.indexOf(
      'await sidecar.stop()',
      shutdownStart
    )
    const databaseClose = mainSource.indexOf(
      'database?.close()',
      shutdownStart
    )

    expect(shutdownStart).toBeGreaterThan(-1)
    expect(refreshStop).toBeGreaterThan(shutdownStart)
    expect(workerStop).toBeGreaterThan(refreshStop)
    expect(sidecarStop).toBeGreaterThan(workerStop)
    expect(qdrantStop).toBeGreaterThan(sidecarStop)
    expect(qdrantStop).toBeGreaterThan(shutdownStart)
    expect(databaseClose).toBeGreaterThan(qdrantStop)
  })

  it('waits for Renderer approval before starting application shutdown', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const closeCoordinator = mainSource.indexOf(
      'function requestRendererCloseApproval'
    )
    const windowClose = mainSource.indexOf("window.on('close'", closeCoordinator)
    const beforeQuit = mainSource.indexOf("app.on('before-quit'", closeCoordinator)
    const requestFromWindow = mainSource.indexOf(
      'requestRendererCloseApproval()',
      windowClose
    )
    const requestFromQuit = mainSource.indexOf(
      'requestRendererCloseApproval()',
      beforeQuit
    )
    const shutdown = mainSource.indexOf('shutdownMainRuntime()', beforeQuit)

    expect(closeCoordinator).toBeGreaterThan(-1)
    expect(windowClose).toBeGreaterThan(closeCoordinator)
    expect(requestFromWindow).toBeGreaterThan(windowClose)
    expect(requestFromQuit).toBeGreaterThan(beforeQuit)
    expect(shutdown).toBeGreaterThan(requestFromQuit)
  })

  it('dispatches repository snapshots to the index worker after every sync path', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const handlerSource = mainSource.slice(
      mainSource.indexOf('ingestLocalRepository:'),
      mainSource.indexOf('retryRepositoryFileIndex:')
    )

    expect(
      handlerSource.match(/runRepositoryIngestion\(\(\) =>/g)
    ).toHaveLength(4)
    expect(handlerSource).not.toContain(
      'knowledgeIndexCoordinator.enqueue({'
    )
  })
})
