import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  createRunCheckpoint,
  type CheckpointReason,
  type RunCheckpoint,
} from '../../../../domain/agent-run-recovery'
import {
  canonicalToolCallFingerprint,
  recordConsecutiveToolFailure,
  recordSuccessfulToolExecution,
  recordToolRequest,
  type AgentProgressStopReason,
} from '../../../../domain/agent-progress-detector'
import {
  createAgentRunSnapshot,
  resolveAgentRunScope,
  resolveAgentRunScenario,
  type AgentRunLifecycleStatus,
  type AgentRunSnapshot,
  type AgentRuntimeRun,
} from '../../../../domain/agent-runtime'
import { projectProviderToolSchema } from './provider-tool-schema'
import type {
  CapabilityDescriptor,
  EffectiveAgentProfile,
} from '../../../../domain/agent-profile'
import type {
  CapabilityDefinition,
  CapabilityInstallation,
  CapabilityScope,
} from '../../../../domain/capability'
import type { ConversationProcessingGate } from '../../../../domain/conversation-processor'
import type {
  AiRunEvent,
  AiRunToolCall,
  AiRunToolResult,
} from '../../../../domain/ai-run'
import type { ModelExecutionConfig } from '../../../../domain/model'
import {
  DELEGATION_REQUEST_JSON_SCHEMA,
  MAX_DELEGATION_CONCURRENCY,
  MAX_DELEGATION_DEPTH,
  SUBAGENT_DELEGATION_TOOL_NAME,
  type DelegationRequest,
  type DelegationResult,
  type SubagentTaskResult,
  type ValidatedDelegationTask,
} from '../../../../domain/subagent'
import {
  resolveProviderReasoning,
  routeConversationReasoning,
  type ReasoningDecision,
} from '../../../../domain/reasoning-router'
import {
  isToolVersionInRange,
  type SkillDefinition,
} from '../../../../domain/skill-definition'
import type {
  ToolDefinition,
  ToolDefinitionReference,
} from '../../../../domain/tool-definition'
import type { ToolCatalogService } from '../../application/tools/tool-catalog-service'
import { ModelFacingSurfaceResolver, withDirectoryControls } from '../../application/tools/model-facing-surface-resolver'
import { ToolPolicyEngine } from '../../application/tools/tool-policy-engine'
import { projectModelFacingToolCatalog } from '../../application/tools/tool-model-facing-projection'
import type { ToolPolicyInput, ToolPolicySnapshot } from '../../../../domain/tool-policy'
import type { RunModelFacingSnapshot } from '../../../../domain/tool-catalog'
import type {
  ToolExecutionApplicationService,
  ToolExecutionCommand,
} from '../../application/tools/tool-execution-application-service'
import type {
  SkillRuntimeApplicationService,
  SkillRuntimeResult,
} from '../../application/tools/skill-runtime-application-service'
import { projectConnectorTools } from '../../application/connectors/connector-tool-projector'
import type {
  AiRunGateway,
  AgentProfileResolver,
  AgentRunCheckpointRepository,
  AgentRuntimeRunRepository,
  RunContext,
  RunToolConfiguration,
} from './ports'
import { BuiltinAgentProfileResolver } from './agent-profile-resolver'
import {
  formatAgentDegradedConclusion,
  formatAgentProviderFailureArtifactConclusion,
} from './agent-degraded-conclusion'
import { SubagentRuntime } from './subagent-runtime'
import { collectDelegatedRunResult } from './delegated-run-result'
import type { RuntimeBudgetStore } from '../../application/agent-runtime/runtime-budget'
import type { RuntimeDelegationService } from '../../application/agent-runtime/runtime-delegation-service'
import type { RuntimeDelegation } from '../../application/agent-runtime/runtime-delegation'
import { compactAgentContext } from '../../application/context/agent-context-compactor'
import {
  ProviderRoundTextBuffer,
  responseLanguagePolicy,
  resolveResponseLanguage,
  type ResponseLanguageSnapshot
} from '../../../../domain/response-language'

type ToolLoopGateway = AiRunGateway & {
  acknowledgeTurn?(runId: string, input: {
    turn: number; messages: Array<{ role: 'user'; content: string }>
  }): Promise<void>
  resumeRun?(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint,
    model?: ModelExecutionConfig,
  ): Promise<{ runId: string }>
  submitToolResult(runId: string, result: AiRunToolResult): Promise<void>
  releaseRun?(runId: string): void
}

type RunBinding = {
  turnReceipts?: Map<string, Array<{ role: 'user'; content: string }>>
  context: RunContext
  model?: ModelExecutionConfig
  providerRunId?: string
  runtimeRunId?: string
  snapshot?: AgentRunSnapshot
  runtimeOnly?: boolean
  delegationAllowed?: boolean
  abortController?: AbortController
  checkpointOrdinal: number
  projectionCursor: number
  ledger: RunCheckpoint['ledger']
  remainingBudgets: RunCheckpoint['remainingBudgets']
  pendingCalls: Map<string, RunCheckpoint['pendingCalls'][number]>
  messageWindow: RunCheckpoint['messageWindow']
  toolConfiguration?: RunToolConfiguration
  compaction?: RunCheckpoint['compaction']
  progressStopReason?: AgentProgressStopReason
  capabilityScopes: CapabilityScope[]
  skillsByName: Map<string, SkillDefinition>
  toolsByName: Map<string, ToolDefinition>
  responseLanguage: ResponseLanguageSnapshot
}

type Dependencies = {
  gateway: ToolLoopGateway
  catalog: Pick<ToolCatalogService, 'list'>
  capabilities?: {
    resolve(scopeChain: readonly CapabilityScope[]): Promise<
      Array<{
        definition: CapabilityDefinition
        installation: CapabilityInstallation
      }>
    >
  }
  capabilityScopes?: {
    resolve(context: RunContext): Promise<CapabilityScope[]>
  }
  tools: Pick<ToolExecutionApplicationService, 'execute'> &
    Partial<Pick<ToolExecutionApplicationService, 'cancelByParent'>>
  skills?: {
    readInstructions(definition: SkillDefinition): Promise<string>
  }
  skillRuntime?: Pick<
    SkillRuntimeApplicationService,
    'execute' | 'cancelByParent'
  >
  subagents?: Pick<SubagentRuntime, 'execute' | 'cancel'> &
    Partial<Pick<SubagentRuntime, 'release'>>
  profiles?: AgentProfileResolver
  resolveSandbox?: () => Promise<NonNullable<ToolPolicyInput['sandbox']>>
  runtimeRuns?: AgentRuntimeRunRepository
  checkpoints?: AgentRunCheckpointRepository
  projectionCursor?: { get(runId: string): Promise<number> }
  budgets?: RuntimeBudgetStore
  delegations?: RuntimeDelegationService
  turnBoundary?: {
    pending(runId: string): Array<{ id: string; message: string }>
    commit(checkpoint: RunCheckpoint, instructionIds: string[]): Promise<void>
  }
  onTerminal?: (
    runId: string,
    eventType: 'run.completed' | 'run.failed' | 'run.cancelled'
  ) => Promise<void>
  createRuntimeRunId?: () => string
  now?: () => number
  maxToolCalls?: number
  contextCompactionCharacters?: number
}

const TERMINAL_EVENTS = new Set<AiRunEvent['type']>([
  'run.completed',
  'run.failed',
  'run.cancelled',
])

export class AgentToolLoopCoordinator implements AiRunGateway {
  private readonly runs = new Map<string, RunBinding>()
  private readonly providerRunIds = new Map<string, string>()
  private readonly maxToolCalls: number
  private readonly profiles: AgentProfileResolver
  private readonly contextCompactionCharacters: number
  private readonly subagents: Pick<SubagentRuntime, 'execute' | 'cancel'> &
    Partial<Pick<SubagentRuntime, 'release'>>

  constructor(private readonly dependencies: Dependencies) {
    this.maxToolCalls = dependencies.maxToolCalls ?? 8
    this.contextCompactionCharacters =
      dependencies.contextCompactionCharacters ?? 48_000
    this.profiles = dependencies.profiles ?? new BuiltinAgentProfileResolver()
    this.subagents = dependencies.subagents ?? new SubagentRuntime()
  }

  async prepare(context: RunContext): Promise<void> {
    await this.prepareRun(context)
  }

  getToolPolicy(runId: string): ToolPolicySnapshot | undefined {
    return this.getBinding(runId)?.snapshot?.toolPolicy
  }

  async createRun(
    context: RunContext,
    model?: ModelExecutionConfig,
  ): Promise<{ runId: string }> {
    return this.createPolicyBoundRun(context, model)
  }

  private async createPolicyBoundRun(
    context: RunContext,
    model?: ModelExecutionConfig,
    inheritedGrants?: ToolDefinitionReference[],
    identity?: { runtimeRunId: string; signal: AbortSignal },
  ): Promise<{ runId: string }> {
    if (identity?.signal.aborted) throw new Error('request_cancelled')
    const selection = await this.prepareRun(context, model?.providerId ?? model?.catalogProviderId, inheritedGrants)
    if (identity?.signal.aborted) throw new Error('request_cancelled')
    const { definitions, skills } = selection
    const reasoningDecision = resolveConversationReasoning(
      selection.context,
      model,
    )
    const selectedContext = reasoningDecision
      ? {
          ...selection.context,
          reasoning: reasoningDecision.effectiveMode,
          maxOutputTokens: reasoningDecision.budgets.maxOutputTokens,
        }
      : selection.context
    const toolsByName = new Map(
      definitions.map((definition) => [modelToolName(definition), definition]),
    )
    const skillsByName = new Map(
      skills.map((definition) => [modelSkillName(definition), definition]),
    )
    const configuration: RunToolConfiguration = {
      ...(this.dependencies.turnBoundary && this.dependencies.gateway.acknowledgeTurn &&
        this.dependencies.checkpoints && this.dependencies.runtimeRuns ? { turnGate: true } : {}),
      maxAgentTurns:
        selection.scenario.executionPolicy.maxTurnsPerSegment,
      maxParallelToolsPerTurn:
        selection.scenario.executionPolicy.maxParallelToolsPerTurn,
      tools: [
        ...definitions.map((definition) => modelToolDefinition(definition)),
        ...skills.map((definition) => modelSkillDefinition(definition)),
        ...(selection.delegationAllowed
          ? [modelDelegationDefinition()]
          : []),
      ],
    }
    const runtimeRunId =
      identity?.runtimeRunId ?? this.dependencies.createRuntimeRunId?.() ?? randomUUID()
    const now = this.dependencies.now?.() ?? Date.now()
    const runtimeSnapshot = createAgentRunSnapshot(selection.context, {
      runId: runtimeRunId,
      agentProfileId: selection.profile.profileId,
      agentProfileVersion: selection.profile.profileVersion,
      agentProfileDigest: selection.profile.profileDigest,
      promptDigest: selection.profile.promptDigest,
      policyDigest: selection.profile.policyDigest,
      toolPolicy: selection.toolPolicy,
      modelFacing: selection.modelFacing,
      capabilityCatalogDigest: selection.catalogDigest,
      capabilityBindingDigest: capabilityBindingDigest(definitions, skills),
      permissionSnapshotDigest: permissionSnapshotDigest(selection.context),
      ...(model?.modelProfileId
        ? { modelProfileId: model.modelProfileId }
        : {}),
      ...(reasoningDecision ? { reasoningDecision } : {}),
      maxToolCalls: selection.maxToolCalls,
      maxSubagents: selection.maxSubagents,
      ...(context.runtimeDelegation ? { delegationMode: 'research' as const } : {}),
      ...(context.runtimeDelegation || context.runtimeBranch
        ? {
            lineage: {
              rootRunId: (
                context.runtimeBranch ?? context.runtimeDelegation!
              ).rootRunId,
              parentRunId: (
                context.runtimeBranch ?? context.runtimeDelegation!
              ).parentRunId,
              delegationDepth:
                context.runtimeBranch?.depth ??
                context.runtimeDelegation!.delegationDepth,
              delegationOrdinal:
                context.runtimeBranch?.ordinal ??
                context.runtimeDelegation!.delegationOrdinal,
            },
          }
        : {}),
      ...(context.runtimeBranch
        ? { sourceCheckpoint: context.runtimeBranch.sourceCheckpoint }
        : {}),
      ...(reasoningDecision
        ? {
            timeoutMs: Math.min(
              selection.profile.budgets.timeoutMs,
              reasoningDecision.budgets.timeoutMs,
            ),
          }
        : {}),
      ...('pipelineVersion' in selection.context &&
      selection.context.pipelineVersion
        ? { pipelineVersion: selection.context.pipelineVersion }
        : {}),
      createdAt: now,
    })
    if (this.dependencies.runtimeRuns) {
      await this.dependencies.runtimeRuns.create({
        id: runtimeRunId,
        providerRunId: undefined,
        status: 'preparing',
        snapshot: runtimeSnapshot,
        createdAt: now,
        updatedAt: now,
      })
    }
    let run: { runId: string }
    try {
      if (identity?.signal.aborted) throw new Error('request_cancelled')
      run = await this.dependencies.gateway.createRun(
        selectedContext,
        model,
        configuration,
      )
      if (identity?.signal.aborted) {
        await this.dependencies.gateway.cancelRun(run.runId)
        throw new Error('request_cancelled')
      }
    } catch (error) {
      await this.transitionRuntimeRun(
        runtimeRunId,
        identity?.signal.aborted ? 'cancelled' : 'failed',
        safeErrorMessage(error),
      )
      throw error
    }
    try {
      await this.dependencies.runtimeRuns?.bindProviderRun(
        runtimeRunId,
        run.runId,
        this.dependencies.now?.() ?? Date.now(),
      )
    } catch (error) {
      await this.dependencies.gateway
        .cancelRun(run.runId)
        .catch(() => undefined)
      await this.transitionRuntimeRun(
        runtimeRunId,
        'failed',
        safeErrorMessage(error),
      )
      throw error
    }
    const publicRunId = this.dependencies.runtimeRuns
      ? runtimeRunId
      : run.runId
    const binding: RunBinding = {
      context,
      capabilityScopes: selection.capabilityScopes,
      ...(model ? { model } : {}),
      providerRunId: run.runId,
      runtimeRunId: this.dependencies.runtimeRuns ? runtimeRunId : undefined,
      snapshot: runtimeSnapshot,
      delegationAllowed: selection.delegationAllowed,
      abortController: new AbortController(),
      checkpointOrdinal: 0,
      projectionCursor: 0,
      ledger: structuredClone(runtimeSnapshot.budgetLedger),
      remainingBudgets: {
        toolCalls: runtimeSnapshot.budgets.maxToolCalls,
        subagents: runtimeSnapshot.budgets.maxSubagents,
        retries: runtimeSnapshot.budgets.maxRetries,
        timeoutMs: runtimeSnapshot.budgets.timeoutMs,
        tokens:
          runtimeSnapshot.reasoningDecision?.budgets.maxOutputTokens ?? 0,
      },
      pendingCalls: new Map(),
      messageWindow: checkpointMessages(context),
      toolConfiguration: configuration,
      skillsByName,
      toolsByName,
      responseLanguage: selection.context.responseLanguage!,
    }
    this.runs.set(publicRunId, binding)
    this.providerRunIds.set(run.runId, publicRunId)
    try {
      await this.writeCheckpoint(publicRunId, 'run_started')
    } catch (error) {
      this.deleteBinding(publicRunId)
      await this.dependencies.gateway
        .cancelRun(run.runId)
        .catch(() => undefined)
      await this.transitionRuntimeRun(
        runtimeRunId,
        'failed',
        safeErrorMessage(error),
      )
      throw error
    }
    return { runId: publicRunId }
  }

  async createWaitingInputRun(
    context: RunContext,
    _gate: Extract<
      ConversationProcessingGate,
      { status: 'clarification_required' }
    >,
  ): Promise<{ runId: string }> {
    if (!this.dependencies.runtimeRuns) {
      throw new Error('Agent Runtime Run repository is unavailable')
    }
    const selection = await this.prepareRun(context)
    const runtimeRunId =
      this.dependencies.createRuntimeRunId?.() ?? randomUUID()
    const now = this.dependencies.now?.() ?? Date.now()
    const snapshot = createAgentRunSnapshot(selection.context, {
      runId: runtimeRunId,
      agentProfileId: selection.profile.profileId,
      agentProfileVersion: selection.profile.profileVersion,
      agentProfileDigest: selection.profile.profileDigest,
      promptDigest: selection.profile.promptDigest,
      policyDigest: selection.profile.policyDigest,
      toolPolicy: selection.toolPolicy,
      modelFacing: selection.modelFacing,
      capabilityCatalogDigest: selection.catalogDigest,
      capabilityBindingDigest: capabilityBindingDigest(
        selection.definitions,
        selection.skills,
      ),
      permissionSnapshotDigest: permissionSnapshotDigest(selection.context),
      maxToolCalls: selection.maxToolCalls,
      ...('pipelineVersion' in selection.context &&
      selection.context.pipelineVersion
        ? { pipelineVersion: selection.context.pipelineVersion }
        : {}),
      createdAt: now,
    })
    await this.dependencies.runtimeRuns.create({
      id: runtimeRunId,
      status: 'waiting_input',
      snapshot,
      createdAt: now,
      updatedAt: now,
    })
    this.runs.set(runtimeRunId, {
      context,
      runtimeRunId,
      runtimeOnly: true,
      checkpointOrdinal: 0,
      projectionCursor: 0,
      ledger: structuredClone(snapshot.budgetLedger),
      remainingBudgets: {
        toolCalls: snapshot.budgets.maxToolCalls,
        subagents: snapshot.budgets.maxSubagents,
        retries: snapshot.budgets.maxRetries,
        timeoutMs: snapshot.budgets.timeoutMs,
        tokens: 0,
      },
      pendingCalls: new Map(),
      messageWindow: checkpointMessages(context),
      capabilityScopes: capabilityScopeChain(context),
      skillsByName: new Map(),
      toolsByName: new Map(),
      responseLanguage: selection.context.responseLanguage!,
    })
    await this.writeCheckpoint(runtimeRunId, 'input_wait')
    return { runId: runtimeRunId }
  }

  async resolveWaitingInputRun(runId: string): Promise<void> {
    if (!this.dependencies.runtimeRuns) {
      throw new Error('Agent Runtime Run repository is unavailable')
    }
    await this.dependencies.runtimeRuns.transition(
      runId,
      'completed',
      this.dependencies.now?.() ?? Date.now(),
    )
    this.deleteBinding(runId)
  }

  async attachRecoveredRun(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint,
    model?: ModelExecutionConfig,
  ): Promise<{ runId: string }> {
    if (!this.dependencies.gateway.resumeRun) {
      throw new Error('Agent Run recovery gateway is unavailable')
    }
    if (!this.dependencies.runtimeRuns?.bindProviderAttempt) {
      throw new Error('Agent Run attempt repository is unavailable')
    }
    const context = recoveryContext(run, checkpoint)
    const selection = await this.prepareRun(
      context, model?.providerId ?? model?.catalogProviderId ?? run.snapshot.toolPolicy?.providerId,
      run.snapshot.toolPolicy?.inheritedGrants,
    )
    if (selection.toolPolicy.digest !== run.snapshot.toolPolicy?.digest) {
      throw new Error('tool_policy_changed')
    }
    if (!recoverySurfaceMatches(selection, run.snapshot)) {
      throw new Error('model_facing_surface_changed')
    }
    const resumed = await this.dependencies.gateway.resumeRun(
      run,
      checkpoint,
      model,
    )
    try {
      await this.dependencies.runtimeRuns.bindProviderAttempt(
        run.id,
        resumed.runId,
        checkpoint.resumeToken,
        this.dependencies.now?.() ?? Date.now(),
      )
    } catch (error) {
      await this.dependencies.gateway
        .cancelRun(resumed.runId)
        .catch(() => undefined)
      throw error
    }
    const binding: RunBinding = {
      context,
      capabilityScopes: selection.capabilityScopes,
      ...(model ? { model } : {}),
      providerRunId: resumed.runId,
      runtimeRunId: run.id,
      snapshot: run.snapshot,
      delegationAllowed: selection.delegationAllowed,
      abortController: new AbortController(),
      checkpointOrdinal: checkpoint.ordinal,
      projectionCursor: checkpoint.projectionCursor,
      ledger: structuredClone(checkpoint.ledger),
      remainingBudgets: { ...checkpoint.remainingBudgets },
      pendingCalls: new Map(
        checkpoint.pendingCalls.map((call) => [call.callId, { ...call }]),
      ),
      messageWindow: checkpoint.messageWindow.map((message) => ({
        ...message,
        ...(message.toolCalls
          ? { toolCalls: message.toolCalls.map((call) => ({ ...call })) }
          : {}),
      })),
      ...(checkpoint.toolConfiguration
        ? { toolConfiguration: checkpoint.toolConfiguration }
        : {}),
      ...(checkpoint.compaction ? { compaction: checkpoint.compaction } : {}),
      skillsByName: new Map(
        selection.skills.map((definition) => [
          modelSkillName(definition),
          definition,
        ]),
      ),
      toolsByName: new Map(
        selection.definitions.map((definition) => [
          modelToolName(definition),
          definition,
        ]),
      ),
      responseLanguage:
        run.snapshot.responseLanguage ??
        selection.context.responseLanguage!,
    }
    this.runs.set(run.id, binding)
    this.providerRunIds.set(resumed.runId, run.id)
    return { runId: run.id }
  }

  async branchRecoveredRun(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint,
    model?: ModelExecutionConfig,
  ): Promise<{ runId: string }> {
    if (!this.dependencies.runtimeRuns) {
      throw new Error('Agent Runtime Run repository is unavailable')
    }
    const siblings = await this.dependencies.runtimeRuns.listByParentRunId(
      run.id,
    )
    return this.createPolicyBoundRun(
      recoveryBranchContext(run, checkpoint, siblings.length + 1),
      model,
      run.snapshot.toolPolicy?.grants ?? [],
    )
  }

  async inspectRecoveryConfiguration(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint,
  ): Promise<{
    profileAvailable: boolean
    capabilitiesAvailable: boolean
    permissionValid: boolean
  }> {
    try {
      const context = recoveryContext(run, checkpoint)
      const selection = await this.prepareRun(
        context, run.snapshot.toolPolicy?.providerId, run.snapshot.toolPolicy?.inheritedGrants,
      )
      return {
        profileAvailable:
          selection.profile.profileId === run.snapshot.agentProfileId &&
          selection.profile.profileVersion ===
            run.snapshot.agentProfileVersion &&
          selection.profile.profileDigest ===
            run.snapshot.agentProfileDigest &&
          selection.profile.promptDigest === run.snapshot.promptDigest &&
          selection.profile.policyDigest === run.snapshot.policyDigest &&
          selection.toolPolicy.digest === run.snapshot.toolPolicy?.digest,
        capabilitiesAvailable: recoverySurfaceMatches(selection, run.snapshot),
        permissionValid:
          permissionSnapshotDigest(context) ===
          run.snapshot.permissionSnapshotDigest,
      }
    } catch {
      return {
        profileAvailable: false,
        capabilitiesAvailable: false,
        permissionValid: false,
      }
    }
  }

  async *streamEvents(
    runId: string,
    signal: AbortSignal,
  ): AsyncIterable<AiRunEvent> {
    const publicRunId = this.resolvePublicRunId(runId)
    const binding = publicRunId
      ? this.runs.get(publicRunId)
      : undefined
    let providerRunId = binding?.providerRunId ?? runId
    const abortController = binding?.abortController
    const abort = (): void => abortController?.abort()
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (binding && publicRunId && this.dependencies.projectionCursor) {
        binding.projectionCursor = Math.max(binding.projectionCursor,
          await this.dependencies.projectionCursor.get(publicRunId))
      }
      let continueStreaming = true
      while (continueStreaming) {
        continueStreaming = false
        let roundText = binding
          ? new ProviderRoundTextBuffer(binding.responseLanguage)
          : undefined
        let firstRoundTextEvent: AiRunEvent | undefined
        for await (const providerEvent of this.dependencies.gateway.streamEvents(
          providerRunId,
          signal,
        )) {
          if (providerEvent.type === 'run.turn_ready') {
            try {
              if (!binding || !publicRunId) throw new Error('runtime_turn_unavailable')
              await this.acknowledgeProviderTurn(binding, providerRunId, providerEvent.data.agentTurn, signal)
            } catch (error) {
              await this.dependencies.gateway.cancelRun(providerRunId).catch(() => undefined)
              throw error
            }
            continue
          }
          if (roundText && providerEvent.type === 'answer.delta') {
            firstRoundTextEvent ??= providerEvent
            roundText.append(providerEvent.data.delta ?? '')
            continue
          }
          if (
            roundText &&
            firstRoundTextEvent &&
            (providerEvent.type === 'tool.call.requested' ||
              TERMINAL_EVENTS.has(providerEvent.type))
          ) {
            if (providerEvent.type === 'tool.call.requested') {
              roundText.markToolCall()
            }
            const output = roundText.flush()
            if (
              output?.kind === 'answer' &&
              output.language === 'mismatch' &&
              TERMINAL_EVENTS.has(providerEvent.type) &&
              publicRunId &&
              binding
            ) {
              await this.transitionRuntimeRun(publicRunId, 'waiting_input')
              const waitingEvent = nextRuntimeEvent(
                binding,
                publicRunId,
                'run.waiting_input',
                { recoveryReason: 'response_language_mismatch' },
                this.dependencies.now?.() ?? Date.now()
              )
              yield waitingEvent
              await this.writeCheckpoint(publicRunId, 'input_wait')
              return
            }
            if (output?.text) {
              const bufferedProviderEvent: AiRunEvent = {
                ...firstRoundTextEvent,
                type:
                  output.kind === 'summary'
                    ? 'execution.summary.delta'
                    : 'answer.delta',
                data: {
                  ...firstRoundTextEvent.data,
                  delta: output.text,
                  ...(output.kind === 'summary'
                    ? {
                        summaryId: `provider-round-${firstRoundTextEvent.sequence}`,
                        source: 'provider' as const
                      }
                    : {})
                }
              }
              const bufferedEvent = publicRunId
                ? stableRunEvent(
                    bufferedProviderEvent,
                    publicRunId,
                    (binding!.projectionCursor ?? 0) + 1
                  )
                : bufferedProviderEvent
              if (binding) {
                binding.projectionCursor = bufferedEvent.sequence
                updateCheckpointState(binding, bufferedEvent)
              }
              await this.projectRuntimeLifecycle(
                publicRunId ?? runId,
                bufferedEvent
              )
              yield bufferedEvent
            }
            roundText = new ProviderRoundTextBuffer(
              binding!.responseLanguage
            )
            firstRoundTextEvent = undefined
          }
          if (
            publicRunId &&
            binding?.snapshot &&
            isAgentTurnSegmentLimit(providerEvent)
          ) {
            binding.ledger.agentTurns =
              providerEvent.data.agentTurn ??
              binding.snapshot.executionPolicy.maxTurnsPerSegment
            if (binding.ledger.remainingContinuationAttempts === 0) {
              const waitingEvent = nextRuntimeEvent(
                binding,
                publicRunId,
                'run.waiting_input',
                { recoveryReason: 'continuation_limit_reached' },
                this.dependencies.now?.() ?? Date.now(),
              )
              await this.transitionRuntimeRun(publicRunId, 'waiting_input')
              await this.writeCheckpoint(publicRunId, 'input_wait')
              yield waitingEvent
              return
            }

            binding.ledger.segmentIndex += 1
            binding.ledger.agentTurns = 0
            binding.ledger.remainingContinuationAttempts -= 1
            const compaction = this.compactWorkingWindow(binding, true)
            if (compaction) {
              yield nextRuntimeEvent(
                binding,
                publicRunId,
                'context.compacted',
                compactionEventData(compaction),
                this.dependencies.now?.() ?? Date.now(),
              )
            }
            const checkpoint = await this.writeCheckpoint(
              publicRunId,
              compaction ? 'compacted' : 'model_round_completed',
            )
            if (
              !checkpoint ||
              !this.dependencies.gateway.resumeRun ||
              !this.dependencies.runtimeRuns?.bindProviderAttempt
            ) {
              const blockedEvent = nextRuntimeEvent(
                binding,
                publicRunId,
                'run.recovery_blocked',
                {
                  recoveryReason: 'resume_unavailable',
                  recoveryActions: ['resume', 'branch', 'cancel'],
                },
                this.dependencies.now?.() ?? Date.now(),
              )
              await this.transitionRuntimeRun(
                publicRunId,
                'recovery_blocked',
                'recovery_blocked:resume_unavailable',
              )
              yield blockedEvent
              return
            }

            await this.transitionRuntimeRun(publicRunId, 'retrying')
            yield nextRuntimeEvent(
              binding,
              publicRunId,
              'run.retrying',
              {
                retryCount: binding.ledger.segmentIndex,
                errorCode: 'max_agent_turns',
              },
              this.dependencies.now?.() ?? Date.now(),
            )
            const resumed = await this.dependencies.gateway.resumeRun(
              {
                id: publicRunId,
                providerRunId,
                status: 'retrying',
                snapshot: binding.snapshot,
                createdAt: binding.snapshot.createdAt,
                updatedAt: this.dependencies.now?.() ?? Date.now(),
              },
              checkpoint,
              binding.model,
            )
            await this.dependencies.runtimeRuns.bindProviderAttempt(
              publicRunId,
              resumed.runId,
              checkpoint.resumeToken,
              this.dependencies.now?.() ?? Date.now(),
            )
            this.dependencies.gateway.releaseRun?.(providerRunId)
            this.providerRunIds.delete(providerRunId)
            providerRunId = resumed.runId
            binding.providerRunId = providerRunId
            this.providerRunIds.set(providerRunId, publicRunId)
            await this.transitionRuntimeRun(publicRunId, 'running')
            yield nextRuntimeEvent(
              binding,
              publicRunId,
              'run.resumed',
              {},
              this.dependencies.now?.() ?? Date.now(),
            )
            continueStreaming = true
            break
          }
          if (
            publicRunId &&
            binding?.snapshot &&
            isRetryableProviderFailure(providerEvent)
          ) {
            if (binding.remainingBudgets.retries <= 0) {
              // Let the terminal failure flow through when retry budget is gone.
            } else {
              const checkpoint = await this.writeCheckpoint(
                publicRunId,
                'model_round_completed',
              )
              if (
                !checkpoint ||
                !this.dependencies.gateway.resumeRun ||
                !this.dependencies.runtimeRuns?.bindProviderAttempt
              ) {
                const blockedEvent = nextRuntimeEvent(
                  binding,
                  publicRunId,
                  'run.recovery_blocked',
                  {
                    recoveryReason: 'resume_unavailable',
                    recoveryActions: ['resume', 'branch', 'cancel'],
                  },
                  this.dependencies.now?.() ?? Date.now(),
                )
                await this.transitionRuntimeRun(
                  publicRunId,
                  'recovery_blocked',
                  'recovery_blocked:resume_unavailable',
                )
                yield blockedEvent
                return
              }

              binding.remainingBudgets.retries -= 1
              await this.transitionRuntimeRun(publicRunId, 'retrying')
              yield nextRuntimeEvent(
                binding,
                publicRunId,
                'run.retrying',
                {
                  retryCount:
                    binding.snapshot.budgets.maxRetries -
                    binding.remainingBudgets.retries,
                  errorCode: providerEvent.data.errorCode,
                },
                this.dependencies.now?.() ?? Date.now(),
              )
              const resumed = await this.dependencies.gateway.resumeRun(
                {
                  id: publicRunId,
                  providerRunId,
                  status: 'retrying',
                  snapshot: binding.snapshot,
                  createdAt: binding.snapshot.createdAt,
                  updatedAt: this.dependencies.now?.() ?? Date.now(),
                },
                checkpoint,
                binding.model,
              )
              await this.dependencies.runtimeRuns.bindProviderAttempt(
                publicRunId,
                resumed.runId,
                checkpoint.resumeToken,
                this.dependencies.now?.() ?? Date.now(),
              )
              this.dependencies.gateway.releaseRun?.(providerRunId)
              this.providerRunIds.delete(providerRunId)
              providerRunId = resumed.runId
              binding.providerRunId = providerRunId
              this.providerRunIds.set(providerRunId, publicRunId)
              await this.transitionRuntimeRun(publicRunId, 'running')
              yield nextRuntimeEvent(
                binding,
                publicRunId,
                'run.resumed',
                {},
                this.dependencies.now?.() ?? Date.now(),
              )
              continueStreaming = true
              break
            }
          }
          if (
            publicRunId &&
            binding &&
            providerEvent.type === 'run.failed'
          ) {
            const degradedConclusion =
              formatAgentProviderFailureArtifactConclusion({
                messageWindow: binding.messageWindow,
                locale: binding.responseLanguage.locale,
              })
            if (degradedConclusion) {
              const answerEvent = nextRuntimeEvent(
                binding,
                publicRunId,
                'answer.delta',
                { delta: degradedConclusion },
                this.dependencies.now?.() ?? Date.now(),
              )
              updateCheckpointState(binding, answerEvent)
              await this.projectRuntimeLifecycle(publicRunId, answerEvent)
              yield answerEvent

              const completedEvent = nextRuntimeEvent(
                binding,
                publicRunId,
                'run.completed',
                {},
                this.dependencies.now?.() ?? Date.now(),
              )
              await this.writeCheckpoint(publicRunId, 'terminal')
              await this.cleanupTerminal(
                publicRunId,
                completedEvent.type
              )
              await this.projectRuntimeLifecycle(publicRunId, completedEvent)
              this.dependencies.delegations?.cancelChildren(publicRunId)
              if (
                binding.snapshot &&
                binding.snapshot.runId === binding.snapshot.rootRunId
              ) {
                this.subagents.release?.(binding.snapshot.rootRunId)
              }
              this.deleteBinding(publicRunId)
              yield completedEvent
              return
            }
          }

          const event = publicRunId
            ? stableRunEvent(
                providerEvent,
                publicRunId,
                (binding?.projectionCursor ?? 0) + 1,
              )
            : providerEvent
          if (binding) {
            binding.projectionCursor = event.sequence
            updateCheckpointState(binding, event)
          }
          if (TERMINAL_EVENTS.has(event.type)) {
            await this.writeCheckpoint(publicRunId ?? runId, 'terminal')
            await this.cleanupTerminal(
              publicRunId ?? runId,
              event.type
            )
          }
          await this.projectRuntimeLifecycle(publicRunId ?? runId, event)
          if (TERMINAL_EVENTS.has(event.type) && publicRunId) {
            this.dependencies.delegations?.cancelChildren(publicRunId)
            if (binding?.snapshot?.runId === binding?.snapshot?.rootRunId && binding?.snapshot) {
              this.subagents.release?.(binding.snapshot.rootRunId)
            }
            this.deleteBinding(publicRunId)
          }
          yield event
          if (TERMINAL_EVENTS.has(event.type)) return
          if (binding?.progressStopReason && publicRunId) {
            await this.dependencies.gateway.cancelRun(providerRunId)
            await this.transitionRuntimeRun(publicRunId, 'waiting_input')
            yield nextRuntimeEvent(
              binding,
              publicRunId,
              'answer.delta',
              {
                delta: formatAgentDegradedConclusion({
                  messageWindow: binding.messageWindow,
                  reason: binding.progressStopReason,
                  locale: binding.responseLanguage.locale,
                }),
              },
              this.dependencies.now?.() ?? Date.now(),
            )
            yield nextRuntimeEvent(
              binding,
              publicRunId,
              'run.waiting_input',
              { recoveryReason: binding.progressStopReason },
              this.dependencies.now?.() ?? Date.now(),
            )
            await this.writeCheckpoint(publicRunId, 'input_wait')
            return
          }
          if (event.type === 'tool.call.requested') {
            await this.executeToolCall(
              publicRunId ?? runId,
              event.data.toolCall,
            )
          }
          const checkpointReason = checkpointReasonForEvent(event)
          if (checkpointReason) {
            const compaction = binding
              ? this.compactWorkingWindow(binding)
              : undefined
            if (compaction && publicRunId && binding) {
              yield nextRuntimeEvent(
                binding,
                publicRunId,
                'context.compacted',
                compactionEventData(compaction),
                this.dependencies.now?.() ?? Date.now(),
              )
              await this.writeCheckpoint(publicRunId, 'compacted')
            } else {
              await this.writeCheckpoint(
                publicRunId ?? runId,
                checkpointReason,
              )
            }
          }
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        await this.cleanupTerminal(
          publicRunId ?? runId,
          'run.failed'
        )
      }
      if (publicRunId) this.deleteBinding(publicRunId)
      throw error
    } finally {
      signal.removeEventListener('abort', abort)
      this.dependencies.gateway.releaseRun?.(providerRunId)
    }
  }

  async cancelRun(runId: string): Promise<void> {
    const publicRunId = this.resolvePublicRunId(runId) ?? runId
    const binding = this.runs.get(publicRunId)
    this.deleteBinding(publicRunId)
    binding?.abortController?.abort()
    if (binding?.snapshot) {
      if (this.dependencies.delegations) this.dependencies.delegations.cancel(publicRunId)
      else this.subagents.cancel(binding.snapshot.rootRunId)
    }
    await this.dependencies.tools.cancelByParent?.(publicRunId)
    await this.dependencies.skillRuntime?.cancelByParent(publicRunId)
    if (!binding?.runtimeOnly) {
      await this.dependencies.gateway.cancelRun(
        binding?.providerRunId ?? runId,
      )
    }
    if (binding?.runtimeRunId) {
      await this.transitionRuntimeRun(binding.runtimeRunId, 'cancelled')
    }
    if (
      binding?.snapshot &&
      binding.snapshot.runId === binding.snapshot.rootRunId
    ) {
      this.subagents.release?.(binding.snapshot.rootRunId)
    }
    await this.cleanupTerminal(publicRunId, 'run.cancelled')
  }

  private async prepareRun(context: RunContext, providerId?: string, inheritedGrants?: ToolDefinitionReference[]): Promise<{
    context: RunContext
    definitions: ToolDefinition[]
    skills: SkillDefinition[]
    maxToolCalls: number
    maxSubagents: number
    delegationAllowed: boolean
    scenario: ReturnType<typeof resolveAgentRunScenario>
    capabilityScopes: CapabilityScope[]
    catalogDigest: string
    profile: EffectiveAgentProfile
    toolPolicy: ToolPolicySnapshot
    modelFacing: RunModelFacingSnapshot
  }> {
    const [sourceCatalog, capabilityScopes] = await Promise.all([
      this.dependencies.catalog.list({
        modelFacingMode: 'facade',
        runtimeWorkspaceId:
          'workspaceId' in context ? context.workspaceId : null,
      }),
      this.dependencies.capabilityScopes?.resolve(context) ??
        Promise.resolve(capabilityScopeChain(context)),
    ])
    const catalog = withDirectoryControls(sourceCatalog)
    const installedCapabilities =
      (await this.dependencies.capabilities?.resolve(
        capabilityScopes,
      )) ?? []
    const connectorTools = installedCapabilities.flatMap((installed) =>
      projectConnectorTools(installed),
    )
    const contexts = discoveryContexts(context)
    const scheduled =
      'scheduleRunId' in context && Boolean(context.scheduleRunId)
    const discoverAll =
      !scheduled && ('conversationId' in context || 'nodeId' in context)
    const enabledTools = catalog.tools
      .filter(({ status }) => status === 'enabled')
      .sort(
        (left, right) =>
          left.id.localeCompare(right.id) ||
          right.version.localeCompare(left.version, undefined, {
            numeric: true,
          }),
      )
      .filter(
        (item, index, items) => index === 0 || item.id !== items[index - 1].id,
      )
      .map(({ definition }) => definition)
      .filter((definition) => isToolExecutableInContext(definition, context))
    const selectedSkill =
      'skill' in context && context.skill
        ? catalog.skills.find(
            ({ status, id, version, definitionDigest }) =>
              status === 'enabled' &&
              id === context.skill?.id &&
              version === context.skill.version &&
              definitionDigest === context.skill.digest,
          )?.definition
        : undefined
    if ('skill' in context && context.skill && !selectedSkill) {
      throw new Error('Skill definition is unavailable')
    }
    if (selectedSkill && !this.dependencies.skills) {
      throw new Error('Skill instructions are unavailable')
    }
    const discoveredSkills =
      this.dependencies.skills && discoverAll
        ? catalog.skills
            .filter(({ status }) => status === 'enabled')
            .sort(
              (left, right) =>
                left.id.localeCompare(right.id) ||
                right.version.localeCompare(left.version, undefined, {
                  numeric: true,
                }),
            )
            .filter(
              (item, index, items) =>
                index === 0 || item.id !== items[index - 1].id,
            )
            .map(({ definition }) => definition)
            .filter(
              (definition) =>
                !selectedSkill ||
                definition.id !== selectedSkill.id ||
                definition.version !== selectedSkill.version ||
                definition.definitionDigest !== selectedSkill.definitionDigest,
            )
            .filter((definition) =>
              definition.requiredTools.every(
                (dependency) =>
                  !dependency.required ||
                  enabledTools.some(
                    ({ id, version }) =>
                      id === dependency.toolId &&
                      isToolVersionInRange(version, dependency.versionRange),
                  ),
              ),
            )
        : []
    const discoveredTools =
      selectedSkill && !discoverAll
        ? []
        : enabledTools
            .filter(
              (definition) =>
                (discoverAll ||
                  definition.discovery.requiresExplicitSelection !== true) &&
                (discoverAll ||
                  definition.discovery.contexts.some((item) =>
                    contexts.has(item),
                  )),
            )
    const contextualTools = discoverAll
      ? discoveredTools
      : discoveredTools.slice(0, 64)
    const scenario = resolveAgentRunScenario(context)
    const scope = resolveAgentRunScope(context, scenario.id)
    const profile = await this.profiles.resolve({
      scenarioId: scenario.id,
      scope,
      capabilities: [
        ...enabledTools.map(toolCapabilityDescriptor),
        ...uniqueSkills([
          ...discoveredSkills,
          ...(selectedSkill ? [selectedSkill] : []),
        ]).map(skillCapabilityDescriptor),
        ...installedCapabilities.map(({ definition }) => ({
          kind: definition.kind,
          id: definition.id,
          version: definition.version,
          digest: definition.definitionDigest,
          risk: definition.permissions.maximumRisk,
        })),
      ],
      businessContext: profileBusinessContext(context),
    })
    const allowedCapabilities = new Set(profile.capabilities.map(capabilityKey))
    const skills = discoveredSkills.filter((skill) =>
      allowedCapabilities.has(capabilityKey(skillCapabilityDescriptor(skill))) &&
      skill.requiredTools.every((dependency) =>
        !dependency.required || enabledTools.some((tool) =>
          tool.id === dependency.toolId &&
          isToolVersionInRange(tool.version, dependency.versionRange) &&
          allowedCapabilities.has(capabilityKey(toolCapabilityDescriptor(tool))),
        ),
      ),
    )
    if (
      selectedSkill &&
      !allowedCapabilities.has(
        capabilityKey(skillCapabilityDescriptor(selectedSkill)),
      )
    ) {
      throw new Error('Selected Skill is denied by Agent Profile')
    }
    const allowedContextualTools = contextualTools.filter((tool) =>
      allowedCapabilities.has(capabilityKey(toolCapabilityDescriptor(tool))),
    )
    const allowedConnectorTools = connectorTools.filter((tool) => {
      if (tool.executor.kind !== 'connector') return false
      const executor = tool.executor
      const installed = installedCapabilities.find(
        ({ definition }) =>
          definition.id === executor.capabilityId &&
          definition.version === executor.capabilityVersion &&
          definition.definitionDigest === executor.capabilityDigest,
      )
      return (
        installed !== undefined &&
        allowedCapabilities.has(
          capabilityKey({
            kind: 'connector',
            id: installed.definition.id,
            version: installed.definition.version,
            digest: installed.definition.definitionDigest,
            risk: installed.definition.permissions.maximumRisk,
          }),
        )
      )
    })
    const selectedSkillTools = [
      ...(selectedSkill ? [selectedSkill] : []),
    ].flatMap((skill) =>
      skill.requiredTools.flatMap((dependency) => {
        const definition = enabledTools
          .filter(
            ({ id, version }) =>
              id === dependency.toolId &&
              isToolVersionInRange(version, dependency.versionRange),
          )
          .sort((left, right) =>
            right.version.localeCompare(left.version, undefined, {
              numeric: true,
            }),
          )[0]
        if (!definition && dependency.required) {
          throw new Error(`Required Tool is unavailable: ${dependency.toolId}`)
        }
        if (
          definition &&
          !allowedCapabilities.has(
            capabilityKey(toolCapabilityDescriptor(definition)),
          )
        ) {
          if (dependency.required) {
            throw new Error(
              `Required Tool is denied by Agent Profile: ${dependency.toolId}`,
            )
          }
          return []
        }
        return definition ? [definition] : []
      }),
    )
    const requiredTools = selectedSkillTools.filter((tool) =>
      selectedSkill?.requiredTools.some((dependency) =>
        dependency.required && dependency.toolId === tool.id,
      ),
    )
    const authorizedDefinitions = uniqueDefinitions([
      ...allowedContextualTools,
      ...allowedConnectorTools,
      ...selectedSkillTools,
    ]).filter(
      (definition) =>
        !context.runtimeDelegation || isReadOnlyDelegatedTool(definition),
    )
    const policyInput: ToolPolicyInput = {
      providerId,
      inheritedGrants,
      sandbox: await this.dependencies.resolveSandbox?.(),
      context: scheduled ? 'schedule' : 'nodeId' in context ? 'workflow'
        : 'requirementId' in context ? 'requirement' : 'workspaceId' in context && context.workspaceId ? 'space' : 'general',
      layers: [
        ...(profile.policy.toolPolicies ?? []),
        { alsoAllow: profile.policy.rules.filter((rule) =>
          rule.kind === 'tool' && (rule.effect === 'allow' || rule.effect === 'require'),
        ).map(({ id }) => id) },
      ],
    }
    const surface = new ModelFacingSurfaceResolver().resolve({
      catalog,
      tools: authorizedDefinitions,
      requiredTools: uniqueDefinitions([
        ...requiredTools,
        ...authorizedDefinitions.filter((tool) => profile.policy.rules.some((rule) =>
          rule.kind === 'tool' && rule.effect === 'require' && rule.id === tool.id,
        )),
      ]),
      skills,
      policy: policyInput,
      mode: profile.policy.modelFacingMode ?? 'auto',
    })
    const delegationTool = projectModelFacingToolCatalog({
      packages: [], tools: [], skills: [],
    }, 'facade').tools.find(({ id }) => id === 'subagents')!.definition
    const delegationPermitted = new ToolPolicyEngine().resolve([delegationTool], policyInput).grants.length > 0
    const skillContext = selectedSkill
      ? injectSkillInstructions(
          context,
          selectedSkill,
          await this.dependencies.skills!.readInstructions(selectedSkill),
        )
      : context
    const responseLanguage =
      context.responseLanguage ??
      resolveResponseLanguage(
        latestNaturalLanguageInput(skillContext),
        context.applicationLocale
      )
    const selectedContext = {
      ...skillContext,
      responseLanguage,
      systemPrompt: [
        profile.prompt,
        skillContext.systemPrompt,
        surface.directory?.renderedPromptDirectory,
        responseLanguagePolicy(responseLanguage)
      ]
        .filter(Boolean)
        .join('\n\n'),
    }
    const requestedMaxToolCalls = context.runtimeDelegation
      ? context.runtimeDelegation.maxToolCalls
      : selectedSkill?.limits.maxToolCalls ??
        Math.max(
          this.maxToolCalls,
          scenario.defaultBudgets.maxToolCalls,
          ...skills.map((skill) => skill.limits.maxToolCalls),
        )
    const maxSubagents =
      delegationPermitted && (scenario.id === 'general' || scenario.id === 'space')
        ? Math.min(
            profile.budgets.maxSubagents,
            profile.policy.perRunLimits.agent,
          )
        : 0
    return {
      context: selectedContext,
      definitions: surface.definitions,
      skills: surface.skills,
      capabilityScopes,
      profile,
      toolPolicy: surface.policy!,
      modelFacing: { mode: surface.mode, ...(surface.directory ? { directory: surface.directory } : {}) },
      scenario,
      catalogDigest: capabilityCatalogDigest(catalog, installedCapabilities),
      maxToolCalls: Math.min(
        requestedMaxToolCalls,
        profile.budgets.maxToolCalls,
        profile.policy.perRunLimits.tool,
      ),
      maxSubagents,
      delegationAllowed:
        maxSubagents > 0 && delegationDepth(context) < MAX_DELEGATION_DEPTH,
    }
  }

  private async projectRuntimeLifecycle(
    runId: string,
    event: AiRunEvent,
  ): Promise<void> {
    const runtimeRunId = this.getBinding(runId)?.runtimeRunId
    if (!runtimeRunId) return
    const status = lifecycleStatusForEvent(event)
    if (!status) return
    await this.transitionRuntimeRun(runtimeRunId, status, event.data.message)
  }

  private async transitionRuntimeRun(
    runtimeRunId: string,
    status: AgentRunLifecycleStatus,
    error?: string,
  ): Promise<void> {
    await this.dependencies.runtimeRuns?.transition(
      runtimeRunId,
      status,
      this.dependencies.now?.() ?? Date.now(),
      error,
    )
  }

  private async cleanupTerminal(
    runId: string,
    eventType: AiRunEvent['type']
  ): Promise<void> {
    if (!TERMINAL_EVENTS.has(eventType)) return
    try {
      await this.dependencies.onTerminal?.(
        runId,
        eventType as 'run.completed' | 'run.failed' | 'run.cancelled'
      )
    } catch {
      console.error('Agent terminal resource cleanup failed', {
        runId,
        eventType,
        errorCode: 'terminal_resource_cleanup_failed'
      })
    }
  }

  private resolvePublicRunId(runId: string): string | undefined {
    if (this.runs.has(runId)) return runId
    return this.providerRunIds.get(runId)
  }

  private getBinding(runId: string): RunBinding | undefined {
    const publicRunId = this.resolvePublicRunId(runId)
    return publicRunId ? this.runs.get(publicRunId) : undefined
  }

  private providerRunIdFor(runId: string): string {
    return this.getBinding(runId)?.providerRunId ?? runId
  }

  private deleteBinding(runId: string): void {
    const publicRunId = this.resolvePublicRunId(runId) ?? runId
    const binding = this.runs.get(publicRunId)
    this.runs.delete(publicRunId)
    if (binding?.providerRunId) {
      this.providerRunIds.delete(binding.providerRunId)
    }
  }

  private async acknowledgeProviderTurn(
    binding: RunBinding, providerRunId: string, turn: number | undefined, signal: AbortSignal
  ): Promise<void> {
    const boundary = this.dependencies.turnBoundary
    const acknowledge = this.dependencies.gateway.acknowledgeTurn
    if (!boundary || !acknowledge || !binding.snapshot || !binding.toolConfiguration?.turnGate ||
        !Number.isSafeInteger(turn) || turn! < 1 || turn! > 180) {
      throw new Error('runtime_turn_unavailable')
    }
    if (signal.aborted || binding.abortController?.signal.aborted) throw new Error('request_cancelled')
    const key = `${providerRunId}:${turn}`
    binding.turnReceipts ??= new Map()
    let messages = binding.turnReceipts.get(key)
    if (!messages) {
      const pending = boundary.pending(binding.snapshot.runId)
      const messageWindow = [...binding.messageWindow, ...pending.map((item) => ({
        id: `instruction:${item.id}`, role: 'user' as const, content: item.message
      }))]
      const checkpoint = checkpointForBinding(
        { ...binding, messageWindow }, 'turn_ready', () => binding.checkpointOrdinal + 1,
        this.dependencies.now?.() ?? Date.now()
      )
      await boundary.commit(checkpoint, pending.map((item) => item.id))
      binding.messageWindow = messageWindow
      binding.checkpointOrdinal = checkpoint.ordinal
      messages = pending.map((item) => ({ role: 'user' as const, content: item.message }))
      binding.turnReceipts.set(key, messages)
    }
    if (signal.aborted || binding.abortController?.signal.aborted) throw new Error('request_cancelled')
    await acknowledge(providerRunId, { turn: turn!, messages })
  }

  private async writeCheckpoint(
    runId: string,
    reason: CheckpointReason,
  ): Promise<RunCheckpoint | undefined> {
    if (!this.dependencies.checkpoints) return undefined
    const binding = this.getBinding(runId)
    if (!binding?.snapshot) return undefined
    const checkpoint = checkpointForBinding(
      binding,
      reason,
      () => {
        binding.checkpointOrdinal += 1
        return binding.checkpointOrdinal
      },
      this.dependencies.now?.() ?? Date.now(),
    )
    try {
      await this.dependencies.checkpoints.save(checkpoint)
    } catch (error) {
      binding.checkpointOrdinal -= 1
      throw error
    }
    return checkpoint
  }

  private compactWorkingWindow(
    binding: RunBinding,
    force = false,
  ): RunCheckpoint['compaction'] | undefined {
    if (
      binding.compaction &&
      binding.messageWindow.length === 1 &&
      binding.messageWindow[0]?.id.startsWith('compaction-')
    ) {
      return undefined
    }
    const characterCount = binding.messageWindow.reduce(
      (total, message) => total + message.content.length,
      0,
    )
    if (!force && characterCount <= this.contextCompactionCharacters) {
      return undefined
    }
    const brief =
      'processing' in binding.context
        ? binding.context.processing?.executionBrief
        : undefined
    const latestUser = [...binding.messageWindow]
      .reverse()
      .find(({ role }) => role === 'user')
    const objective =
      brief?.objective.trim() ||
      latestUser?.content.trim().slice(0, this.contextCompactionCharacters)
    if (!objective) return undefined
    const facts = [
      {
        section: 'objective' as const,
        content: objective,
        sourceIds: [brief ? 'execution-brief' : latestUser!.id],
      },
      ...(brief?.constraints ?? []).map((constraint) => ({
        section: 'constraints' as const,
        content: constraint,
        sourceIds: ['execution-brief'],
      })),
      ...[...binding.pendingCalls.values()].map((call) => ({
        section: 'incompleteItems' as const,
        content: `Complete ${call.toolName ?? call.callId}`,
        sourceIds: [`tool-call:${call.callId}`],
      })),
    ]
    const compacted = compactAgentContext({
      facts,
      maxCharacters: this.contextCompactionCharacters,
    })
    binding.compaction = {
      summary: compacted.summary,
      sourceMappings: compacted.sourceMappings,
    }
    binding.messageWindow = [
      {
        id: `compaction-${binding.checkpointOrdinal + 1}`,
        role: 'user',
        content: formatCompactionSummary(compacted.summary),
      },
    ]
    return binding.compaction
  }

  private async executeToolCall(
    runId: string,
    call: AiRunToolCall | undefined,
  ): Promise<void> {
    const binding = this.getBinding(runId)
    if (!binding || !call) {
      await this.submitFailure(
        runId,
        call?.id ?? 'unknown',
        'tool_call_invalid',
        'Tool call context is unavailable',
      )
      return
    }
    try {
      if (binding.abortController?.signal.aborted) throw new Error('request_cancelled')
      if (binding.snapshot) this.dependencies.budgets?.consume({
        runId: binding.snapshot.runId,
        requestId: `tool:${call.id}`,
        fingerprint: canonicalToolCallFingerprint(call.name, call.arguments),
        at: this.dependencies.now?.() ?? Date.now(),
      })
    } catch (error) {
      await this.submitFailure(runId, call.id, safeErrorMessage(error), 'Runtime budget or lifecycle does not permit this call')
      return
    }
    if (call.name === SUBAGENT_DELEGATION_TOOL_NAME) {
      if (!binding.delegationAllowed || !binding.snapshot) {
        await this.submitFailure(
          runId,
          call.id,
          'delegation_not_allowed',
          'Subagent delegation is not allowed',
        )
        return
      }
      let request: DelegationRequest
      try {
        request = parseArguments(call.arguments) as DelegationRequest
      } catch {
        await this.submitFailure(
          runId,
          call.id,
          'delegation_arguments_invalid',
          'Subagent delegation arguments are invalid',
        )
        return
      }
      await this.executeDelegation(runId, call.id, binding, request)
      return
    }
    const definition = binding.toolsByName.get(call.name)
    const skill = binding.skillsByName.get(call.name)
    if (!definition && !skill) {
      await this.submitFailure(
        runId,
        call.id,
        'definition_unavailable',
        'Requested Tool is unavailable',
      )
      return
    }
    let input: Record<string, unknown>
    try {
      input = parseArguments(call.arguments)
    } catch {
      await this.submitFailure(
        runId,
        call.id,
        'arguments_invalid',
        'Tool arguments are invalid',
      )
      return
    }
    if (definition?.id === 'subagents') {
      if (!binding.delegationAllowed || !binding.snapshot) {
        await this.submitFailure(
          runId,
          call.id,
          'delegation_not_allowed',
          'Subagent delegation is not allowed',
        )
        return
      }
      const parsed = input as DelegationRequest
      await this.executeDelegation(
        runId,
        call.id,
        binding,
        parsed,
      )
      return
    }
    if (skill) {
      await this.loadSkill(runId, call.id, skill, input)
      return
    }
    try {
      const result = await this.dependencies.tools.execute({
        definition: reference(definition!),
        triggerSource: 'model',
        context: executionContext(
          binding.context,
          runId,
          binding.capabilityScopes,
          call.id,
        ),
        input,
        ...('conversationId' in binding.context &&
        binding.context.connectorBindings
          ? { connectorBindings: binding.context.connectorBindings }
          : {}),
        idempotencyKey: idempotencyKey(runId, call.id),
      }, binding.abortController?.signal)
      if (result.outcome === 'permission_required') {
        const pending = binding.pendingCalls.get(call.id)
        if (pending) {
          binding.pendingCalls.set(call.id, {
            ...pending,
            executionId: result.executionId,
          })
        }
        return
      }
      if (result.outcome === 'permission_denied') {
        await this.submitFailure(
          runId,
          call.id,
          'permission_denied',
          'Tool permission was denied',
        )
        return
      }
      if (result.execution.status === 'succeeded') {
        await this.dependencies.gateway.submitToolResult(
          this.providerRunIdFor(runId),
          {
          callId: call.id,
          status: 'completed',
          output: result.execution.output ?? {},
          toolExecutionId: result.execution.id,
          resultSummary: 'Tool execution completed',
          },
        )
        return
      }
      await this.submitFailure(
        runId,
        call.id,
        result.execution.error?.code ?? 'tool_execution_failed',
        toolFailureMessage(
          result.execution.error?.code ?? 'tool_execution_failed',
          result.execution.error?.message,
        ),
        result.execution.id,
      )
    } catch (error) {
      await this.submitFailure(
        runId,
        call.id,
        toolExecutionErrorCode(error),
        toolFailureMessage(toolExecutionErrorCode(error), safeErrorMessage(error)),
      )
    }
  }

  private async executeDelegation(
    runId: string,
    callId: string,
    binding: RunBinding,
    request: DelegationRequest,
  ): Promise<void> {
    const snapshot = binding.snapshot!
    try {
      const signal = binding.abortController?.signal ?? new AbortController().signal
      const result = this.dependencies.delegations
        ? await this.dependencies.delegations.execute(snapshot.runId, callId, request, signal)
        : await this.subagents.execute({
        rootRunId: snapshot.rootRunId,
        request,
        policy: {
          scenarioId: snapshot.scenarioId,
          parentScope: snapshot.scope,
          delegationDepth: snapshot.delegationDepth,
          maximumDepth: MAX_DELEGATION_DEPTH,
          maximumConcurrency: MAX_DELEGATION_CONCURRENCY,
          rootBudgets:
            binding.context.runtimeDelegation?.rootBudgets ??
            snapshot.budgets,
          consumedSubagents: 0,
          consumedToolCalls: 0,
        },
        signal:
          binding.abortController?.signal ??
          new AbortController().signal,
        runTask: (task, signal) =>
          this.runDelegatedTask(binding, task, signal),
      })
      if (
        binding.abortController?.signal.aborted ||
        !this.getBinding(runId)
      ) {
        return
      }
      await this.dependencies.gateway.submitToolResult(
        this.providerRunIdFor(runId),
        {
        callId,
        status: 'completed',
        output: delegationOutput(result),
        toolExecutionId: `delegation:${callId}`,
        resultSummary: `Delegated ${result.tasks.length} research tasks`,
        },
      )
    } catch (error) {
      if (
        binding.abortController?.signal.aborted ||
        !this.getBinding(runId)
      ) {
        return
      }
      await this.submitFailure(
        runId,
        callId,
        delegationErrorCode(error),
        safeErrorMessage(error),
        `delegation:${callId}`,
      )
    }
  }

  async runDelegated(record: RuntimeDelegation, signal: AbortSignal): Promise<SubagentTaskResult> {
    const parent = this.getBinding(record.parentRunId)
    if (!parent?.snapshot || !parent.delegationAllowed ||
        parent.snapshot.rootRunId !== record.rootRunId ||
        !isDeepStrictEqual(parent.snapshot.scope, record.task.scope)) {
      throw new Error('runtime_scope_denied')
    }
    if (signal.aborted || parent.abortController?.signal.aborted) throw new Error('request_cancelled')
    return this.runDelegatedTask(parent, record.task, signal, record)
  }

  private async runDelegatedTask(
    parent: RunBinding,
    task: ValidatedDelegationTask,
    signal: AbortSignal,
    identity?: Pick<RuntimeDelegation, 'runId' | 'sessionId'>,
  ): Promise<SubagentTaskResult> {
    const parentSnapshot = parent.snapshot!
    if (!('conversationId' in parent.context)) {
      throw new Error('Subagent parent conversation is unavailable')
    }
    const childContext: RunContext = {
      ...parent.context,
      ...(identity ? { conversationId: identity.sessionId } : {}),
      messages: [
        {
          role: 'user',
          content: delegatedTaskPrompt(task),
        },
      ],
      runtimeDelegation: {
        rootRunId: parentSnapshot.rootRunId,
        parentRunId: parentSnapshot.runId,
        delegationDepth: parentSnapshot.delegationDepth + 1,
        delegationOrdinal: task.ordinal,
        maxToolCalls: task.maxToolCalls,
        rootBudgets:
          parent.context.runtimeDelegation?.rootBudgets ??
          parentSnapshot.budgets,
      },
    }
    const coordinator = this
    const events = (async function* () {
      const childRunId = (await coordinator.createPolicyBoundRun(
        childContext, parent.model, parentSnapshot.toolPolicy?.grants ?? [],
        identity ? { runtimeRunId: identity.runId, signal } : undefined,
      )).runId
      const cancel = (): void => {
        void coordinator.cancelRun(childRunId).catch(() => undefined)
      }
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
      try {
        yield* coordinator.streamEvents(childRunId, signal)
      } finally {
        signal.removeEventListener('abort', cancel)
      }
    })()
    return collectDelegatedRunResult(task.id, events, signal)
  }

  private async loadSkill(
    runId: string,
    callId: string,
    skill: SkillDefinition,
    input: Record<string, unknown>,
  ): Promise<void> {
    const binding = this.getBinding(runId)
    if (!binding || !this.dependencies.skillRuntime) {
      await this.submitFailure(
        runId,
        callId,
        'skill_unavailable',
        'Skill runtime is unavailable',
      )
      return
    }
    try {
      const result = await this.dependencies.skillRuntime.execute({
        definition: skill,
        parentRunId: runId,
        callId,
        context: executionContext(
          binding.context,
          runId,
          binding.capabilityScopes,
          callId,
        ),
        input,
        ...(skill.runtime.kind === 'executable'
          ? { permissionDecisions: skillPermissionDecisions(skill) }
          : {}),
        ...('conversationId' in binding.context &&
        binding.context.connectorBindings
          ? { connectorBindings: binding.context.connectorBindings }
          : {}),
      })
      await this.submitSkillResult(runId, callId, result)
    } catch {
      await this.submitFailure(
        runId,
        callId,
        'skill_execution_failed',
        'Skill execution failed',
      )
    }
  }

  private async submitSkillResult(
    runId: string,
    callId: string,
    result: SkillRuntimeResult,
  ): Promise<void> {
    if (result.outcome === 'permission_required') {
      await this.submitFailure(
        runId,
        callId,
        'skill_permission_required',
        'Skill permission is required',
      )
      return
    }
    if (result.outcome === 'permission_denied') {
      await this.submitFailure(
        runId,
        callId,
        'skill_permission_denied',
        'Skill permission was denied',
      )
      return
    }
    if (result.execution.status === 'succeeded') {
      await this.dependencies.gateway.submitToolResult(
        this.providerRunIdFor(runId),
        {
        callId,
        status: 'completed',
        output: result.execution.output ?? {},
        toolExecutionId: result.execution.id,
        resultSummary: 'Skill execution completed',
        },
      )
      return
    }
    await this.submitFailure(
      runId,
      callId,
      result.execution.error?.code ?? 'skill_execution_failed',
      result.execution.error?.message ?? 'Skill execution failed',
      result.execution.id,
    )
  }

  private submitFailure(
    runId: string,
    callId: string,
    errorCode: string,
    message: string,
    toolExecutionId?: string,
  ): Promise<void> {
    return this.dependencies.gateway.submitToolResult(
      this.providerRunIdFor(runId),
      {
        callId,
        status: 'failed',
        errorCode,
        message,
        ...(toolExecutionId ? { toolExecutionId } : {}),
      },
    )
  }
}

function checkpointForBinding(
  binding: RunBinding,
  reason: CheckpointReason,
  nextOrdinal: () => number,
  createdAt: number,
): RunCheckpoint {
  const snapshot = binding.snapshot
  if (!snapshot) {
    throw new Error('Agent Run snapshot is unavailable')
  }
  return createRunCheckpoint({
    runId: snapshot.runId,
    ordinal: nextOrdinal(),
    reason,
    snapshotDigest: createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex'),
    configurationDigests: {
      agentProfile: snapshot.agentProfileDigest,
      prompt: snapshot.promptDigest,
      policy: snapshot.policyDigest,
      capabilityCatalog: snapshot.capabilityCatalogDigest,
      capabilityBinding: snapshot.capabilityBindingDigest,
    },
    messageWindow: binding.messageWindow,
    ...(binding.toolConfiguration
      ? { toolConfiguration: binding.toolConfiguration }
      : {}),
    ...(binding.compaction ? { compaction: binding.compaction } : {}),
    pendingCalls: [...binding.pendingCalls.values()],
    ledger: structuredClone(binding.ledger),
    remainingBudgets: { ...binding.remainingBudgets },
    projectionCursor: binding.projectionCursor,
    createdAt,
  })
}

function checkpointMessages(
  context: RunContext,
): RunCheckpoint['messageWindow'] {
  if ('messages' in context) {
    return context.messages.map((message, index) => ({
      id: `context-message-${index + 1}`,
      role: message.role,
      content: message.content,
    }))
  }
  if ('prompt' in context) {
    return [
      {
        id: 'context-prompt',
        role: 'user',
        content: context.prompt,
      },
    ]
  }
  return [
    {
      id: 'context-stage',
      role: 'user',
      content: `Generate ${context.stageId}`,
    },
  ]
}

function recoveryContext(
  run: AgentRuntimeRun,
  checkpoint: RunCheckpoint,
): RunContext {
  const messages = checkpoint.messageWindow
    .filter(
      (
        message,
      ): message is typeof message & {
        role: 'user' | 'assistant' | 'tool'
      } => message.role !== 'system',
    )
    .map(({ role, content }) => ({ role, content }))
  const scope = run.snapshot.scope
  if (run.snapshot.scenarioId === 'workflow-node') {
    if (scope.kind !== 'workflow') {
      throw new Error('Recovered workflow Run scope is invalid')
    }
    return {
      requirementId: scope.requirementId,
      requirementTitle: scope.requirementId,
      nodeId: scope.nodeId ?? 'recovered-node',
      ...(scope.nodeRunId ? { nodeRunId: scope.nodeRunId } : {}),
      workspaceId: scope.workspaceId,
      workspaceName: scope.workspaceId,
      prompt: messages.at(-1)?.content ?? 'Continue',
      ...(run.snapshot.contextSnapshotId
        ? { contextSnapshotId: run.snapshot.contextSnapshotId }
        : {}),
      ...(run.snapshot.triggerBindingId
        ? { triggerBindingId: run.snapshot.triggerBindingId }
        : {}),
      ...(run.snapshot.triggerEventId
        ? { triggerEventId: run.snapshot.triggerEventId }
        : {}),
      artifactPath: 'artifacts/recovered.md',
      existingArtifacts: [],
    }
  }
  return {
    conversationId: run.snapshot.conversationId ?? run.id,
    messages,
    ...(run.snapshot.delegationMode === 'research' && run.snapshot.parentRunId ? {
      runtimeDelegation: {
        rootRunId: run.snapshot.rootRunId,
        parentRunId: run.snapshot.parentRunId,
        delegationDepth: run.snapshot.delegationDepth,
        delegationOrdinal: run.snapshot.delegationOrdinal,
        maxToolCalls: run.snapshot.budgets.maxToolCalls,
        rootBudgets: run.snapshot.budgets,
      },
    } : {}),
    ...(scope.kind === 'folder' ? { folderPath: scope.folderPath } : {}),
    ...('workspaceId' in scope ? { workspaceId: scope.workspaceId } : {}),
    ...(scope.kind === 'requirement-node'
      ? {
          requirementId: scope.requirementId,
          nodeId: scope.nodeId,
          nodeRunId: scope.nodeRunId,
        }
      : {}),
    ...(run.snapshot.scenarioId === 'scheduled'
      ? { scheduleRunId: run.snapshot.scheduleRunId ?? run.id }
      : {}),
    ...(run.snapshot.contextSnapshotId
      ? { contextSnapshotId: run.snapshot.contextSnapshotId }
      : {}),
    ...(run.snapshot.triggerBindingId
      ? { triggerBindingId: run.snapshot.triggerBindingId }
      : {}),
    ...(run.snapshot.triggerEventId
      ? { triggerEventId: run.snapshot.triggerEventId }
      : {}),
    ...(run.snapshot.scenarioId === 'sensitive' ||
    run.snapshot.scenarioId === 'management'
      ? { requestedScenarioId: run.snapshot.scenarioId }
      : {}),
    pipelineVersion: run.snapshot.pipelineVersion,
  }
}

function recoveryBranchContext(
  run: AgentRuntimeRun,
  checkpoint: RunCheckpoint,
  ordinal: number,
): RunContext {
  const recovered = recoveryContext(run, checkpoint)
  const context =
    'conversationId' in recovered
      ? (({ pipelineVersion: _pipelineVersion, ...value }) => value)(recovered)
      : recovered
  return {
    ...context,
    runtimeBranch: {
      rootRunId: run.snapshot.rootRunId,
      parentRunId: run.id,
      depth: run.snapshot.delegationDepth + 1,
      ordinal,
      sourceCheckpoint: {
        runId: run.id,
        ordinal: checkpoint.ordinal,
        resumeToken: checkpoint.resumeToken,
      },
    },
  }
}

function checkpointReasonForEvent(
  event: AiRunEvent,
): CheckpointReason | undefined {
  if (
    event.type === 'tool.call.completed' ||
    event.type === 'tool.call.failed'
  ) {
    return 'tool_completed'
  }
  if (event.type === 'tool.call.permission_required') {
    return 'permission_wait'
  }
  if (TERMINAL_EVENTS.has(event.type)) return 'terminal'
  return undefined
}

function updateCheckpointState(
  binding: RunBinding,
  event: AiRunEvent,
): void {
  if (event.type === 'answer.delta' && event.data.delta) {
    const id = `answer:${event.runId}`
    const answer = binding.messageWindow.find((message) => message.id === id)
    if (answer) answer.content += event.data.delta
    else binding.messageWindow.push({ id, role: 'assistant', content: event.data.delta })
    return
  }
  if (
    Number.isInteger(event.data.agentTurn) &&
    (event.data.agentTurn ?? 0) > binding.ledger.agentTurns
  ) {
    binding.ledger.agentTurns = event.data.agentTurn!
  }
  if (event.type === 'tool.call.requested' && event.data.toolCall) {
    const call = event.data.toolCall
    const progress = recordToolRequest(
      binding.ledger,
      canonicalToolCallFingerprint(call.name, call.arguments),
      binding.snapshot?.executionPolicy ??
        resolveAgentRunScenario(binding.context).executionPolicy,
    )
    binding.ledger = progress.ledger
    binding.progressStopReason = progress.reason
    binding.remainingBudgets.toolCalls = Math.max(
      0,
      binding.remainingBudgets.toolCalls - 1,
    )
    const definition = binding.toolsByName.get(call.name)
    binding.pendingCalls.set(call.id, {
      callId: call.id,
      toolName: call.name,
      effect: definition
        ? checkpointEffect(definition.effects)
        : 'none',
      idempotency:
        definition?.invocation.idempotency ?? 'supported',
      status: 'requested',
    })
    const messageId = event.data.agentTurn === undefined
      ? event.id : `tool-turn:${event.runId}:${event.data.agentTurn}`
    const message = binding.messageWindow.find(({ id }) => id === messageId)
    const toolCall = { id: call.id, name: call.name, arguments: call.arguments }
    if (message?.toolCalls) message.toolCalls.push(toolCall)
    else binding.messageWindow.push({
      id: messageId, role: 'assistant', content: '', toolCalls: [toolCall]
    })
    return
  }
  if (event.type === 'tool.call.permission_required') {
    binding.ledger.permissionWaits += 1
    const callId = event.data.callId ?? event.data.toolResult?.callId
    const pending = callId ? binding.pendingCalls.get(callId) : undefined
    if (pending) {
      binding.pendingCalls.set(callId!, {
        ...pending,
        ...(event.data.toolExecutionId
          ? { executionId: event.data.toolExecutionId }
          : {}),
        ...(event.data.requestId
          ? { requestId: event.data.requestId }
          : {}),
        status: 'permission_required',
      })
    }
    return
  }
  if (
    event.type === 'tool.call.completed' ||
    event.type === 'tool.call.failed'
  ) {
    const result = event.data.toolResult
    const callId = result?.callId
    if (callId && result) {
      const pending = binding.pendingCalls.get(callId)
      if (event.type === 'tool.call.failed') {
        const progress = recordConsecutiveToolFailure(
          binding.ledger,
          binding.snapshot?.executionPolicy ??
            resolveAgentRunScenario(binding.context).executionPolicy,
        )
        binding.ledger = progress.ledger
        binding.progressStopReason =
          result.status === 'failed' &&
          isNonRetryableCapabilityFailure(result.errorCode)
            ? 'capability_unavailable'
            : progress.reason
      } else {
        binding.ledger = recordSuccessfulToolExecution(binding.ledger)
      }
      if (
        pending?.effect === 'local_write' ||
        pending?.effect === 'external_write'
      ) {
        binding.ledger.sideEffects += 1
      }
      const resultMessage: RunCheckpoint['messageWindow'][number] = {
        id: event.id,
        role: 'tool',
        content: JSON.stringify(
          result.status === 'completed'
            ? result.output
            : {
                status: result.status,
                errorCode: result.errorCode,
                message: result.message,
              },
        ),
        toolCallId: callId,
        name: pending?.toolName ?? event.data.toolName ?? 'tool',
      }
      const assistantIndex = binding.messageWindow.findIndex(message =>
        message.toolCalls?.some(call => call.id === callId))
      if (assistantIndex < 0) binding.messageWindow.push(resultMessage)
      else {
        const calls = binding.messageWindow[assistantIndex].toolCalls!
        const callIndex = calls.findIndex(call => call.id === callId)
        let insertAt = assistantIndex + 1
        while (insertAt < binding.messageWindow.length) {
          const candidate = binding.messageWindow[insertAt]
          if (candidate.role !== 'tool' ||
              calls.findIndex(call => call.id === candidate.toolCallId) > callIndex) break
          insertAt += 1
        }
        binding.messageWindow.splice(insertAt, 0, resultMessage)
      }
      binding.pendingCalls.delete(callId)
    }
  }
}

function checkpointEffect(
  effects: readonly string[],
): RunCheckpoint['pendingCalls'][number]['effect'] {
  if (
    effects.some((effect) =>
      /(?:send|publish|external|connector|network).*write|write.*(?:external|connector|network)/i.test(
        effect,
      ),
    )
  ) {
    return 'external_write'
  }
  if (
    effects.some((effect) =>
      /(?:write|delete|modify|execute|create|update)/i.test(effect),
    )
  ) {
    return 'local_write'
  }
  return effects.length > 0 ? 'local_read' : 'none'
}

function formatCompactionSummary(
  summary: NonNullable<RunCheckpoint['compaction']>['summary'],
): string {
  return [
    '## Objective',
    summary.objective,
    '## Constraints',
    ...summary.constraints.map((item) => `- ${item}`),
    '## Decisions',
    ...summary.decisions.map((item) => `- ${item}`),
    '## Incomplete items',
    ...summary.incompleteItems.map((item) => `- ${item}`),
    '## Artifacts',
    ...summary.artifacts.map((item) => `- ${item}`),
    '## References',
    ...summary.references.map((item) => `- ${item}`),
  ].join('\n')
}

function stableRunEvent(
  event: AiRunEvent,
  runId: string,
  sequence: number,
): AiRunEvent {
  return {
    ...event,
    id: `${runId}:${sequence}`,
    runId,
    sequence,
  } as AiRunEvent
}

function isAgentTurnSegmentLimit(event: AiRunEvent): boolean {
  return (
    event.type === 'run.failed' &&
    event.data.errorCode === 'max_agent_turns'
  )
}

function isRetryableProviderFailure(event: AiRunEvent): boolean {
  if (event.type !== 'run.failed') return false
  const errorCode = event.data.errorCode
  return (
    event.data.retryable === true ||
    errorCode === 'provider_unavailable' ||
    errorCode === 'provider_timeout' ||
    errorCode === 'provider_rate_limited'
  )
}

function nextRuntimeEvent(
  binding: RunBinding,
  runId: string,
  type: AiRunEvent['type'],
  data: AiRunEvent['data'],
  timestamp: number,
): AiRunEvent {
  binding.projectionCursor += 1
  return {
    id: `${runId}:${binding.projectionCursor}`,
    runId,
    sequence: binding.projectionCursor,
    type,
    timestamp: new Date(timestamp).toISOString(),
    data,
  }
}

function compactionEventData(
  compaction: NonNullable<RunCheckpoint['compaction']>,
): AiRunEvent['data'] {
  return {
    objectiveCount: compaction.summary.objective ? 1 : 0,
    constraintCount: compaction.summary.constraints.length,
    incompleteItemCount: compaction.summary.incompleteItems.length,
    sourceCount: new Set(
      compaction.sourceMappings.map(({ sourceId }) => sourceId),
    ).size,
  }
}

function injectSkillInstructions(
  context: RunContext,
  skill: SkillDefinition,
  instructions: string,
): RunContext {
  const heading = `## Skill: ${skill.name}\n\n${instructions}\n\n`
  if ('conversationId' in context) {
    return {
      ...context,
      context:
        heading +
        `## Context\n\n${context.context ?? 'Scheduled Skill execution.'}`,
    }
  }
  if ('nodeId' in context) {
    return {
      ...context,
      prompt: heading + `## Task\n\n${context.prompt}`,
    }
  }
  return context
}

function discoveryContexts(
  context: RunContext,
): Set<ToolDefinition['discovery']['contexts'][number]> {
  if ('scheduleRunId' in context && context.scheduleRunId) {
    return new Set(['schedule'])
  }
  if ('nodeId' in context) {
    return new Set(['requirement', 'workflow'])
  }
  if ('conversationId' in context) {
    return new Set(context.workspaceId ? ['general', 'space'] : ['general'])
  }
  return new Set(['requirement'])
}

function isToolExecutableInContext(
  definition: ToolDefinition,
  context: RunContext,
): boolean {
  const hasWorkspace =
    'workspaceId' in context && Boolean(context.workspaceId)
  const hasFolderPath =
    'folderPath' in context && Boolean(context.folderPath)
  const hasScopeRoot =
    hasWorkspace || hasFolderPath
  if (
    definition.capabilities.some(
      (capability) =>
        capability.startsWith('filesystem.') ||
        capability.startsWith('process.') ||
        capability.startsWith('repository.'),
    ) &&
    !hasScopeRoot
  ) {
    return false
  }
  if (
    definition.capabilities.some((capability) =>
      capability.startsWith('knowledge.'),
    ) &&
    !hasWorkspace
  ) {
    return false
  }
  if (definition.executor.kind !== 'builtin') return true
  if (
    hasFolderPath &&
    !hasWorkspace &&
    definition.executor.handler === 'realmflow.spaces.list'
  ) {
    return false
  }
  if (definition.executor.handler === 'attachment.read_chunk') {
    return (
      'attachmentContext' in context &&
      Boolean(context.attachmentContext?.attachments.length)
    )
  }
  if (
    definition.executor.handler === 'realmflow.requirements.list'
  ) {
    return hasWorkspace
  }
  if (
    [
      'realmflow.requirements.get',
      'realmflow.workflow.get_execution',
      'realmflow.artifacts.list',
      'realmflow.artifacts.read',
    ].includes(definition.executor.handler)
  ) {
    return 'requirementId' in context && Boolean(context.requirementId)
  }
  if (
    definition.executor.handler.startsWith('realmflow.node.')
  ) {
    return 'nodeRunId' in context && Boolean(context.nodeRunId)
  }
  return true
}

function uniqueDefinitions(definitions: ToolDefinition[]): ToolDefinition[] {
  const seen = new Set<string>()
  return definitions.filter((definition) => {
    const key = `${definition.id}@${definition.version}:${definition.definitionDigest}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isReadOnlyDelegatedTool(definition: ToolDefinition): boolean {
  const forbiddenCapabilities = new Set([
    'filesystem.write',
    'filesystem.delete',
    'process.execute',
    'process.manage',
    'repository.modify',
    'realmflow.write',
    'knowledge.write',
    'connector.use',
    'credential.use',
    'computer.control',
    'clipboard.write',
  ])
  return (
    definition.risk !== 'high' &&
    definition.risk !== 'critical' &&
    definition.capabilities.every(
      (capability) => !forbiddenCapabilities.has(capability),
    ) &&
    definition.effects.every(
      (effect) =>
        !/(?:write|delete|modify|execute|manage|control|send|create|update)/i.test(
          effect,
        ),
    )
  )
}

function uniqueSkills(definitions: SkillDefinition[]): SkillDefinition[] {
  const seen = new Set<string>()
  return definitions.filter((definition) => {
    const key = `${definition.id}@${definition.version}:${definition.definitionDigest}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toolCapabilityDescriptor(
  definition: ToolDefinition,
): CapabilityDescriptor {
  return {
    kind: 'tool',
    id: definition.id,
    version: definition.version,
    digest: definition.definitionDigest,
    risk: definition.risk,
  }
}

function skillCapabilityDescriptor(
  definition: SkillDefinition,
): CapabilityDescriptor {
  return {
    kind: 'skill',
    id: definition.id,
    version: definition.version,
    digest: definition.definitionDigest,
    risk: 'medium',
  }
}

function capabilityKey(capability: CapabilityDescriptor): string {
  return [
    capability.kind,
    capability.id,
    capability.version,
    capability.digest,
  ].join(':')
}

function profileBusinessContext(context: RunContext): string {
  const lines = [
    `Scenario: ${resolveAgentRunScenario(context).id}`,
    ...('workspaceId' in context && context.workspaceId
      ? [`Workspace: ${context.workspaceId}`]
      : []),
    ...('requirementId' in context
      ? [`Requirement: ${context.requirementId}`]
      : []),
    ...('nodeId' in context ? [`Node: ${context.nodeId}`] : []),
    ...('conversationId' in context
      ? [`Conversation: ${context.conversationId}`]
      : []),
  ]
  return lines.join('\n')
}

function modelToolName(definition: ToolDefinition): string {
  const id = definition.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48)
  return `rf_${id}_${definition.definitionDigest.slice(0, 8)}`
}

function modelSkillName(definition: SkillDefinition): string {
  const id = definition.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 42)
  return `rf_skill_${id}_${definition.definitionDigest.slice(0, 8)}`
}

function modelToolDefinition(
  definition: ToolDefinition,
): RunToolConfiguration['tools'][number] {
  return {
    type: 'function',
    function: {
      name: modelToolName(definition),
      description: definition.description,
      parameters: projectProviderToolSchema(definition.inputSchema),
    },
  }
}

function modelSkillDefinition(
  definition: SkillDefinition,
): RunToolConfiguration['tools'][number] {
  return {
    type: 'function',
    function: {
      name: modelSkillName(definition),
      description: `Load and follow the ${definition.name} Skill. ${definition.description}`,
      parameters: projectProviderToolSchema(definition.inputSchema),
    },
  }
}

function modelDelegationDefinition(): RunToolConfiguration['tools'][number] {
  return {
    type: 'function',
    function: {
      name: SUBAGENT_DELEGATION_TOOL_NAME,
      description:
        'Delegate independent read-only research tasks and receive a structured aggregate.',
      parameters: projectProviderToolSchema(DELEGATION_REQUEST_JSON_SCHEMA),
    },
  }
}

function parseArguments(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be an object')
  }
  return parsed as Record<string, unknown>
}

function delegationDepth(context: RunContext): number {
  return 'runtimeDelegation' in context && context.runtimeDelegation
    ? context.runtimeDelegation.delegationDepth
    : 0
}

function delegationOutput(
  result: DelegationResult,
): Record<string, unknown> {
  return {
    status: result.status,
    tasks: result.tasks.map((task) => ({
      ...task,
      evidence: task.evidence.map((item) => ({ ...item })),
      unresolved: [...task.unresolved],
      artifactIds: [...task.artifactIds],
    })),
  }
}

function delegationErrorCode(error: unknown): string {
  const message = safeErrorMessage(error)
  if (message.includes('depth')) return 'delegation_depth_exceeded'
  if (message.includes('scope')) return 'delegation_scope_expansion'
  if (message.includes('duplicate')) return 'delegation_duplicate_task'
  if (message.includes('budget')) return 'delegation_budget_exceeded'
  if (message.includes('not allowed')) return 'delegation_not_allowed'
  if (message.includes('invalid') || message.includes('at most')) {
    return 'delegation_arguments_invalid'
  }
  return 'delegation_failed'
}

function delegatedTaskPrompt(task: ValidatedDelegationTask): string {
  return [
    'Complete this read-only research task.',
    `Objective: ${task.objective}`,
    'Completion criteria:',
    ...task.completionCriteria.map((criterion) => `- ${criterion}`),
    'Return a concise evidence-based summary and unresolved questions.',
  ].join('\n')
}

function reference(definition: ToolDefinition): ToolDefinitionReference {
  return {
    kind: 'tool',
    id: definition.id,
    version: definition.version,
    digest: definition.definitionDigest,
  }
}

function toolFailureMessage(code: string, detail?: string): string {
  if (
    (code === 'tool_arguments_invalid' ||
      code === 'tool_execution_failed' ||
      code === 'builtin_execution_failed' ||
      code.startsWith('file_') ||
      code === 'process_arguments_invalid' ||
      code === 'process_dependency_unavailable' ||
      code === 'tool_effects_unresolved') &&
    detail?.trim()
  ) {
    return sanitizeToolFailureDetail(detail)
  }
  if (code === 'document_export_unavailable') {
    return 'LibreOffice PDF export is unavailable'
  }
  if (code === 'tool_timeout') return 'Tool execution timed out'
  if (code === 'tool_output_limit') {
    return 'Tool output exceeded the allowed limit'
  }
  if (code === 'tool_memory_limit') {
    return 'Tool memory exceeded the allowed limit'
  }
  if (code === 'tool_sandbox_unavailable' || code === 'sandbox_unavailable') {
    return 'OS process isolation is unavailable'
  }
  if (code === 'tool_sandbox_manifest_invalid') {
    return 'Tool sandbox policy validation failed'
  }
  if (code === 'skill_connector_unavailable') {
    return 'The required Skill Connector is unavailable'
  }
  return 'Tool execution failed'
}

function toolExecutionErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^(?:tool|process|file)_[a-z0-9_]+$/.test(error.code)
  ) {
    return error.code
  }
  const message = safeErrorMessage(error)
  if (/scope root|authorized root|authorized scope/i.test(message)) {
    return 'tool_effects_unresolved'
  }
  if (/outside the bound workspace|outside the authorized scope/i.test(message)) {
    return 'builtin_execution_failed'
  }
  return 'tool_execution_failed'
}

function sanitizeToolFailureDetail(value: string): string {
  return value
    .replace(/(?:\/Users|\/home|\/tmp|[A-Za-z]:\\)[^\s"',}]*/g, '[local path]')
    .replace(
      /\b(?:authorization|cookie|password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
      '[redacted]',
    )
    .slice(0, 1_000)
}

function isNonRetryableCapabilityFailure(code: string): boolean {
  return (
    code === 'document_export_unavailable' ||
    code === 'tool_sandbox_unavailable' ||
    code === 'sandbox_unavailable' ||
    code === 'skill_connector_unavailable'
  )
}

function latestNaturalLanguageInput(context: RunContext): string {
  if ('messages' in context) {
    return [...context.messages]
      .reverse()
      .find(({ role }) => role === 'user')?.content ?? ''
  }
  if ('prompt' in context) return context.prompt
  return `${context.requirementTitle} ${context.stageId}`
}

function executionContext(
  context: RunContext,
  parentExecutionId: string,
  capabilityScopes: CapabilityScope[],
  toolCallId: string,
): ToolExecutionCommand['context'] {
  if ('requirementId' in context) {
    return {
      scope: {
        kind: 'requirement',
        requirementId: context.requirementId,
      },
      workspaceId: context.workspaceId,
      requirementId: context.requirementId,
      parentExecutionId,
      toolCallId,
      capabilityScopes: capabilityScopes.map((scope) => ({ ...scope })),
      ...('conversationId' in context
        ? { conversationId: context.conversationId }
        : {}),
      ...('nodeRunId' in context && context.nodeRunId
        ? { nodeRunId: context.nodeRunId }
        : {}),
    }
  }
  if ('conversationId' in context) {
    return {
      scope: context.workspaceId
        ? { kind: 'space', workspaceId: context.workspaceId }
        : {
            kind: 'conversation',
            conversationId: context.conversationId,
          },
      ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
      ...(context.folderPath ? { folderPath: context.folderPath } : {}),
      conversationId: context.conversationId,
      parentExecutionId,
      toolCallId,
      capabilityScopes: capabilityScopes.map((scope) => ({ ...scope })),
      ...(context.scheduleRunId
        ? { scheduleRunId: context.scheduleRunId }
        : {}),
    }
  }
  throw new Error('Tool execution workspace is unavailable')
}

function capabilityCatalogDigest(
  catalog: Awaited<ReturnType<ToolCatalogService['list']>>,
  installed: ReadonlyArray<{
    definition: CapabilityDefinition
    installation: CapabilityInstallation
  }> = [],
): string {
  const entries = [
    ...catalog.tools.map(({ kind, id, version, definitionDigest, status }) => ({
      kind,
      id,
      version,
      definitionDigest,
      status,
    })),
    ...catalog.skills.map(
      ({ kind, id, version, definitionDigest, status }) => ({
        kind,
        id,
        version,
        definitionDigest,
        status,
      }),
    ),
    ...installed.map(({ definition, installation }) => ({
      kind: definition.kind,
      id: definition.id,
      version: definition.version,
      definitionDigest: definition.definitionDigest,
      status: installation.status,
    })),
  ].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id) ||
      left.version.localeCompare(right.version),
  )
  return digest(entries)
}

function capabilityScopeChain(context: RunContext): CapabilityScope[] {
  const scopes: CapabilityScope[] = [{ kind: 'global' }]
  if ('workspaceId' in context && context.workspaceId) {
    scopes.push({
      kind: 'workspace',
      workspaceId: context.workspaceId,
    })
    if ('requirementId' in context && context.requirementId) {
      scopes.push({
        kind: 'requirement',
        workspaceId: context.workspaceId,
        requirementId: context.requirementId,
      })
    }
  }
  return scopes
}

function recoverySurfaceMatches(selection: {
  catalogDigest: string
  definitions: ToolDefinition[]
  skills: SkillDefinition[]
  modelFacing: RunModelFacingSnapshot
}, snapshot: AgentRunSnapshot): boolean {
  return selection.catalogDigest === snapshot.capabilityCatalogDigest &&
    capabilityBindingDigest(selection.definitions, selection.skills) === snapshot.capabilityBindingDigest &&
    isDeepStrictEqual(selection.modelFacing, snapshot.modelFacing)
}

function capabilityBindingDigest(
  tools: readonly ToolDefinition[],
  skills: readonly SkillDefinition[],
): string {
  return digest(
    [
      ...tools.map(({ id, version, definitionDigest }) => ({
        kind: 'tool',
        id,
        version,
        definitionDigest,
      })),
      ...skills.map(({ id, version, definitionDigest }) => ({
        kind: 'skill',
        id,
        version,
        definitionDigest,
      })),
    ].sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.id.localeCompare(right.id) ||
        left.version.localeCompare(right.version),
    ),
  )
}

function permissionSnapshotDigest(context: RunContext): string {
  return digest({
    ...('conversationId' in context
      ? { conversationId: context.conversationId }
      : {}),
    ...('workspaceId' in context && context.workspaceId
      ? { workspaceId: context.workspaceId }
      : {}),
    ...('folderPath' in context && context.folderPath
      ? { folderPath: context.folderPath }
      : {}),
    ...('requirementId' in context
      ? { requirementId: context.requirementId }
      : {}),
    ...('nodeId' in context ? { nodeId: context.nodeId } : {}),
    ...('nodeRunId' in context && context.nodeRunId
      ? { nodeRunId: context.nodeRunId }
      : {}),
    ...('scheduleRunId' in context && context.scheduleRunId
      ? { scheduleRunId: context.scheduleRunId }
      : {}),
  })
}

function resolveConversationReasoning(
  context: RunContext,
  model?: ModelExecutionConfig,
): ReasoningDecision | undefined {
  if (
    !('conversationId' in context) ||
    !context.requestedReasoning ||
    ('requirementId' in context && Boolean(context.requirementId))
  ) {
    return undefined
  }
  const brief = context.processing?.executionBrief
  const lastUserMessage = [...context.messages]
    .reverse()
    .find(({ role }) => role === 'user')
  const decision = routeConversationReasoning(
    {
      messageLength: lastUserMessage?.content.length ?? 0,
      intent: context.processing?.semanticUnderstanding?.intent ?? 'unknown',
      entityKinds: brief?.entities.map(({ kind }) => kind) ?? [],
      constraintCount: brief?.constraints.length ?? 0,
      acceptanceCriteriaCount: brief?.acceptanceCriteria.length ?? 0,
      riskLevel: brief?.riskLevel ?? 'low',
      toolRequired:
        brief?.entities.some(
          ({ kind }) => kind === 'file' || kind === 'capability',
        ) ?? false,
      historicalFailureCount: context.historicalFailureCount ?? 0,
    },
    context.requestedReasoning,
  )
  return resolveProviderReasoning(decision, model?.reasoningSupported !== false)
}

function skillPermissionDecisions(skill: SkillDefinition) {
  if (skill.runtime.kind !== 'executable') return []
  return [
    ...skill.runtime.capabilities.map((capability) => ({
      capability,
      allowed: true,
    })),
    ...skill.runtime.connectorServices.map((service) => ({
      capability: 'connector.use' as const,
      service,
      allowed: true,
    })),
  ]
}

function lifecycleStatusForEvent(
  event: AiRunEvent,
): AgentRunLifecycleStatus | undefined {
  switch (event.type) {
    case 'run.started':
    case 'run.progress':
    case 'answer.delta':
    case 'tool.call.requested':
    case 'tool.call.completed':
    case 'tool.call.failed':
    case 'artifact.ready':
    case 'heartbeat':
      return 'running'
    case 'tool.call.permission_required':
      return 'waiting_permission'
    case 'run.completed':
      return 'completed'
    case 'run.failed':
      return 'failed'
    case 'run.cancelled':
      return 'cancelled'
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Agent Runtime operation failed'
}

function idempotencyKey(runId: string, callId: string): string {
  return `model:${createHash('sha256')
    .update(`${runId}:${callId}`)
    .digest('hex')}`
}
