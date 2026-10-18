import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSourceIfExists(path: string): string {
  const absolutePath = resolve(path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

describe('Main startup recovery order', () => {
  it('aligns macOS traffic lights with the maximized workbench header', () => {
    const source = readFileSync(resolve('electron/src/main.ts'), 'utf8')

    expect(source).toMatch(
      /trafficLightPosition:\s*process\.platform === 'darwin' \? \{ x: 26, y: 16 \} : undefined/
    )
  })

  it('guards process output before local service logs can reach a closed pipe', () => {
    const source = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const guard = source.indexOf('installProcessOutputErrorGuards()')
    const ready = source.indexOf('.whenReady()')

    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(ready)
  })

  it('excludes a second instance before starting local services and cleans up on terminal signals', () => {
    const source = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const lock = source.indexOf('app.requestSingleInstanceLock()')
    const ready = source.indexOf('.whenReady()')
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(ready)
    expect(source).toContain('if (!hasInstanceLock) app.exit(0)')
    expect(source).toContain('registerTerminationSignals(process')
    const signal = source.slice(source.indexOf('registerTerminationSignals(process'), ready)
    expect(signal).toContain('rendererCloseApproved = true')
    expect(signal).toContain('app.quit()')
  })

  it('lets DSH own runtime admission without composing legacy Tool runtimes', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const gatewayStart = mainSource.indexOf('dshControlPlane = createDshControlPlaneBootstrap')

    expect(gatewayStart).toBeGreaterThan(-1)
    expect(mainSource).toContain('dshRunGateway = dshControlPlane.gateway')
    expect(mainSource).not.toContain('new ToolExecutionApplicationService')
    expect(mainSource).not.toContain('new ToolOutboxDispatcher')
    expect(mainSource).not.toContain('new NodeLocalProcessService')
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

  it('starts DSH before local storage and creates private Python workers after profile initialization', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const dshRuntimeBootstrap = mainSource.indexOf(
      'const dshRuntimeBootstrap = createDshRuntimeBootstrap'
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
    const privateWorkerClient = mainSource.indexOf(
      'new PrivatePythonWorkerClient',
      profileInitialization
    )
    const rendererCreation = mainSource.indexOf('createWindow()', qdrantStart)

    expect(dshRuntimeBootstrap).toBeGreaterThan(-1)
    expect(qdrantStart).toBeGreaterThan(dshRuntimeBootstrap)
    expect(qdrantClient).toBeGreaterThan(qdrantStart)
    expect(sqliteOpen).toBeGreaterThan(qdrantClient)
    expect(profileRepository).toBeGreaterThan(sqliteOpen)
    expect(profileInitialization).toBeGreaterThan(profileRepository)
    expect(privateWorkerClient).toBeGreaterThan(profileInitialization)
    expect(rendererCreation).toBeGreaterThan(privateWorkerClient)
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

  it('does not rebuild the removed Skill catalog', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')

    expect(mainSource).toContain('new SkillRegistryService')
    expect(mainSource).not.toContain('await skillCatalog.recover()')
  })

  it('initializes the DSH runtime supervisor before Agent entry points can accept work', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const locator = mainSource.indexOf('createDshRuntimeBootstrap')
    const supervisor = mainSource.indexOf('const dshRuntimeBootstrap', locator)
    const dshGateway = mainSource.indexOf('createDshControlPlaneBootstrap', supervisor)

    expect(locator).toBeGreaterThan(-1)
    expect(supervisor).toBeGreaterThan(locator)
    expect(dshGateway).toBeGreaterThan(supervisor)
    expect(mainSource).not.toContain('SIGSTOP')
    expect(mainSource).not.toContain('SIGTSTP')
  })

  it('routes local file ingestion through automatic index dispatch', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const helper = mainSource.indexOf(
      'const runLocalFileIngestion = ('
    )
    const handler = mainSource.indexOf('ingestLocalFiles: {')
    const nextHandler = mainSource.indexOf('refreshLocalFileSource: {', handler)
    const handlerSource = mainSource.slice(handler, nextHandler)

    expect(helper).toBeGreaterThan(-1)
    expect(handler).toBeGreaterThan(helper)
    expect(handlerSource).toContain('runLocalFileIngestion(() =>')
    expect(handlerSource).toContain('localFileIngestion.ingest(command)')
    expect(handlerSource).not.toContain(
      'execute: (command) => localFileIngestion.ingest(command)'
    )
  })

  it('wires knowledge index generation through one DSH embedding port', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const embeddingPort = mainSource.indexOf('const dshKnowledgeEmbedding = {')
    const workerStart = mainSource.indexOf(
      'const createKnowledgeIndexWorker',
      embeddingPort
    )
    const workerEnd = mainSource.indexOf(
      'const createKnowledgeIndexGarbageCollector',
      workerStart
    )
    const workerSource = mainSource.slice(workerStart, workerEnd)

    expect(embeddingPort).toBeGreaterThan(-1)
    expect(workerStart).toBeGreaterThan(embeddingPort)
    expect(workerSource).toContain('embedding: dshKnowledgeEmbedding')
    expect(workerSource).not.toContain('embedKnowledgeDocuments: (documents')
  })

  it('backs DSH knowledge embedding with the local DSH worker instead of legacy sidecar embedding endpoints', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const serviceStart = mainSource.indexOf(
      'const dshLocalEmbeddingService = new LocalEmbeddingService'
    )
    const embeddingPort = mainSource.indexOf(
      'const dshKnowledgeEmbedding = {',
      serviceStart
    )
    const embeddingEnd = mainSource.indexOf(
      'const catalogIndexAdapter',
      embeddingPort
    )
    const embeddingSource = mainSource.slice(embeddingPort, embeddingEnd)
    const healthStart = mainSource.indexOf(
      'const knowledgeRuntimeHealth = new KnowledgeRuntimeHealthService'
    )
    const healthEnd = mainSource.indexOf(
      'const systemStatusStore',
      healthStart
    )
    const healthSource = mainSource.slice(healthStart, healthEnd)

    expect(serviceStart).toBeGreaterThan(-1)
    expect(embeddingSource).toContain('dshLocalEmbeddingService')
    expect(embeddingSource).toContain('embedQueries')
    expect(embeddingSource).toContain('embedDocuments')
    expect(embeddingSource).toContain('chunkKnowledgeDocuments')
    expect(embeddingSource).not.toContain('getClient().embedKnowledge')
    expect(embeddingSource).not.toContain('getClient().chunkKnowledgeDocuments')
    expect(healthSource).toContain(
      'dshLocalEmbeddingService.getEmbeddingModelHealth'
    )
    expect(healthSource).not.toContain('getClient().getEmbeddingModelHealth')
  })

  it('shares one DSH AI Run Gateway across Agent entry points', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const dshBootstrapSource = readSourceIfExists(
      'electron/src/bootstrap/dsh-control-plane-bootstrap.ts'
    )
    const dshGatewayMatches =
      dshBootstrapSource.match(/new DshAiRunGateway/g) ?? []
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
    const workflowStart = mainSource.indexOf('const generateStageArtifact')
    const workflowEnd = mainSource.indexOf(
      'cancelAiRun = new CancelAiRunUseCase',
      workflowStart
    )
    const workflowSource = mainSource.slice(workflowStart, workflowEnd)
    const scheduleStart = mainSource.indexOf(
      'liveModelSkillRuntime = new ModelSkillExecutionRuntime'
    )
    const scheduleEnd = mainSource.indexOf(
      'const followUpSuggestions',
      scheduleStart
    )
    const scheduleSource = mainSource.slice(scheduleStart, scheduleEnd)

    expect(dshGatewayMatches).toHaveLength(1)
    expect(mainSource).not.toContain('new AgentToolLoopCoordinator')
    expect(mainSource).not.toContain('new DshAiRunGateway')
    expect(conversationSource).toContain('gateway: dshRunGateway')
    expect(workflowSource).toContain('gateway: dshRunGateway')
    expect(scheduleSource).toContain('gateway: dshRunGateway')
  })

  it('composes DSH control-plane bridge services in a focused bootstrap module', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const bootstrapPath = resolve(
      'electron/src/bootstrap/dsh-control-plane-bootstrap.ts'
    )

    expect(existsSync(bootstrapPath)).toBe(true)
    const bootstrapSource = readFileSync(bootstrapPath, 'utf8')

    expect(mainSource).toContain('createDshControlPlaneBootstrap')
    expect(mainSource).not.toContain('new DshRunManifestPublisher')
    expect(mainSource).not.toContain('new DshRuntimeEventIngestor')
    expect(mainSource).not.toContain('new DshInteractionService')
    expect(mainSource).not.toContain('new DshCredentialBroker')
    expect(mainSource).not.toContain('new DshProductCommandRegistry')
    expect(bootstrapSource).toContain('new DshRunManifestPublisher')
    expect(bootstrapSource).toContain('new DshRuntimeEventIngestor')
    expect(bootstrapSource).toContain('new DshInteractionService')
    expect(bootstrapSource).toContain('new DshCredentialBroker')
    expect(bootstrapSource).toContain('new DshProductCommandRegistry')
    expect(bootstrapSource).toContain('new DshProductCommandServer')
    expect(bootstrapSource).toContain('manifestAcceptors')
    expect(bootstrapSource).toContain('credentialBroker')
    expect(bootstrapSource).toContain('productCommandRegistry')
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

  it('keeps the Agent Profile Catalog product-owned while DSH owns runtime admission', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const bootstrapSource = readSourceIfExists(
      'electron/src/bootstrap/dsh-control-plane-bootstrap.ts'
    )
    const repository = mainSource.indexOf(
      'new SqliteAgentProfileRepository(database)'
    )
    const gateway = bootstrapSource.indexOf('new DshAiRunGateway')
    const gatewaySource = bootstrapSource.slice(gateway)

    expect(repository).toBeGreaterThan(-1)
    expect(gateway).toBeGreaterThan(-1)
    expect(gatewaySource).toContain('DshAgentRunAdmissionCompiler')
    expect(mainSource).not.toContain('new CatalogAgentProfileResolver')
    expect(gatewaySource).not.toContain('profiles: agentProfileResolver')
  })

  it('does not construct a RealmFlow Skill or Connector runtime at Agent admission', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const bootstrapSource = readSourceIfExists(
      'electron/src/bootstrap/dsh-control-plane-bootstrap.ts'
    )
    const gateway = bootstrapSource.indexOf('new DshAiRunGateway')
    const gatewaySource = bootstrapSource.slice(gateway)

    expect(gateway).toBeGreaterThan(-1)
    expect(gatewaySource).toContain('manifestPublisher: dshRunManifestPublisher')
    expect(mainSource).not.toContain('new SkillRuntimeApplicationService')
    expect(mainSource).not.toContain('new SidecarSkillExecutableAdapter')
    expect(mainSource).not.toContain('connectors.resolveSkillBindings')
    expect(mainSource).not.toContain('connectors.authorizeSkillService')
    expect(mainSource).not.toContain('connectors.revokeSkillConnector')
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

  it('resumes Agent Runs through DSH session persistence without legacy Tool recovery', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const bootstrapSource = readSourceIfExists(
      'electron/src/bootstrap/dsh-control-plane-bootstrap.ts'
    )
    const agentRecovery = mainSource.indexOf(
      'new RecoverAgentRuntimeRunsUseCase'
    )
    const recoverySource = mainSource.slice(
      mainSource.indexOf('const dshHistorySync'),
      mainSource.indexOf('new RecoverInterruptedNodeRunsUseCase')
    )

    const terminalReconciliation = mainSource.indexOf('await assistantTimeline.reconcileTerminalConversations')
    expect(terminalReconciliation).toBeGreaterThan(-1)
    expect(agentRecovery).toBeGreaterThan(terminalReconciliation)
    expect(recoverySource).toContain('new DshHistorySync')
    expect(recoverySource).toContain('dshControlPlane.resumeSession')
    expect(bootstrapSource).toContain('runtime.resumeSession')
    expect(recoverySource).toContain('assistantTimeline.appendRecoveredAndProject')
    expect(recoverySource).not.toContain('attachRecoveredRun')
    expect(recoverySource).not.toContain('branchRecoveredRun')
    expect(recoverySource).not.toContain('PendingCallReconciler')
    expect(recoverySource).not.toContain('getClient().streamEvents')
    expect(mainSource).not.toContain('liveToolRuntime.restorePendingPermissions')
    expect(mainSource).not.toContain('toolOutboxDispatcher.dispatchBatch')
    expect(mainSource).not.toContain('liveToolRuntime.recoverInterrupted')
    expect(mainSource).not.toContain('recoverPendingTurns')
    const registration = mainSource.indexOf('registerMainIpc({', agentRecovery)
    const window = mainSource.indexOf('createWindow()', registration)
    const start = mainSource.indexOf('void recoverRuntimeRuns.execute().catch', window)
    expect(registration).toBeGreaterThan(agentRecovery)
    expect(window).toBeGreaterThan(registration)
    expect(start).toBeGreaterThan(window)
  })

  it('does not reconcile legacy checkpoint pending Agent calls during startup', () => {
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const recoverySource = mainSource.slice(
      mainSource.indexOf('const dshHistorySync'),
      mainSource.indexOf('new RecoverInterruptedNodeRunsUseCase')
    )

    expect(recoverySource).not.toContain('PendingCallReconciler')
    expect(recoverySource).not.toContain('checkpoint.pendingCalls')
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
    expect(mainSource).toContain('dshControlPlane.cancelSession')
    expect(recoverySource).not.toContain(
      "if (action === 'branch')"
    )
  })

  it('stops knowledge activity and DSH before closing SQLite', () => {
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
    const dshStop = mainSource.indexOf(
      'await dshControlPlane?.drainAndStop()',
      shutdownStart
    )
    const databaseClose = mainSource.indexOf(
      'database?.close()',
      shutdownStart
    )

    expect(shutdownStart).toBeGreaterThan(-1)
    expect(refreshStop).toBeGreaterThan(shutdownStart)
    expect(workerStop).toBeGreaterThan(refreshStop)
    expect(dshStop).toBeGreaterThan(workerStop)
    expect(qdrantStop).toBeGreaterThan(dshStop)
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
