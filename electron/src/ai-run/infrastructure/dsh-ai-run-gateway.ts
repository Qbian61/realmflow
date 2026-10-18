import { randomUUID } from 'node:crypto'
import {
  createDshSessionBinding,
  type DshSessionBinding
} from '../../../../domain/dsh-session-binding'
import type { SubagentTaskResult } from '../../../../domain/subagent'
import type {
  DshRunManifest,
  DshRunOwner
} from '../../../../domain/dsh-run-manifest'
import {
  AI_RUN_EVENT_TYPES,
  type AiRunEvent,
  type AiRunEventData,
  type AiRunEventType
} from '../../../../domain/ai-run'
import type {
  AssistantRunEvent,
  SubAgentChildProjection,
  ToolCallCategory
} from '../../../../domain/assistant-turn'
import type { ModelExecutionConfig } from '../../../../domain/model'
import {
  redactDshRuntimeEventValue,
  type DshRuntimeEventEnvelope
} from '../../../../shared/dsh-runtime-event-contract'
import type {
  DshRuntimeEventIngestionResult
} from '../../application/dsh/dsh-runtime-event-ingestor'
import type {
  DshRunManifestPublisherInput
} from '../../application/dsh/dsh-run-manifest-publisher'
import type {
  AiRunGateway,
  DshAcpMcpServer,
  DshAcpPromptBlock,
  DshAcpRuntimePort,
  DshAcpSessionUpdate,
  RunContext,
  RunToolConfiguration
} from '../application/ports'

export type DshAgentRunAdmission = {
  cwd: string
  mcpServers?: DshAcpMcpServer[]
  prompt: DshAcpPromptBlock[]
  manifestInput: Omit<
    DshRunManifestPublisherInput,
    'runId' | 'sessionId' | 'owner'
  >
  configOptions?: Array<{
    configId?: string
    id?: string
    value: unknown
  }>
}

export type DshAgentRunCompiler = {
  compile(input: {
    runId: string
    owner: DshRunOwner
    context: RunContext
    model?: ModelExecutionConfig
    toolConfiguration?: RunToolConfiguration
  }): Promise<DshAgentRunAdmission> | DshAgentRunAdmission
}

export type DshRunManifestPublisherPort = {
  publish(input: DshRunManifestPublisherInput): Promise<{
    manifest: DshRunManifest
    manifestId: string
    digest: string
  }>
}

export type DshSessionBindingStore = {
  getByOwner(
    owner: DshRunOwner
  ): Promise<DshSessionBinding | undefined> | DshSessionBinding | undefined
  save(binding: DshSessionBinding): Promise<void> | void
}

export type DshRunManifestAcceptor = {
  acceptRunManifest(input: {
    runtimeInstanceId: string
    manifest: DshRunManifest
  }): Promise<void> | void
}

export type DshRuntimeEventIngestorPort = {
  ingest(
    event: DshRuntimeEventEnvelope
  ): Promise<DshRuntimeEventIngestionResult> | DshRuntimeEventIngestionResult
}

export type DshAiRunGatewayDependencies = {
  runtime: DshAcpRuntimePort
  runtimeIdentity: {
    runtimeInstanceId: string
    runtimeBuildDigest: string
  }
  compiler: DshAgentRunCompiler
  manifestPublisher: DshRunManifestPublisherPort
  sessions: DshSessionBindingStore
  runtimeRuns: {
    create(input: {
      runId: string
      context: RunContext
      manifest: DshRunManifest
      createdAt: number
    }): Promise<void>
    transition(input: {
      runId: string
      status: 'completed' | 'failed' | 'cancelled'
      updatedAt: number
      error?: string
    }): Promise<void>
  }
  runtimeEvents?: DshRuntimeEventIngestorPort
  manifestAcceptors?: DshRunManifestAcceptor[]
  createRunId?: () => string
  now?: () => number
}

type DshAiRunState = {
  runId: string
  sessionId: string
  cwd: string
  manifestRootPaths: string[]
  cwdSessionIdsAtAdmission?: Set<string>
  historyAfterSequence: number
  lastSequence: number
  terminalProjected: boolean
  closed: boolean
  maxSubagents: number
  admittedSubagentCallIds: Set<string>
  acpToolCalls: Map<string, DshAcpToolCallProjection>
  acpSubagentCatalogs: Map<string, DshAcpSubagentCatalogProjection>
  queue: AiRunEvent[]
  waiters: Array<() => void>
  unsubscribe?: () => void
}

type DshAcpToolCallProjection = {
  callId: string
  toolName: string
  category: ToolCallCategory
  argumentsSummary: string
  requestedProjected: boolean
  resultProjected?: boolean
}

type DshAcpSubagentCatalogProjection = {
  childId: string
  childCreatedAt?: number
  label: string
  callId?: string
  completedProjected?: boolean
  resultSummary?: string
  completedAt?: number
}

type DshAcpToolResultProjection =
  | {
      callId: string
      toolExecutionId: string
      toolName: string
      category: ToolCallCategory
      status: 'completed'
      resultSummary?: string
    }
  | {
      callId: string
      toolExecutionId: string
      toolName: string
      category: ToolCallCategory
      status: 'failed'
      errorCode: string
      message: string
    }

const TERMINAL_EVENT_TYPES = new Set<AiRunEvent['type']>([
  'run.completed',
  'run.failed',
  'run.cancelled'
])
const AI_RUN_EVENT_TYPE_SET = new Set<AiRunEventType>(AI_RUN_EVENT_TYPES)
const STORED_SESSION_UPDATE_LIMIT = 200

export class DshAiRunGateway implements AiRunGateway {
  private readonly runs = new Map<string, DshAiRunState>()
  private readonly admittedSessionIds = new Set<string>()
  private readonly closingSessionIds = new Set<string>()
  private readonly createRunId: () => string
  private readonly now: () => number

  constructor(private readonly dependencies: DshAiRunGatewayDependencies) {
    this.createRunId = dependencies.createRunId ?? randomUUID
    this.now = dependencies.now ?? Date.now
  }

  async createRun(
    context: RunContext,
    model?: ModelExecutionConfig,
    toolConfiguration?: RunToolConfiguration
  ): Promise<{ runId: string }> {
    const runId = this.createRunId()
    const owner = ownerFromRunContext(context)
    const admission = await this.dependencies.compiler.compile({
      runId,
      owner,
      context,
      ...(model ? { model } : {}),
      ...(toolConfiguration ? { toolConfiguration } : {})
    })
    if (model !== undefined) {
      await this.dependencies.runtime.syncModelCredentials?.(model)
    }
    await this.dependencies.runtime.start()
    const existingBinding = await this.dependencies.sessions.getByOwner(owner)
    const sessionId = await this.admitSession(existingBinding, admission)
    const publication = await this.dependencies.manifestPublisher.publish({
      ...admission.manifestInput,
      runId,
      sessionId,
      owner
    })
    await this.dependencies.sessions.save(
      createDshSessionBinding({
        owner,
        dshSessionId: sessionId,
        runManifestDigest: publication.manifest.digest,
        runtimeBuildDigest:
          this.dependencies.runtimeIdentity.runtimeBuildDigest,
        createdAt: existingBinding?.createdAt ?? this.now(),
        updatedAt: this.now()
      })
    )
    await this.acceptRunManifest(publication.manifest)
    await this.applySessionConfig(sessionId, publication.manifest, admission)
    await this.dependencies.runtimeRuns.create({
      runId,
      context,
      manifest: publication.manifest,
      createdAt: this.now()
    })
    const cwdSessionIdsAtAdmission =
      await this.snapshotCwdSessionIds(admission.cwd)
    const state = this.createState(
      runId,
      sessionId,
      admission.cwd,
      publication.manifest.context.roots.map((root) => root.path),
      cwdSessionIdsAtAdmission,
      publication.manifest.budget.maxSubagents
    )
    state.historyAfterSequence = await this.sessionHistoryCursor(sessionId)
    const promptPromise = this.dependencies.runtime.prompt({
      sessionId,
      prompt: admission.prompt
    })
    void promptPromise.then(
      (response) => {
        void this.settlePrompt(state, response.stopReason).catch((error: unknown) => {
          this.failRun(state, errorMessage(error))
        })
      },
      (error: unknown) => this.failRun(state, errorMessage(error))
    )
    return { runId }
  }

  async prepare(_context: RunContext): Promise<void> {
    await this.dependencies.runtime.start()
  }

  async createWaitingInputRun(): Promise<{ runId: string }> {
    return { runId: this.createRunId() }
  }

  async resolveWaitingInputRun(_runId: string): Promise<void> {
    return undefined
  }

  async *streamEvents(
    runId: string,
    signal: AbortSignal
  ): AsyncIterable<AiRunEvent> {
    const state = this.requireState(runId)
    const abort = (): void => {
      void this.cancelRun(runId).catch(() => undefined)
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (true) {
        const event = await nextQueuedEvent(state)
        if (event === undefined) return
        if (TERMINAL_EVENT_TYPES.has(event.type)) {
          await this.dependencies.runtimeRuns.transition({
            runId,
            status: runtimeRunTerminalStatus(event.type),
            updatedAt: this.now(),
            ...(event.type === 'run.failed'
              ? { error: errorMessageFromEvent(event) }
              : {})
          })
        }
        yield event
        if (TERMINAL_EVENT_TYPES.has(event.type)) return
      }
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }

  async cancelRun(runId: string): Promise<void> {
    const state = this.requireState(runId)
    if (state.terminalProjected) {
      return
    }
    await this.hydrateStoredSessionUpdates(state).catch(() => undefined)
    const sessionIdsToCancel = await this.sessionIdsToCancel(state)
    const descendantSessionIds = sessionIdsToCancel.filter(
      (sessionId) => sessionId !== state.sessionId
    )
    this.enqueueTerminalRunEvent(state, 'run.cancelled', {
      message: 'Run cancelled'
    })
    for (const sessionId of sessionIdsToCancel) {
      void this.dependencies.runtime
        .cancel({ sessionId })
        .catch(() => undefined)
      if (sessionId !== state.sessionId) {
        void this.dependencies.runtime
          .closeSession({ sessionId })
          .catch(() => undefined)
      }
    }
    if (descendantSessionIds.length > 0) {
      this.closeAdmittedSessionAfterDescendantCancellation(state.sessionId)
    }
  }

  releaseRun(runId: string): void {
    const state = this.runs.get(runId)
    if (state === undefined) return
    this.closeState(state)
    this.runs.delete(runId)
  }

  getToolPolicy(_runId: string): undefined {
    return undefined
  }

  getApprovalProfile(_runId: string): undefined {
    return undefined
  }

  async inspectRecoveryConfiguration(): Promise<{
    profileAvailable: boolean
    capabilitiesAvailable: boolean
    permissionValid: boolean
  }> {
    return {
      profileAvailable: false,
      capabilitiesAvailable: false,
      permissionValid: false
    }
  }

  async attachRecoveredRun(
    _run: unknown,
    _checkpoint: unknown,
    _model?: ModelExecutionConfig
  ): Promise<{ runId: string }> {
    throw new Error('DSH session resume is not available for legacy checkpoints')
  }

  async branchRecoveredRun(
    _run: unknown,
    _checkpoint: unknown,
    _model?: ModelExecutionConfig
  ): Promise<{ runId: string }> {
    throw new Error('DSH session branch is not available for legacy checkpoints')
  }

  async runDelegated(record: {
    task?: { id?: string }
  }, _signal?: AbortSignal): Promise<SubagentTaskResult> {
    return {
      taskId: record.task?.id ?? 'dsh-subagent',
      status: 'failed',
      summary: 'DSH delegated subagent runtime is not available yet',
      evidence: [],
      unresolved: ['DSH delegated subagent runtime is not available yet'],
      artifactIds: [],
      errorCode: 'dsh_subagent_runtime_unavailable'
    }
  }

  private async admitSession(
    existingBinding: DshSessionBinding | undefined,
    admission: DshAgentRunAdmission
  ): Promise<string> {
    if (existingBinding !== undefined) {
      if (existingBinding.lifecycleStatus === 'closing') {
        throw new Error('DSH session is closing')
      }
      if (this.closingSessionIds.has(existingBinding.dshSessionId)) {
        throw new Error('DSH session is closing')
      }
      if (this.admittedSessionIds.has(existingBinding.dshSessionId)) {
        return existingBinding.dshSessionId
      }
      await this.dependencies.runtime.resumeSession({
        sessionId: existingBinding.dshSessionId,
        cwd: admission.cwd,
        mcpServers: admission.mcpServers ?? []
      })
      this.admittedSessionIds.add(existingBinding.dshSessionId)
      return existingBinding.dshSessionId
    }
    const created = await this.dependencies.runtime.newSession({
      cwd: admission.cwd,
      mcpServers: admission.mcpServers ?? []
    })
    this.admittedSessionIds.add(created.sessionId)
    return created.sessionId
  }

  private closeAdmittedSessionAfterDescendantCancellation(sessionId: string): void {
    this.admittedSessionIds.delete(sessionId)
    this.closingSessionIds.add(sessionId)
    void this.dependencies.runtime
      .closeSession({ sessionId })
      .catch(() => undefined)
      .finally(() => {
        this.closingSessionIds.delete(sessionId)
      })
  }

  private async acceptRunManifest(manifest: DshRunManifest): Promise<void> {
    for (const acceptor of this.dependencies.manifestAcceptors ?? []) {
      await acceptor.acceptRunManifest({
        runtimeInstanceId:
          this.dependencies.runtimeIdentity.runtimeInstanceId,
        manifest
      })
    }
  }

  private async applySessionConfig(
    sessionId: string,
    manifest: DshRunManifest,
    admission: DshAgentRunAdmission
  ): Promise<void> {
    const options = [
      ...(manifest.model.reasoningEffort
        ? [
            {
              configId: 'reasoning_effort',
              value: manifest.model.reasoningEffort
            }
          ]
        : []),
      ...(admission.configOptions ?? [])
    ]
    for (const option of options) {
      const configId = option.configId ?? option.id
      if (!configId) {
        throw new Error('DSH ACP config option id is required')
      }
      await this.dependencies.runtime.setConfigOption?.({
        sessionId,
        configId,
        value: option.value
      })
    }
  }

  private createState(
    runId: string,
    sessionId: string,
    cwd: string,
    manifestRootPaths: string[],
    cwdSessionIdsAtAdmission: Set<string> | undefined,
    maxSubagents: number
  ): DshAiRunState {
    const existing = this.runs.get(runId)
    if (existing !== undefined) {
      throw new Error('DSH run is already registered')
    }
    const state: DshAiRunState = {
      runId,
      sessionId,
      cwd,
      manifestRootPaths,
      cwdSessionIdsAtAdmission,
      historyAfterSequence: 0,
      lastSequence: 0,
      terminalProjected: false,
      closed: false,
      maxSubagents,
      admittedSubagentCallIds: new Set(),
      acpToolCalls: new Map(),
      acpSubagentCatalogs: new Map(),
      queue: [],
      waiters: []
    }
    if (this.dependencies.runtime.onSessionUpdate) {
      state.unsubscribe = this.dependencies.runtime.onSessionUpdate(
        sessionId,
        (update) => {
          void this.handleSessionUpdate(state, update).catch((error: unknown) => {
            this.failRun(state, errorMessage(error))
          })
        }
      )
    }
    this.runs.set(runId, state)
    return state
  }

  private async snapshotCwdSessionIds(
    cwd: string
  ): Promise<Set<string> | undefined> {
    const sessions = await this.listCwdSessions(cwd).catch(() => undefined)
    if (sessions === undefined) return undefined
    return new Set(sessions.map((session) => session.sessionId))
  }

  private async sessionIdsToCancel(state: DshAiRunState): Promise<string[]> {
    const sessionIds = new Set(activeSubagentSessionIds(state))
    for (const sessionId of await this.newCwdSessionIds(state)) {
      sessionIds.add(sessionId)
    }
    sessionIds.delete(state.sessionId)
    return [...sessionIds, state.sessionId]
  }

  private async newCwdSessionIds(state: DshAiRunState): Promise<string[]> {
    if (state.cwdSessionIdsAtAdmission === undefined) return []
    const sessions = await this.listCwdSessions(state.cwd).catch(() => [])
    return sessions
      .map((session) => session.sessionId)
      .filter((sessionId) =>
        !state.cwdSessionIdsAtAdmission!.has(sessionId) &&
        sessionId !== state.sessionId
      )
  }

  private async listCwdSessions(
    cwd: string
  ): Promise<Array<{ sessionId: string; cwd: string }>> {
    if (this.dependencies.runtime.listSessions === undefined) return []
    const sessions: Array<{ sessionId: string; cwd: string }> = []
    let cursor: string | undefined
    for (let page = 0; page < 20; page += 1) {
      const response = await this.dependencies.runtime.listSessions({
        cwd,
        ...(cursor ? { cursor } : {})
      })
      sessions.push(...response.sessions)
      if (!response.nextCursor) break
      cursor = response.nextCursor
    }
    return sessions
  }

  private async handleSessionUpdate(
    state: DshAiRunState,
    update: DshAcpSessionUpdate
  ): Promise<void> {
    if (state.terminalProjected) return
    const acpAssistantEvents = this.assistantRunEventsFromAcpUpdate(state, update)
    if (acpAssistantEvents.length > 0) {
      for (const event of acpAssistantEvents) {
        this.enqueueAssistantRunEvent(state, event)
      }
      return
    }
    const runtimeEvent = runtimeEventFromSessionUpdate(update)
    if (runtimeEvent === undefined || this.dependencies.runtimeEvents === undefined) {
      return
    }
    const result = await this.dependencies.runtimeEvents.ingest(runtimeEvent)
    if (result.status === 'duplicate') return
    const assistantRunEvent = result.projection.assistantRunEvent
    if (assistantRunEvent === undefined) return
    this.enqueueAssistantRunEvent(state, assistantRunEvent)
  }

  private assistantRunEventsFromAcpUpdate(
    state: DshAiRunState,
    update: DshAcpSessionUpdate
  ): AssistantRunEvent[] {
    const record = update as Record<string, unknown>
    const sessionUpdate = sessionUpdateName(record)
    if (
      sessionUpdate === 'agent_message_chunk' ||
      sessionUpdate === 'assistant_message_chunk' ||
      sessionUpdate === 'message_chunk'
    ) {
      const delta = textFromAcpUpdate(record)
      if (!delta) return []
      const sequence = state.lastSequence + 1
      return [{
        id: `${state.runId}:acp:${sessionUpdate}:${sequence}`,
        runId: state.runId,
        sequence,
        type: 'answer.delta',
        timestamp: this.now(),
        data: { delta }
      }]
    }
    if (isAcpToolCallUpdate(sessionUpdate)) {
      const toolCall = toolCallFromAcpUpdate(record)
      if (toolCall === undefined) return []
      state.acpToolCalls.set(toolCall.callId, toolCall)
      if (toolCall.requestedProjected) return []
      const projected = {
        ...toolCall,
        requestedProjected: true
      }
      state.acpToolCalls.set(toolCall.callId, projected)
      const requested = this.toolCallRequestedEvent(
        state,
        sessionUpdate,
        projected,
        1
      )
      const rootViolation = filesystemRootViolationFromAcpToolCall(
        record,
        projected,
        state.manifestRootPaths
      )
      if (rootViolation) {
        return [
          requested,
          ...this.manifestRootViolationEvents(
            state,
            sessionUpdate,
            projected,
            2
          )
        ]
      }
      return [
        requested,
        ...this.subagentBudgetFailureEvents(
          state,
          sessionUpdate,
          projected,
          2
        )
      ]
    }
    if (isAcpApprovalAskedUpdate(sessionUpdate)) {
      const approval = approvalFromAcpUpdate(record)
      if (approval === undefined) return []
      const existing = state.acpToolCalls.get(approval.callId)
      const toolCall = existing ?? {
        callId: approval.callId,
        toolName: approval.toolName,
        category: categoryForAcpTool(approval.toolName),
        argumentsSummary: '',
        requestedProjected: false
      }
      const events: AssistantRunEvent[] = []
      if (!toolCall.requestedProjected) {
        const projected = {
          ...toolCall,
          requestedProjected: true
        }
        state.acpToolCalls.set(projected.callId, projected)
        events.push(this.toolCallRequestedEvent(state, sessionUpdate, projected, 1))
      }
      const sequence = state.lastSequence + events.length + 1
      events.push({
        id: `${state.runId}:acp:${sessionUpdate}:${approval.requestId}:${sequence}`,
        runId: state.runId,
        sequence,
        type: 'tool.call.permission_required',
        timestamp: this.now(),
        data: {
          callId: approval.callId,
          toolExecutionId: approval.requestId,
          message: approval.reason
        }
      })
      return events
    }
    if (isAcpSubagentCatalogUpdate(sessionUpdate)) {
      const catalog = subagentCatalogFromAcpUpdate(record)
      if (catalog === undefined) return []
      const toolCall =
        (catalog.callId ? state.acpToolCalls.get(catalog.callId) : undefined) ??
        latestSubagentToolCall(state)
      if (toolCall === undefined) return []
      state.acpSubagentCatalogs.set(catalog.childId, {
        ...catalog,
        callId: toolCall.callId
      })
      const sequence = state.lastSequence + 1
      return [
        subagentDelegationEvent({
          state,
          sessionUpdate,
          sequence,
          toolCall,
          childId: catalog.childId,
          requestedAt: catalog.childCreatedAt ?? this.now(),
          label: catalog.label,
          ordinal: state.acpSubagentCatalogs.size
        })
      ]
    }
    if (isAcpToolResultUpdate(sessionUpdate)) {
      const result = toolResultFromAcpUpdate(record)
      if (result === undefined) return []
      const existing = state.acpToolCalls.get(result.callId)
      if (existing?.resultProjected) return []
      const toolCall = existing ?? {
        callId: result.callId,
        toolName: result.toolName,
        category: result.category,
        argumentsSummary: '',
        requestedProjected: false
      }
      const events: AssistantRunEvent[] = []
      if (!toolCall.requestedProjected) {
        events.push(this.toolCallRequestedEvent(state, sessionUpdate, {
          ...toolCall,
          requestedProjected: true
        }, 1))
      }
      state.acpToolCalls.set(result.callId, {
        ...toolCall,
        requestedProjected: true,
        resultProjected: true
      })
      const sequence = state.lastSequence + events.length + 1
      if (result.status === 'failed') {
        events.push({
          id: `${state.runId}:acp:${sessionUpdate}:${result.callId}:${sequence}`,
          runId: state.runId,
          sequence,
          type: 'tool.call.failed',
          timestamp: this.now(),
          data: {
            callId: result.callId,
            toolExecutionId: result.toolExecutionId,
            toolName: toolCall.toolName,
            category: toolCall.category,
            errorCode: result.errorCode,
            message: result.message
          }
        })
      } else {
        const rootViolation = filesystemRootViolationFromAcpToolResult(
          record,
          result,
          toolCall,
          state.manifestRootPaths
        )
        if (rootViolation) {
          events.push(
            ...this.manifestRootViolationEvents(
              state,
              sessionUpdate,
              toolCall,
              events.length + 1,
              result.toolExecutionId
            )
          )
          return events
        }
        events.push({
          id: `${state.runId}:acp:${sessionUpdate}:${result.callId}:${sequence}`,
          runId: state.runId,
          sequence,
          type: 'tool.call.completed',
          timestamp: this.now(),
          data: {
            callId: result.callId,
            toolExecutionId: result.toolExecutionId,
            ...(result.resultSummary
              ? { resultSummary: result.resultSummary }
              : {})
          }
        })
        const subagentChildId = subagentChildIdFromResultSummary(
          result.resultSummary
        )
        if (subagentChildId) {
          const delegationSequence = state.lastSequence + events.length + 1
          state.acpSubagentCatalogs.set(subagentChildId, {
            childId: subagentChildId,
            label: subagentObjective(toolCall),
            callId: toolCall.callId
          })
          events.push(
            subagentDelegationEvent({
              state,
              sessionUpdate,
              sequence: delegationSequence,
              toolCall,
              childId: subagentChildId,
              requestedAt: this.now()
            })
          )
        }
      }
      return events
    }
    if (isAcpAgentInboxUpdate(sessionUpdate)) {
      const completions = subagentCompletionsFromAcpUpdate(record)
      const events: AssistantRunEvent[] = []
      for (const completion of completions) {
        const catalog = state.acpSubagentCatalogs.get(completion.childId)
        if (catalog === undefined || catalog.completedProjected) continue
        if (!catalog.callId) continue
        const toolCall = state.acpToolCalls.get(catalog.callId)
        if (toolCall === undefined) continue
        const completedAt = completion.completedAt ?? this.now()
        const sequence = state.lastSequence + events.length + 1
        state.acpSubagentCatalogs.set(completion.childId, {
          ...catalog,
          completedProjected: true,
          resultSummary: completion.summary,
          completedAt
        })
        events.push(
          subagentDelegationEvent({
            state,
            sessionUpdate,
            sequence,
            toolCall,
            childId: completion.childId,
            requestedAt: catalog.childCreatedAt ?? completedAt,
            label: catalog.label,
            ordinal: subagentOrdinal(state, completion.childId),
            status: 'completed',
            resultSummary: completion.summary,
            completedAt
          })
        )
      }
      return events
    }
    return []
  }

  private toolCallRequestedEvent(
    state: DshAiRunState,
    sessionUpdate: string,
    toolCall: DshAcpToolCallProjection,
    offset: number
  ): Extract<AssistantRunEvent, { type: 'tool.call.requested' }> {
    const sequence = state.lastSequence + offset
    return {
      id: `${state.runId}:acp:${sessionUpdate}:${toolCall.callId}:${sequence}`,
      runId: state.runId,
      sequence,
      type: 'tool.call.requested',
      timestamp: this.now(),
      data: {
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        category: toolCall.category,
        argumentsSummary: toolCall.argumentsSummary
      }
    }
  }

  private subagentBudgetFailureEvents(
    state: DshAiRunState,
    sessionUpdate: string,
    toolCall: DshAcpToolCallProjection,
    offset: number
  ): AssistantRunEvent[] {
    if (!isSubagentToolCall(toolCall)) return []
    if (state.admittedSubagentCallIds.has(toolCall.callId)) return []
    if (state.admittedSubagentCallIds.size < state.maxSubagents) {
      state.admittedSubagentCallIds.add(toolCall.callId)
      return []
    }
    const message = `Subagent budget exhausted: maxSubagents=${state.maxSubagents}`
    this.terminateSessionAfterRunFailure(state)
    const failedSequence = state.lastSequence + offset
    const terminalSequence = failedSequence + 1
    return [
      {
        id: `${state.runId}:acp:${sessionUpdate}:${toolCall.callId}:budget:${failedSequence}`,
        runId: state.runId,
        sequence: failedSequence,
        type: 'tool.call.failed',
        timestamp: this.now(),
        data: {
          callId: toolCall.callId,
          toolExecutionId: `${toolCall.callId}:budget`,
          toolName: toolCall.toolName,
          category: toolCall.category,
          errorCode: 'runtime_budget_exhausted',
          message
        }
      },
      {
        id: `${state.runId}:acp:${sessionUpdate}:${toolCall.callId}:budget:${terminalSequence}`,
        runId: state.runId,
        sequence: terminalSequence,
        type: 'run.failed',
        timestamp: this.now(),
        data: {
          errorCode: 'runtime_budget_exhausted',
          message
        }
      }
    ]
  }

  private manifestRootViolationEvents(
    state: DshAiRunState,
    sessionUpdate: string,
    toolCall: DshAcpToolCallProjection,
    offset: number,
    toolExecutionId?: string
  ): AssistantRunEvent[] {
    const message = 'Filesystem tool path is outside the manifest roots'
    this.terminateSessionAfterRunFailure(state)
    const failedSequence = state.lastSequence + offset
    const terminalSequence = failedSequence + 1
    return [
      {
        id: `${state.runId}:acp:${sessionUpdate}:${toolCall.callId}:manifest-root:${failedSequence}`,
        runId: state.runId,
        sequence: failedSequence,
        type: 'tool.call.failed',
        timestamp: this.now(),
        data: {
          callId: toolCall.callId,
          toolExecutionId: toolExecutionId ?? `${toolCall.callId}:manifest-root`,
          toolName: toolCall.toolName,
          category: toolCall.category,
          errorCode: 'manifest_root_violation',
          message
        }
      },
      {
        id: `${state.runId}:acp:${sessionUpdate}:${toolCall.callId}:manifest-root:${terminalSequence}`,
        runId: state.runId,
        sequence: terminalSequence,
        type: 'run.failed',
        timestamp: this.now(),
        data: {
          errorCode: 'manifest_root_violation',
          message
        }
      }
    ]
  }

  private terminateSessionAfterRunFailure(state: DshAiRunState): void {
    this.admittedSessionIds.delete(state.sessionId)
    this.closingSessionIds.add(state.sessionId)
    void this.dependencies.runtime.cancel({ sessionId: state.sessionId })
      .catch(() => undefined)
    void this.dependencies.runtime.closeSession({ sessionId: state.sessionId })
      .catch(() => undefined)
      .finally(() => {
        this.closingSessionIds.delete(state.sessionId)
      })
  }

  private enqueueAssistantRunEvent(
    state: DshAiRunState,
    event: AssistantRunEvent
  ): void {
    const projected = assistantEventToAiRunEvent(state, event)
    if (projected === undefined) return
    const sequence = projected.sequence
    state.lastSequence = sequence
    if (TERMINAL_EVENT_TYPES.has(projected.type)) {
      state.terminalProjected = true
      enqueue(state, projected)
      this.closeState(state)
      return
    }
    enqueue(state, projected)
  }

  private async settlePrompt(
    state: DshAiRunState,
    stopReason: string
  ): Promise<void> {
    if (state.terminalProjected) {
      this.closeState(state)
      return
    }
    await this.hydrateStoredSessionUpdates(state)
    switch (stopReason) {
      case 'cancelled':
      case 'canceled':
        this.enqueueTerminalRunEvent(state, 'run.cancelled', {
          message: 'Run cancelled'
        })
        return
      case 'error':
      case 'failed':
        this.enqueueTerminalRunEvent(state, 'run.failed', {
          message: 'DSH prompt failed'
        })
        return
      default:
        this.enqueueTerminalRunEvent(state, 'run.completed', {})
    }
  }

  private async sessionHistoryCursor(sessionId: string): Promise<number> {
    try {
      return await this.dependencies.runtime.getSessionUpdateCursor?.({
        sessionId
      }) ?? 0
    } catch {
      return 0
    }
  }

  private async hydrateStoredSessionUpdates(
    state: DshAiRunState
  ): Promise<void> {
    if (this.dependencies.runtime.readSessionUpdates === undefined) return
    let afterSequence = state.historyAfterSequence
    for (let page = 0; page < 20; page += 1) {
      const range = await this.dependencies.runtime.readSessionUpdates({
        sessionId: state.sessionId,
        afterSequence,
        limit: STORED_SESSION_UPDATE_LIMIT
      })
      for (const update of range.updates) {
        await this.handleSessionUpdate(state, update)
      }
      state.historyAfterSequence = range.nextAfterSequence
      afterSequence = range.nextAfterSequence
      if (!range.hasMore) return
    }
  }

  private failRun(state: DshAiRunState, message: string): void {
    if (state.terminalProjected) return
    this.enqueueTerminalRunEvent(state, 'run.failed', { message })
  }

  private enqueueTerminalRunEvent(
    state: DshAiRunState,
    type: Extract<
      AiRunEvent['type'],
      'run.completed' | 'run.failed' | 'run.cancelled'
    >,
    data: AiRunEvent['data']
  ): void {
    state.terminalProjected = true
    enqueue(state, {
      id: `${state.runId}:${type}:${state.lastSequence + 1}`,
      runId: state.runId,
      sequence: state.lastSequence + 1,
      type,
      timestamp: new Date(this.now()).toISOString(),
      data
    })
    state.lastSequence += 1
    this.closeState(state)
  }

  private closeState(state: DshAiRunState): void {
    if (state.closed) return
    state.closed = true
    state.unsubscribe?.()
    wakeWaiters(state)
  }

  private requireState(runId: string): DshAiRunState {
    const state = this.runs.get(runId)
    if (state === undefined) {
      throw new Error('DSH run is not registered')
    }
    return state
  }
}

function runtimeRunTerminalStatus(
  type: AiRunEvent['type']
): 'completed' | 'failed' | 'cancelled' {
  if (type === 'run.completed') return 'completed'
  if (type === 'run.cancelled') return 'cancelled'
  return 'failed'
}

function errorMessageFromEvent(event: AiRunEvent): string {
  const message = event.data.message
  return typeof message === 'string' && message.trim()
    ? message
    : 'DSH run failed'
}

function ownerFromRunContext(context: RunContext): DshRunOwner {
  if ('nodeRunId' in context && context.nodeRunId) {
    return {
      workspaceId: context.workspaceId,
      requirementId: context.requirementId,
      nodeRunId: context.nodeRunId
    }
  }
  if ('requirementId' in context && context.requirementId && context.workspaceId) {
    return {
      workspaceId: context.workspaceId,
      requirementId: context.requirementId
    }
  }
  if ('workspaceId' in context && context.workspaceId) {
    return {
      workspaceId: context.workspaceId
    }
  }
  if ('scheduleRunId' in context && context.scheduleRunId) {
    return {
      scheduleRunId: context.scheduleRunId
    }
  }
  if ('conversationId' in context && context.conversationId) {
    return {
      conversationId: context.conversationId
    }
  }
  throw new Error('DSH run owner cannot be derived from run context')
}

function runtimeEventFromSessionUpdate(
  update: DshAcpSessionUpdate
): DshRuntimeEventEnvelope | undefined {
  const record = update as Record<string, unknown>
  const event = record.event ?? record.runtimeEvent
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return undefined
  }
  return event as DshRuntimeEventEnvelope
}

function sessionUpdateName(record: Record<string, unknown>): string {
  if (typeof record.sessionUpdate === 'string') return record.sessionUpdate
  if (typeof record.type === 'string') return record.type
  return ''
}

function isAcpToolCallUpdate(sessionUpdate: string): boolean {
  return sessionUpdate === 'tool/call' ||
    sessionUpdate === 'tool.call' ||
    sessionUpdate === 'tool_call'
}

function isAcpApprovalAskedUpdate(sessionUpdate: string): boolean {
  return sessionUpdate === 'approval/asked' ||
    sessionUpdate === 'approval.asked' ||
    sessionUpdate === 'approval_asked'
}

function isAcpSubagentCatalogUpdate(sessionUpdate: string): boolean {
  return sessionUpdate === 'subagent/catalog' ||
    sessionUpdate === 'subagent.catalog' ||
    sessionUpdate === 'subagent_catalog'
}

function isAcpToolResultUpdate(sessionUpdate: string): boolean {
  return sessionUpdate === 'tool/result' ||
    sessionUpdate === 'tool.result' ||
    sessionUpdate === 'tool_result'
}

function isAcpAgentInboxUpdate(sessionUpdate: string): boolean {
  return sessionUpdate === 'agent/inbox/spliced' ||
    sessionUpdate === 'agent.inbox.spliced' ||
    sessionUpdate === 'agent_inbox_spliced'
}

function toolCallFromAcpUpdate(
  record: Record<string, unknown>
): DshAcpToolCallProjection | undefined {
  const payload = payloadRecord(record)
  const callId = textField(payload, ['callId', 'toolCallId', 'id'])
  if (!callId) return undefined
  const toolName = textField(payload, [
    'name',
    'toolName',
    'capabilityName',
    'capabilityId'
  ])
  const argumentsSummary = argumentsSummaryFromAcpToolCall(payload)
  if (!toolName && !argumentsSummary) return undefined
  return {
    callId,
    toolName: toolName || 'tool',
    category: categoryForAcpTool(toolName),
    argumentsSummary,
    requestedProjected: false
  }
}

function approvalFromAcpUpdate(
  record: Record<string, unknown>
): {
  requestId: string
  callId: string
  toolName: string
  reason: string
} | undefined {
  const payload = payloadRecord(record)
  const callId = textField(payload, ['callId', 'toolCallId', 'activityId'])
  if (!callId) return undefined
  const requestId = textField(payload, ['id', 'requestId']) || callId
  const toolName =
    textField(payload, ['toolName', 'name', 'capabilityName', 'capabilityId']) ||
    'tool'
  const reason =
    textField(payload, ['reason', 'message', 'justification']) ||
    'Tool permission is required'
  return {
    requestId,
    callId,
    toolName,
    reason
  }
}

function toolResultFromAcpUpdate(
  record: Record<string, unknown>
): DshAcpToolResultProjection | undefined {
  const payload = payloadRecord(record)
  const message = nestedRecord(payload, 'message')
  const source = message ? nestedRecord(message, 'source') : undefined
  const callId =
    textField(payload, ['callId', 'toolCallId', 'activityId']) ||
    (message ? textField(message, ['toolCallId', 'callId']) : '') ||
    (source ? textField(source, ['callId']) : '')
  if (!callId) return undefined
  const toolExecutionId =
    textField(payload, ['toolExecutionId', 'jobId', 'id', 'requestId']) ||
    (message ? textField(message, ['id']) : '') ||
    callId
  const toolName =
    textField(payload, ['toolName', 'name', 'capabilityName', 'capabilityId']) ||
    (message ? textField(message, ['toolName', 'name']) : '') ||
    'tool'
  const category = categoryForAcpTool(toolName)
  const exitCode = nonZeroExitCode(payload, message)
  const failed = acpToolResultFailed(payload, message) || exitCode !== undefined
  if (failed) {
    const messageText =
      textField(payload, ['message', 'error', 'reason']) ||
      (message ? textField(message, ['message', 'error', 'reason']) : '') ||
      toolResultSummary(payload, message) ||
      'Tool call failed'
    return {
      callId,
      toolExecutionId,
      toolName,
      category,
      status: 'failed',
      errorCode:
        textField(payload, ['errorCode', 'code']) ||
        (message ? textField(message, ['errorCode', 'code']) : '') ||
        (exitCode !== undefined ? `process_exit_code_${exitCode}` : '') ||
        'tool_result_failed',
      message: messageText
    }
  }
  const resultSummary = toolResultSummary(payload, message)
  return {
    callId,
    toolExecutionId,
    toolName,
    category,
    status: 'completed',
    ...(resultSummary ? { resultSummary } : {})
  }
}

function subagentCatalogFromAcpUpdate(
  record: Record<string, unknown>
): DshAcpSubagentCatalogProjection | undefined {
  const payload = payloadRecord(record)
  const childId = textField(payload, [
    'childId',
    'childSessionId',
    'sessionId',
    'id'
  ])
  if (!childId) return undefined
  const label =
    textField(payload, ['label', 'description', 'objective']) ||
    'Subagent task'
  const callId = textField(payload, ['callId', 'toolCallId', 'activityId'])
  return {
    childId,
    label,
    ...(callId ? { callId } : {}),
    ...(numberField(payload, ['childCreatedAt', 'createdAt', 'requestedAt'])
      ? {
          childCreatedAt: numberField(payload, [
            'childCreatedAt',
            'createdAt',
            'requestedAt'
          ])
        }
      : {})
  }
}

function latestSubagentToolCall(
  state: DshAiRunState
): DshAcpToolCallProjection | undefined {
  return [...state.acpToolCalls.values()]
    .reverse()
    .find((toolCall) =>
      !toolCall.resultProjected &&
      (toolCall.toolName === 'subagent' || toolCall.category === 'agent')
    )
}

function isSubagentToolCall(toolCall: DshAcpToolCallProjection): boolean {
  return toolCall.toolName === 'subagent' || toolCall.category === 'agent'
}

function activeSubagentSessionIds(
  state: DshAiRunState
): string[] {
  const sessionIds = new Set<string>()
  for (const catalog of state.acpSubagentCatalogs.values()) {
    if (catalog.completedProjected) continue
    if (catalog.childId === state.sessionId) continue
    sessionIds.add(catalog.childId)
  }
  return [...sessionIds]
}

function subagentDelegationEvent(input: {
  state: DshAiRunState
  sessionUpdate: string
  sequence: number
  toolCall: DshAcpToolCallProjection
  childId: string
  requestedAt: number
  label?: string
  ordinal?: number
  status?: SubAgentChildProjection['status']
  resultSummary?: string
  completedAt?: number
}): Extract<AssistantRunEvent, { type: 'delegation.updated' }> {
  return {
    id: `${input.state.runId}:acp:${input.sessionUpdate}:${input.childId}:${input.sequence}`,
    runId: input.state.runId,
    sequence: input.sequence,
    type: 'delegation.updated',
    timestamp: Date.now(),
    data: {
      groupId: `subagent:${input.toolCall.callId}`,
      callId: input.toolCall.callId,
      parentRunId: input.state.runId,
      strategy: 'parallel',
      requestedAt: input.requestedAt,
      ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
      children: [
        {
          taskId: input.childId,
          childRunId: input.childId,
          childSessionId: input.childId,
          ordinal: input.ordinal ?? 1,
          agentId: 'builtin.general',
          agentName: 'General',
          objective: input.label ?? subagentObjective(input.toolCall),
          status: input.status ?? 'running',
          ...(input.resultSummary ? { resultSummary: input.resultSummary } : {}),
          evidenceCount: 0,
          artifactIds: [],
          ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
          tree: []
        }
      ]
    }
  }
}

function subagentCompletionsFromAcpUpdate(
  record: Record<string, unknown>
): Array<{ childId: string; summary: string; completedAt?: number }> {
  const payload = payloadRecord(record)
  const inserted = payload.inserted
  if (!Array.isArray(inserted)) return []
  const completedAt = numberField(record, ['time']) ?? numberField(payload, ['time'])
  return inserted.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const insertedRecord = item as Record<string, unknown>
    const source = nestedRecord(insertedRecord, 'source')
    const sourceKind = source ? textField(source, ['kind']) : ''
    if (sourceKind !== 'agent-message' && sourceKind !== 'subagent-settled') {
      return []
    }
    const childId = source ? textField(source, ['senderSessionId', 'agentId', 'sessionId']) : ''
    if (!childId) return []
    const summary = insertedContentSummary(insertedRecord)
    if (!summary) return []
    return [{
      childId,
      summary,
      ...(completedAt === undefined ? {} : { completedAt })
    }]
  })
}

function insertedContentSummary(record: Record<string, unknown>): string {
  const content = record.content
  if (Array.isArray(content)) {
    const texts = content.map(contentSummary).filter(Boolean)
    return truncateSummary((texts.at(-1) ?? '').trim())
  }
  return truncateSummary(contentSummary(content).trim())
}

function subagentOrdinal(
  state: DshAiRunState,
  childId: string
): number {
  return Math.max(1, [...state.acpSubagentCatalogs.keys()].indexOf(childId) + 1)
}

function subagentChildIdFromResultSummary(
  summary: string | undefined
): string | undefined {
  if (!summary) return undefined
  const match = /\bstarted\s+subagent\s+([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*)\b/i.exec(summary)
  return match?.[1]
}

function subagentObjective(toolCall: DshAcpToolCallProjection): string {
  try {
    const parsed = JSON.parse(toolCall.argumentsSummary) as {
      description?: unknown
      prompt?: unknown
    }
    if (typeof parsed.description === 'string' && parsed.description.trim()) {
      return parsed.description.trim()
    }
    if (typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
      return parsed.prompt.trim()
    }
  } catch {
    return toolCall.argumentsSummary || 'Subagent task'
  }
  return 'Subagent task'
}

function nestedRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = record[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function payloadRecord(record: Record<string, unknown>): Record<string, unknown> {
  const data = record.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return record
}

function textField(
  record: Record<string, unknown>,
  keys: readonly string[]
): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function numberField(
  record: Record<string, unknown>,
  keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

function argumentsSummaryFromAcpToolCall(
  record: Record<string, unknown>
): string {
  const args = record.arguments ?? record.args ?? record.input
  if (args === undefined) return ''
  if (typeof args === 'string') {
    try {
      return JSON.stringify(redactDshRuntimeEventValue(JSON.parse(args)))
    } catch {
      const redacted = redactDshRuntimeEventValue(args)
      return typeof redacted === 'string' ? redacted : String(redacted)
    }
  }
  if (args && typeof args === 'object') {
    return JSON.stringify(redactDshRuntimeEventValue(args))
  }
  return String(args)
}

function acpToolResultFailed(
  payload: Record<string, unknown>,
  message: Record<string, unknown> | undefined
): boolean {
  if (payload.isError === true || message?.isError === true) return true
  const status =
    textField(payload, ['status']) || (message ? textField(message, ['status']) : '')
  return /^(?:failed|error|errored)$/i.test(status)
}

function nonZeroExitCode(
  payload: Record<string, unknown>,
  message: Record<string, unknown> | undefined
): number | undefined {
  const directCandidates = [
    payload.exitCode,
    nestedRecord(payload, 'output')?.exitCode,
    nestedRecord(payload, 'result')?.exitCode,
    message?.exitCode,
    message ? nestedRecord(message, 'output')?.exitCode : undefined,
    message ? nestedRecord(message, 'result')?.exitCode : undefined
  ]

  for (const candidate of directCandidates) {
    const exitCode = parseExitCode(candidate)
    if (exitCode !== undefined && exitCode !== 0) return exitCode
  }

  return exitCodeFromText(toolResultSummary(payload, message))
}

function toolResultSummary(
  payload: Record<string, unknown>,
  message: Record<string, unknown> | undefined
): string {
  const text =
    textField(payload, ['resultSummary', 'summary']) ||
    (message ? textField(message, ['resultSummary', 'summary']) : '') ||
    contentSummary(payload.output) ||
    contentSummary(payload.result) ||
    (message ? contentSummary(message.content) : '') ||
    (message ? contentSummary(message.output) : '')
  return truncateSummary(text.trim())
}

function filesystemRootViolationFromAcpToolCall(
  record: Record<string, unknown>,
  toolCall: DshAcpToolCallProjection,
  rootPaths: string[]
): boolean {
  if (!shouldEnforceFilesystemRoots(toolCall)) return false
  const payload = payloadRecord(record)
  const input = payload.arguments ?? payload.args ?? payload.input
  return hasPathOutsideManifestRoots(input, rootPaths)
}

function filesystemRootViolationFromAcpToolResult(
  record: Record<string, unknown>,
  result: Extract<DshAcpToolResultProjection, { status: 'completed' }>,
  toolCall: DshAcpToolCallProjection,
  rootPaths: string[]
): boolean {
  if (!shouldEnforceFilesystemRoots(toolCall)) return false
  const payload = payloadRecord(record)
  const message = nestedRecord(payload, 'message')
  return hasPathOutsideManifestRoots([
    result.resultSummary,
    payload.resultSummary,
    payload.summary,
    payload.output,
    payload.result,
    message?.resultSummary,
    message?.summary,
    message?.content,
    message?.output
  ], rootPaths)
}

function shouldEnforceFilesystemRoots(
  toolCall: DshAcpToolCallProjection
): boolean {
  return toolCall.category === 'filesystem'
}

function hasPathOutsideManifestRoots(
  value: unknown,
  rootPaths: string[]
): boolean {
  const normalizedRoots = rootPaths.map(normalizeFilesystemPath).filter(Boolean)
  if (normalizedRoots.length === 0) return false
  return localFilesystemPathsFromValue(value).some(
    (path) => !isInsideAnyRoot(path, normalizedRoots)
  )
}

function localFilesystemPathsFromValue(
  value: unknown,
  depth = 0
): string[] {
  if (depth > 8 || value === undefined || value === null) return []
  if (typeof value === 'string') {
    const parsed = parseJsonLikeString(value)
    if (parsed !== undefined) {
      return localFilesystemPathsFromValue(parsed, depth + 1)
    }
    return localFilesystemPathsFromText(value)
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      localFilesystemPathsFromValue(item, depth + 1)
    )
  }
  if (typeof value !== 'object') return []
  return Object.values(value as Record<string, unknown>).flatMap((item) =>
    localFilesystemPathsFromValue(item, depth + 1)
  )
}

function parseJsonLikeString(value: string): unknown | undefined {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

function localFilesystemPathsFromText(value: string): string[] {
  const candidates = new Set<string>()
  const trimmed = cleanFilesystemPathToken(value.trim())
  if (isLocalAbsolutePath(trimmed)) {
    candidates.add(trimmed)
  }
  const pattern = /(?:^|[\s"'`=:(<>])((?:\/[^\s"'`<>|;&]+)+)/g
  for (const match of value.matchAll(pattern)) {
    const candidate = cleanFilesystemPathToken(match[1] ?? '')
    if (isXmlClosingTagToken(match[0] ?? '', candidate)) continue
    if (isLocalAbsolutePath(candidate)) {
      candidates.add(candidate)
    }
  }
  return [...candidates]
}

function isXmlClosingTagToken(rawMatch: string, candidate: string): boolean {
  return rawMatch.startsWith('</') &&
    /^\/[A-Za-z][A-Za-z0-9._:-]*$/.test(candidate)
}

function cleanFilesystemPathToken(value: string): string {
  return value
    .replace(/^["'`<({[]+/, '')
    .replace(/[>"'`)}\],.;:]+$/, '')
}

function isLocalAbsolutePath(value: string): boolean {
  if (!value) return false
  if (/^https?:\/\//i.test(value)) return false
  return value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value)
}

function normalizeFilesystemPath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function isInsideAnyRoot(path: string, normalizedRoots: string[]): boolean {
  const normalizedPath = normalizeFilesystemPath(path)
  return normalizedRoots.some((root) =>
    root === '/'
      ? normalizedPath.startsWith('/')
      : normalizedPath === root || normalizedPath.startsWith(`${root}/`)
  )
}

function contentSummary(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(contentSummary).filter(Boolean).join('\n')
  }
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  const text = textField(record, ['text', 'content', 'output', 'stdout', 'stderr'])
  if (text) return text
  return JSON.stringify(redactDshRuntimeEventValue(record))
}

function parseExitCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  return undefined
}

function exitCodeFromText(value: string): number | undefined {
  const match = /\bexit\s*code\s*:?\s*(-?\d+)\b/i.exec(value)
  if (!match) return undefined
  const exitCode = Number(match[1])
  return Number.isInteger(exitCode) && exitCode !== 0 ? exitCode : undefined
}

function truncateSummary(value: string): string {
  return value.length > 4_000 ? `${value.slice(0, 4_000)}...` : value
}

function categoryForAcpTool(toolName: string): ToolCallCategory {
  if (/(?:^|[._-])(?:bash|shell|command|terminal|exec|process[._-]run)(?:[._-]|$)/i.test(toolName)) {
    return 'command'
  }
  if (/(?:^|[._-])web[._-]?(?:search|fetch)(?:[._-]|$)/i.test(toolName)) {
    return 'web_search'
  }
  if (/(?:^|[._-])(?:file|files|filesystem|read|write|edit|glob|grep|ls)(?:[._-]|$)/i.test(toolName)) {
    return 'filesystem'
  }
  if (/skill/i.test(toolName)) return 'skill'
  if (/agent/i.test(toolName)) return 'agent'
  if (/mcp/i.test(toolName)) return 'mcp'
  if (/connector/i.test(toolName)) return 'connector'
  return 'other'
}

function textFromAcpUpdate(record: Record<string, unknown>): string | undefined {
  for (const key of ['text', 'delta', 'message'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  const content = record.content
  if (typeof content === 'string' && content.length > 0) return content
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return undefined
  }
  const contentRecord = content as Record<string, unknown>
  for (const key of ['text', 'delta', 'content'] as const) {
    const value = contentRecord[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function assistantEventToAiRunEvent(
  state: DshAiRunState,
  event: AssistantRunEvent
): AiRunEvent | undefined {
  if (!AI_RUN_EVENT_TYPE_SET.has(event.type as AiRunEventType)) {
    return undefined
  }
  const sequence =
    event.sequence > state.lastSequence
      ? event.sequence
      : state.lastSequence + 1
  return {
    id: event.id,
    runId: state.runId,
    sequence,
    type: event.type as AiRunEventType,
    timestamp: new Date(event.timestamp).toISOString(),
    data: event.data as AiRunEventData
  }
}

function enqueue(state: DshAiRunState, event: AiRunEvent): void {
  state.queue.push(event)
  wakeWaiters(state)
}

async function nextQueuedEvent(
  state: DshAiRunState
): Promise<AiRunEvent | undefined> {
  const event = state.queue.shift()
  if (event !== undefined) return event
  if (state.closed) return undefined
  await new Promise<void>((resolve) => {
    state.waiters.push(resolve)
  })
  return state.queue.shift()
}

function wakeWaiters(state: DshAiRunState): void {
  const waiters = state.waiters.splice(0)
  for (const waiter of waiters) waiter()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
