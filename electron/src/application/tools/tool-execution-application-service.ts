import { randomUUID } from 'node:crypto'
import { createApprovalProfileSnapshot, type ApprovalProfileSnapshot } from '../../../../domain/approval-profile'
import Ajv2020 from 'ajv/dist/2020.js'
import type {
  ToolCatalogItem,
  ToolCatalogState
} from '../../../../domain/tool-catalog'
import type {
  ToolDefinition,
  ToolDefinitionReference
} from '../../../../domain/tool-definition'
import type { ToolExecutionState } from '../../../../domain/tool-execution'
import type { ToolPolicySnapshot } from '../../../../domain/tool-policy'
import type { CapabilityScope } from '../../../../domain/capability'
import type {
  BoundScopeAuthorization,
  PermissionGrant
} from '../../../../domain/capability-permission'
import {
  authorizeToolEffects,
  type ToolAuthorizationDecision,
  type ToolEffect
} from '../../../../domain/tool-authorization'
import {
  cloneJsonObject,
  type JsonObject
} from '../../../../domain/tool-protocol-validation'
import type {
  AdapterEffectPlan,
  AdapterExecutionResult,
  AdapterPreparation,
  PreparedToolInvocation,
  ResolvedToolBinding,
  ToolConnectorGrant
} from './tool-adapter'
import type { ToolAdapterRegistry } from './tool-adapter-registry'
import type { ToolEventStore } from './tool-event-store'
import type { ToolOutboxMessage } from './tool-outbox'
import type { ToolOutboxDispatcher } from './tool-outbox-dispatcher'
import type { ToolProjectionRunner } from './tool-projection-runner'
import type { ToolProjectionStore } from './tool-projection-store'
import type {
  PermissionDecisionCommand,
  ReusableToolPermissionView,
  ToolPermissionRequestProjection
} from '../../../../shared/tool-permissions'
import type { AiRunToolResult } from '../../../../domain/ai-run'
import type {
  PendingToolInvocationCheckpointStore
} from './pending-tool-invocation-checkpoint-store'
import {
  isRecord,
  toolExecutionDigest,
  toolExecutionRecord,
  toolRequestedBy,
  toolRuntimeContext
} from './tool-execution-support'
import type { ToolExecutionArtifactSnapshot } from '../conversation/conversation-generated-artifacts'
import {
  projectModelFacingToolCatalog,
  isAssistantRuntimeControl,
  resolveModelFacingFacadeInvocation
} from './tool-model-facing-projection'
import { directorySearchOutput, directoryDescribeOutput } from './tool-directory'
import { ToolPermissionReuse } from './tool-permission-reuse'
import { runtimeControlEffects } from './runtime-control-effects'

export type ToolExecutionCommand = {
  definition: ToolDefinitionReference
  triggerSource:
    | 'user'
    | 'model'
    | 'workflow'
    | 'schedule'
    | 'skill'
    | 'hook'
  context: {
    scope:
      | { kind: 'requirement'; requirementId: string }
      | { kind: 'space'; workspaceId: string }
      | { kind: 'conversation'; conversationId: string }
    workspaceId?: string
    folderPath?: string
    requirementId?: string
    conversationId?: string
    nodeRunId?: string
    scheduleRunId?: string
    toolCallId?: string
    parentExecutionId?: string
    skillExecutionId?: string
    capabilityScopes?: CapabilityScope[]
    toolPolicyDigest?: string
  }
  input: Record<string, unknown>
  connectorBindings?: unknown[]
}

export type ToolExecutionRecord = {
  id: string
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  output?: Record<string, unknown>
  error?: { code: string; message: string }
  finishedAt?: number
}

export type PrepareToolExecutionResult =
  | {
      outcome: 'ready'
      permissionRequests: []
      preview?: JsonObject
    }
  | {
      outcome: 'permission_required'
      executionId: string
      permissionRequests: JsonObject[]
    }
  | { outcome: 'permission_denied'; permissionRequests: JsonObject[] }

export type ExecuteToolExecutionResult =
  | Exclude<PrepareToolExecutionResult, { outcome: 'ready' }>
  | { outcome: 'executed'; execution: ToolExecutionRecord }

type ResolvedRuntimeInvocation = {
  command: ToolExecutionCommand
  definition: ToolDefinition
  binding: ResolvedToolBinding
  invocation: PreparedToolInvocation
  parentExecutionId?: string
}

type RuntimeInvocation = ResolvedRuntimeInvocation & {
  effects: ToolEffect[]
  effectsDigest: string
  authorization: ToolAuthorizationDecision
  boundScopes: BoundScopeAuthorization[]
  permissionFingerprint: string
  approvalProfile: ApprovalProfileSnapshot
  modelFacingFacade?: ToolFacadeDispatchMetadata
  modelFacingDirectory?: ToolDirectoryDispatchMetadata
}

type ToolFacadeDispatchMetadata = {
  id: string
  name: string
  version: string
  definitionDigest: string
  action: string
  resolvedPrimitiveToolId: string
}

type ToolDirectoryDispatchMetadata = {
  id: 'tool_call'
  requestedToolId: string
  resolvedToolId: string
}

type AssistantRuntimeDependencies = {
  requestUserInput?: (
    input: JsonObject,
    context: ToolExecutionCommand['context']
  ) => Promise<JsonObject>
  resolveCredential?: (
    input: JsonObject,
    context: ToolExecutionCommand['context']
  ) => Promise<JsonObject>
  runAgentCommand?: (
    toolId: string,
    input: JsonObject,
    context: ToolExecutionCommand['context'],
    requestId: string,
    signal?: AbortSignal
  ) => Promise<JsonObject>
  runCapabilityCommand?: (
    input: JsonObject,
    context: ToolExecutionCommand['context'],
    requestId: string
  ) => Promise<JsonObject>
  runGatewayCommand?: (
    input: JsonObject,
    context: ToolExecutionCommand['context'],
    requestId: string
  ) => Promise<JsonObject>
  runAutomationCommand?: (
    input: JsonObject,
    context: ToolExecutionCommand['context'],
    requestId: string
  ) => Promise<JsonObject>
  runMediaCommand?: (
    input: JsonObject,
    context: ToolExecutionCommand['context'],
    requestId: string,
    signal?: AbortSignal
  ) => Promise<JsonObject>
}

type ExecutableToolInvocation = {
  command: ToolExecutionCommand
  definition: ToolDefinition
  modelFacingFacade?: ToolFacadeDispatchMetadata
  modelFacingDirectory?: ToolDirectoryDispatchMetadata
}

type Dependencies = {
  events: ToolEventStore
  projections: ToolProjectionStore
  projectionRunner: ToolProjectionRunner
  adapters: ToolAdapterRegistry
  pendingCheckpoints: PendingToolInvocationCheckpointStore
  dispatcher: Pick<ToolOutboxDispatcher, 'dispatchBatch'>
  onPermissionChanged?: () => Promise<void> | void
  aiRuns?: {
    suspendToolCall(
      runId: string,
      suspension: {
        callId: string
        requestId: string
        toolExecutionId: string
      }
    ): Promise<void>
    submitToolResult(runId: string, result: AiRunToolResult): Promise<void>
  }
  generatedArtifacts?: {
    beforeToolExecution(input: {
      runId?: string
      toolName: string
      arguments: JsonObject
      scopeRoots: readonly string[]
    }): Promise<ToolExecutionArtifactSnapshot>
    afterToolExecution(input: {
      runId?: string
      toolName: string
      arguments: JsonObject
      scopeRoots: readonly string[]
      snapshot?: ToolExecutionArtifactSnapshot
      output?: JsonObject
    }): Promise<void>
  }
  pluginHooks?: {
    dispatch(
      event: {
        id: string
        event: 'tool.completed'
        payload: JsonObject
      },
      context: ToolExecutionCommand['context']
    ): Promise<unknown>
  }
  resolveScopeRoots(command: ToolExecutionCommand): Promise<string[]>
  resolveBoundScopes?: (
    command: ToolExecutionCommand,
    roots: string[]
  ) => Promise<BoundScopeAuthorization[]>
  listPermissionGrants?: (
    command: ToolExecutionCommand
  ) => Promise<PermissionGrant[]>
  resolveConnectorGrants?: (
    command: ToolExecutionCommand
  ) => Promise<ToolConnectorGrant[]>
  resolveDefinition?: (
    reference: ToolDefinitionReference,
    command: ToolExecutionCommand
  ) => Promise<ToolDefinition | undefined>
  assistantRuntime?: AssistantRuntimeDependencies
  mediaRuntime?: {
    definitions(catalog: ToolCatalogState): Promise<ToolDefinition[]>
  }
  /** Main-owned lookup. Never accept authorization supplied by Renderer/model. */
  resolveRunPolicy?: (command: ToolExecutionCommand) => Promise<ToolPolicySnapshot | undefined>
  resolveApprovalProfile?: (command: ToolExecutionCommand) => Promise<ApprovalProfileSnapshot>
  now?: () => number
  createId?: () => string
}

class ToolArgumentValidationError extends Error {
  readonly name = 'ToolArgumentValidationError'

  constructor(message: string) {
    super(message)
    this.code = 'tool_arguments_invalid'
  }

  readonly code: 'tool_arguments_invalid'
}

const PROJECTION_BATCH_SIZE = 1_000

export class ToolExecutionApplicationService {
  private readonly permissionReuse: ToolPermissionReuse
  private readonly now: () => number
  private readonly createId: () => string
  private readonly pending = new Map<string, RuntimeInvocation>()
  private readonly active = new Map<
    string,
    {
      runtime: RuntimeInvocation
      controller: AbortController
    }
  >()

  constructor(private readonly dependencies: Dependencies) {
    this.permissionReuse = new ToolPermissionReuse(dependencies.events)
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
  }

  async prepare(
    command: ToolExecutionCommand
  ): Promise<PrepareToolExecutionResult> {
    const policy = await this.dependencies.resolveRunPolicy?.(command)
    if (!policyAllows(policy, command.definition)) {
      return { outcome: 'permission_denied', permissionRequests: [] }
    }
    const executable = await this.resolveExecutableInvocation(command, policy)
    if (!policyAllows(policy, referenceOf(executable.definition))) {
      return { outcome: 'permission_denied', permissionRequests: [] }
    }
    const resolved = await this.prepareRuntime(
      executable.command,
      executable.definition,
      'tool-preview',
      'attempt-preview',
      'preview'
    )
    const preparation: AdapterPreparation = runtimeControlEffects(resolved.definition, resolved.invocation.arguments)
      ? { outcome: 'ready' as const } : await this.dependencies.adapters.prepare(resolved.binding, resolved.invocation)
    if (preparation.outcome !== 'ready') {
      return { outcome: 'permission_denied', permissionRequests: [] }
    }
    const runtime = await this.planAndAuthorize(
      executable.command,
      resolved,
      executable.modelFacingFacade,
      executable.modelFacingDirectory
    )
    if (runtime.authorization.outcome === 'ask') {
      return {
        outcome: 'permission_required',
        executionId: 'tool-preview',
        permissionRequests: runtime.authorization.requests.map((request) =>
          cloneJsonObject(request as unknown as JsonObject, 'Permission request')
        )
      }
    }
    if (runtime.authorization.outcome === 'denied') {
      return { outcome: 'permission_denied', permissionRequests: [] }
    }
    return {
      outcome: 'ready',
      permissionRequests: [],
      ...(preparation.preview ? { preview: preparation.preview } : {})
    }
  }

  async execute(
    command: ToolExecutionCommand & {
      idempotencyKey: string
    },
    signal?: AbortSignal
  ): Promise<ExecuteToolExecutionResult> {
    const policy = await this.dependencies.resolveRunPolicy?.(command)
    if (policy) command = {
      ...command, context: { ...command.context, toolPolicyDigest: policy.digest },
    }
    if (!policyAllows(policy, command.definition)) {
      return this.recordPolicyDenial(command)
    }
    const directoryControl = await this.executeDirectoryControlTool(command, policy)
    if (directoryControl) return directoryControl
    const runtimeControl = await this.executeAssistantRuntimeTool(command, signal)
    if (runtimeControl) return runtimeControl
    const mediaControl = await this.executeMediaProviderTool(command, signal)
    if (mediaControl) return mediaControl

    const executable = await this.resolveExecutableInvocation(command, policy)
    if (!policyAllows(policy, referenceOf(executable.definition))) {
      return this.recordPolicyDenial(command)
    }

    const executionId = this.createId()
    const attemptId = this.createId()
    const resolved = await this.prepareRuntime(
      executable.command,
      executable.definition,
      executionId,
      attemptId,
      command.idempotencyKey
    )
    const preparation: AdapterPreparation = runtimeControlEffects(resolved.definition, resolved.invocation.arguments)
      ? { outcome: 'ready' as const } : await this.dependencies.adapters.prepare(resolved.binding, resolved.invocation)
    if (preparation.outcome !== 'ready') {
      return { outcome: 'permission_denied', permissionRequests: [] }
    }
    const runtime = await this.planAndAuthorize(
      executable.command,
      resolved,
      executable.modelFacingFacade,
      executable.modelFacingDirectory
    )

    const commandId = this.createId()
    const occurredAt = this.now()
    const metadata = this.metadata(executable.command, commandId, occurredAt)
    const initialEvents = [
      this.event('tool.invocation_requested', {
        executionId,
        approvalProfileId: runtime.approvalProfile.id,
        ...(policy ? { toolPolicyDigest: policy.digest } : {}),
        definition: {
          id: executable.definition.id,
          version: executable.definition.version,
          definitionDigest: executable.definition.definitionDigest
        },
        ...(executable.modelFacingFacade
          ? { modelFacingFacade: executable.modelFacingFacade }
          : {}),
        ...(executable.modelFacingDirectory
          ? { modelFacingDirectory: executable.modelFacingDirectory }
          : {}),
        context: toolRuntimeContext(executable.command, commandId),
        requestedBy: toolRequestedBy(executable.command)
      }, metadata),
      this.event('tool.arguments_validated', {
        argumentsDigest: toolExecutionDigest(executable.command.input)
      }, metadata),
      this.event('tool.binding_resolved', {
        adapterKind: runtime.binding.adapterKind,
        bindingId: runtime.binding.bindingId,
        ...(preparation.sandboxAudit
          ? { sandboxAudit: preparation.sandboxAudit }
          : {})
      }, metadata),
      this.event('tool.effects_planned', {
        effectsDigest: runtime.effectsDigest,
        effectCount: runtime.effects.length
      }, metadata)
    ]
    const authorization = runtime.authorization
    const permissionRequired = authorization.outcome === 'ask'
    let requestId: string | undefined
    let dispatchId: string | undefined
    const authorizationEvents: Parameters<
      ToolEventStore['append']
    >[0]['events'] = []
    const outbox: Parameters<ToolEventStore['append']>[0]['outbox'] = []
    if (authorization.outcome === 'ask') {
      requestId = this.createId()
      authorizationEvents.push(
        this.event(
          'tool.permission_requested',
          {
            requestIds: [requestId],
            requestId,
            executionId,
            runId: command.context.parentExecutionId ?? executionId,
            callId: command.context.toolCallId ?? command.idempotencyKey,
            toolId: executable.definition.id,
            toolName: executable.definition.name,
            status: 'requested',
            reason: authorization.reason,
            risk: executable.definition.risk,
            approvalProfileId: runtime.approvalProfile.id,
            approvalProfileDigest: runtime.approvalProfile.digest,
            effectiveRisk: authorization.effectiveRisk,
            maxGrant: authorization.maxGrant,
            ...(permissionScope(command).workspaceId ? { workspaceId: permissionScope(command).workspaceId! } : {}),
            ...(permissionScope(command).requirementId ? { requirementId: permissionScope(command).requirementId! } : {}),
            effectsDigest: runtime.effectsDigest,
            argumentsDigest: toolExecutionDigest(executable.command.input),
            bindingRevision: maximumBindingRevision(runtime.boundScopes),
            requestRevision: 1,
            requestedAt: occurredAt,
            expiresAt: occurredAt + 15 * 60_000,
            requests: authorization.requests as unknown as JsonObject[]
          },
          metadata
        )
      )
      outbox.push({
        id: this.createId(),
        topic: 'ai_run.suspend_tool_call',
        messageKey: executionId,
        payload: {
          executionId,
          requestId,
          runId: command.context.parentExecutionId ?? executionId,
          callId: command.context.toolCallId ?? command.idempotencyKey
        },
        headers: { correlationId: metadata.correlationId },
        availableAt: occurredAt
      })
    } else if (authorization.outcome === 'authorized') {
      dispatchId = this.createId()
      authorizationEvents.push(
        this.event(
          'tool.authorization_auto_granted',
          {
            effectiveRisk: authorization.effectiveRisk,
            authorizationIds:
              authorization.source === 'bound_scope'
                ? authorization.authorizationIds
                : [],
            grantIds:
              authorization.source === 'explicit_grant'
                ? authorization.grantIds
                : []
          },
          metadata
        ),
        this.event(
          'tool.dispatch_enqueued',
          { dispatchId },
          metadata
        )
      )
      outbox.push({
        id: dispatchId,
        topic: 'tool.dispatch',
        messageKey: executionId,
        payload: { executionId },
        headers: { correlationId: metadata.correlationId },
        availableAt: occurredAt
      })
    } else {
      authorizationEvents.push(
        this.event(
          'tool.failed',
          {
            failedAt: occurredAt,
            error: {
              code: authorization.code,
              message: authorization.message,
              retryable: false
            }
          },
          metadata
        )
      )
    }
    if (permissionRequired) {
      await this.dependencies.pendingCheckpoints.save({
        schemaVersion: 1,
        executionId,
        runtime: serializePendingRuntime(runtime),
        savedAt: occurredAt
      })
    }
    let append: Awaited<ReturnType<ToolEventStore['append']>>
    try {
      append = await this.dependencies.events.append({
        streamId: executionId,
        streamType: 'tool_execution',
        expectedSequence: 0,
        command: {
          idempotencyKey: command.idempotencyKey,
          fingerprint: toolExecutionDigest({
            definition: executable.command.definition,
            context: executable.command.context,
            input: executable.command.input
          }),
          result: { executionId }
        },
        events: [...initialEvents, ...authorizationEvents],
        outbox
      })
    } catch (error) {
      if (permissionRequired) {
        await this.dependencies.pendingCheckpoints.delete(executionId)
      }
      throw error
    }
    if (permissionRequired && append.status !== 'appended') {
      await this.dependencies.pendingCheckpoints.delete(executionId)
    }
    if (append.status === 'idempotency_conflict') {
      throw new Error('Tool execution idempotency key conflicts')
    }
    if (append.status === 'sequence_conflict') {
      throw new Error('Tool execution stream conflicted')
    }
    const confirmedExecutionId =
      typeof append.result.executionId === 'string'
        ? append.result.executionId
        : executionId
    if (append.status === 'appended') {
      this.pending.set(executionId, runtime)
    }

    await this.catchUpProjection()
    if (append.status === 'appended' && (permissionRequired || dispatchId)) {
      await this.drainOutbox()
      await this.catchUpProjection()
    }
    if (append.status === 'appended' && permissionRequired) {
      await this.dependencies.onPermissionChanged?.()
    }
    if (permissionRequired) {
      return {
        outcome: 'permission_required',
        executionId: confirmedExecutionId,
        permissionRequests: [
          {
            id: requestId!,
            executionId: confirmedExecutionId,
            status: 'requested',
            reason: runtime.authorization.outcome === 'ask'
              ? runtime.authorization.reason
              : 'out_of_scope'
          }
        ]
      }
    }
    const state = await this.dependencies.projections.getExecution(
      confirmedExecutionId
    )
    if (!state) throw new Error('Tool execution projection is unavailable')
    return { outcome: 'executed', execution: toolExecutionRecord(state) }
  }

  async dispatch(message: ToolOutboxMessage): Promise<void> {
    if (message.topic === 'ai_run.suspend_tool_call') {
      const { runId, callId, requestId, executionId } = message.payload
      if (
        typeof runId !== 'string' ||
        typeof callId !== 'string' ||
        typeof requestId !== 'string' ||
        typeof executionId !== 'string' ||
        !this.dependencies.aiRuns
      ) {
        throw new Error('AI Run Tool suspension message is invalid')
      }
      await this.dependencies.aiRuns.suspendToolCall(runId, {
        callId,
        requestId,
        toolExecutionId: executionId
      })
      return
    }
    if (message.topic === 'ai_run.submit_tool_result') {
      const result = terminalToolResult(message.payload)
      const runId = message.payload.runId
      if (typeof runId !== 'string' || !this.dependencies.aiRuns) {
        throw new Error('AI Run Tool result message is invalid')
      }
      await this.dependencies.aiRuns.submitToolResult(runId, result)
      return
    }
    if (message.topic === 'plugin_hook.dispatch') {
      if (!this.dependencies.pluginHooks) return
      const eventId = message.payload.eventId
      const context = message.payload.context
      const payload = message.payload.payload
      if (
        typeof eventId !== 'string' ||
        !isRecord(context) ||
        !isRecord(payload)
      ) {
        throw new Error('Plugin Hook dispatch message is invalid')
      }
      await this.dependencies.pluginHooks.dispatch(
        {
          id: eventId,
          event: 'tool.completed',
          payload
        },
        context as ToolExecutionCommand['context']
      )
      return
    }
    if (
      message.topic !== 'tool.dispatch' ||
      typeof message.payload.executionId !== 'string'
    ) {
      throw new Error('Tool dispatch message is invalid')
    }
    const executionId = message.payload.executionId
    const runtime = this.pending.get(executionId)
    if (!runtime) {
      await this.interruptUnavailable(executionId, message.id)
      return
    }
    if (!await this.pendingPolicyValid(runtime)) {
      await this.interruptUnavailable(executionId, message.id, 'tool_policy_changed')
      return
    }
    const controller = new AbortController()
    this.active.set(executionId, { runtime, controller })
    const attempt = runtime.invocation.attempt
    await this.appendExecutionEvents(
      executionId,
      `${message.id}:started`,
      [
        {
          eventType: 'tool.attempt_started',
          payload: { attempt, startedAt: this.now() }
        }
      ],
      'system',
      'realmflow'
    )
    let result: Awaited<ReturnType<ToolAdapterRegistry['execute']>>
    const toolName = toolNameForRuntime(runtime)
    const artifactSnapshot =
      await this.dependencies.generatedArtifacts?.beforeToolExecution({
        runId: runtime.command.context.parentExecutionId,
        toolName,
        arguments: runtime.invocation.arguments,
        scopeRoots: runtime.invocation.scopeRoots
      })
    try {
      result = runtimeControlEffects(runtime.definition, runtime.invocation.arguments)
        ? await this.dispatchRuntimeControl(runtime, controller.signal)
        : await this.dependencies.adapters.execute(
        runtime.binding,
        runtime.invocation,
        {
          emit: async (event) => {
            const mapped =
              event.type === 'progress'
                ? {
                    eventType: 'tool.progress_reported',
                      eventSchemaVersion: 2,
                    payload: {
                      attempt,
                      completed: event.completed,
                      total: event.total,
                      ...(event.message ? { message: event.message } : {})
                    }
                  }
                : event.type === 'output'
                  ? {
                      eventType: 'tool.output_appended',
                      payload: { attempt, byteLength: event.byteLength }
                    }
                  : {
                      eventType: 'tool.artifact_produced',
                      payload: { attempt, ...event.artifact }
                    }
            await this.appendExecutionEvents(
              executionId,
              `${message.id}:event:${this.createId()}`,
              [mapped],
              'system',
              'realmflow'
            )
          }
        },
        controller.signal
      )
    } finally {
      this.active.delete(executionId)
    }
    if (result.outcome === 'succeeded') {
      let valid = false
      try {
        valid = new Ajv2020({ strict: true, allErrors: false })
          .compile(runtime.definition.outputSchema)(result.output) === true
      } catch {
        // Invalid declarations fail closed without exposing schema or output values.
      }
      if (!valid) result = {
        outcome: 'failed',
        error: {
          code: 'tool_output_invalid',
          message: 'Tool output does not satisfy its declared schema',
          retryable: false,
        },
        metrics: result.metrics,
      }
    }
    if (result.outcome === 'succeeded') {
      await this.dependencies.generatedArtifacts?.afterToolExecution({
        runId: runtime.command.context.parentExecutionId,
        toolName,
        arguments: runtime.invocation.arguments,
        scopeRoots: runtime.invocation.scopeRoots,
        snapshot: artifactSnapshot,
        output: result.output
      })
    }
    await this.completeDispatch(
      executionId,
      message.id,
      attempt,
      result,
      runtime
    )
    this.pending.delete(executionId)
    await this.dependencies.pendingCheckpoints.delete(executionId)
  }

  async resolvePermission(
    command: PermissionDecisionCommand
  ): Promise<ToolPermissionRequestProjection> {
    await this.catchUpProjection()
    const request = await this.dependencies.projections.getPermission(
      command.requestId
    )
    if (!request) throw new Error('Tool permission request was not found')
    if (request.status !== 'requested') {
      if (request.decision === command.decision) return request
      throw new Error('permission_decision_conflict')
    }
    if (request.requestRevision !== command.expectedRevision) {
      throw new Error('permission_revision_conflict')
    }
    if (request.expiresAt <= this.now()) {
      throw new Error('permission_request_expired')
    }
    const runtime = this.pending.get(request.executionId)
    if (!runtime) {
      await this.interruptUnavailable(
        request.executionId,
        `permission:${request.id}:runtime-missing`
      )
      await this.catchUpProjection()
      throw new Error('permission_runtime_state_lost')
    }
    if (runtime.authorization.outcome === 'ask' &&
        command.decision !== 'deny' && command.decision !== 'allow_once' &&
        (runtime.authorization.maxGrant === 'once' ||
         runtime.authorization.maxGrant === 'session' && command.decision !== 'allow_session' ||
         runtime.authorization.maxGrant === 'space' && command.decision === 'allow_always')) {
      throw new Error('permission_grant_ceiling_exceeded')
    }
    if (command.decision !== 'deny' && !await this.pendingPolicyValid(runtime)) {
      await this.interruptUnavailable(
        request.executionId, `permission:${request.id}:policy-changed`, 'tool_policy_changed'
      )
      await this.catchUpProjection()
      await this.drainOutbox()
      throw new Error('tool_policy_changed')
    }
    const planned = await this.planRuntimeEffects(runtime)
    if (
      planned.outcome !== 'planned' ||
      toolExecutionDigest(planned.effects) !== runtime.effectsDigest
    ) {
      throw new Error('permission_context_changed')
    }
    const currentScopes =
      (await this.dependencies.resolveBoundScopes?.(
        runtime.command,
        runtime.invocation.scopeRoots
      )) ?? runtime.boundScopes
    if (
      currentScopes.some(({ status }) => status !== 'active') ||
      maximumBindingRevision(currentScopes) !== request.bindingRevision
    ) {
      throw new Error('permission_context_changed')
    }
    const policy = await this.dependencies.resolveRunPolicy?.(runtime.command)
    if (this.permissionReuse.fingerprint({
      command: runtime.command, definition: runtime.definition,
      bindingId: runtime.binding.bindingId, effects: planned.effects,
      boundScopes: currentScopes, policyDigest: policy?.digest,
      approvalProfileDigest: runtime.approvalProfile.digest,
    }) !== runtime.permissionFingerprint) throw new Error('permission_context_changed')

    const stream = await this.dependencies.events.loadStream(
      request.executionId
    )
    const at = this.now()
    const commandId = this.createId()
    const metadata = {
      correlationId: stream[0]?.metadata.correlationId ?? commandId,
      causationId: stream.at(-1)?.eventId ?? commandId,
      commandId,
      actorType: 'local_user' as const,
      actorId: 'local-user',
      occurredAt: at
    }
    const nextRevision = request.requestRevision + 1
    const reusableGrant = command.decision !== 'deny' && command.decision !== 'allow_once'
      ? this.permissionReuse.createGrant(runtime.permissionFingerprint,
          permissionSessionId(runtime.command), command.decision, permissionScope(runtime.command),
          { toolId: runtime.definition.id, toolName: runtime.definition.name,
            effectiveRisk: request.effectiveRisk, approvalProfileId: runtime.approvalProfile.id,
            grantedAt: at, resources: request.resources })
      : undefined
    const decisionEvent = this.event(
      'tool.permission_decided',
      {
        requestId: request.id,
        requestRevision: nextRevision,
        outcome:
          command.decision !== 'deny' ? 'authorized' : 'denied',
        decision: command.decision,
        grantIds: [],
        ...(reusableGrant ? { reusableGrant } : {}),
        resolvedAt: at
      },
      metadata
    )
    const dispatchId =
      command.decision !== 'deny' ? this.createId() : undefined
    const events =
      command.decision !== 'deny'
        ? [
            decisionEvent,
            this.event(
              'tool.dispatch_enqueued',
              { dispatchId: dispatchId! },
              metadata
            )
          ]
        : [
            decisionEvent,
            this.event(
              'tool.failed',
              {
                error: {
                  code: 'permission_denied',
                  message: 'Tool permission was denied',
                  retryable: false
                },
                failedAt: at
              },
              metadata
            )
          ]
    const outbox: Parameters<ToolEventStore['append']>[0]['outbox'] =
      command.decision !== 'deny'
        ? [
            {
              id: dispatchId!,
              topic: 'tool.dispatch',
              messageKey: request.executionId,
              payload: { executionId: request.executionId },
              headers: { correlationId: metadata.correlationId },
              availableAt: at
            }
          ]
        : [
            {
              id: this.createId(),
              topic: 'ai_run.submit_tool_result',
              messageKey: request.executionId,
              payload: {
                executionId: request.executionId,
                runId: request.runId,
                callId: request.callId,
                status: 'failed',
                errorCode: 'permission_denied',
                message: 'Tool permission was denied',
                toolExecutionId: request.executionId
              },
              headers: { correlationId: metadata.correlationId },
              availableAt: at
            }
          ]
    const append = await this.dependencies.events.append({
      streamId: request.executionId,
      streamType: 'tool_execution',
      expectedSequence: stream.length,
      command: {
        idempotencyKey: `permission:${request.id}:${command.decision}`,
        fingerprint: toolExecutionDigest(command),
        result: { requestId: request.id, decision: command.decision }
      },
      events,
      outbox
    })
    if (append.status === 'sequence_conflict') {
      throw new Error('permission_revision_conflict')
    }
    if (append.status === 'idempotency_conflict') {
      throw new Error('permission_decision_conflict')
    }
    if (command.decision === 'deny') {
      this.pending.delete(request.executionId)
      await this.dependencies.pendingCheckpoints.delete(request.executionId)
    }
    await this.catchUpProjection()
    if (append.status === 'appended') {
      await this.drainOutbox()
      await this.catchUpProjection()
      await this.dependencies.onPermissionChanged?.()
    }
    const updated = await this.dependencies.projections.getPermission(request.id)
    if (!updated) throw new Error('Tool permission projection is unavailable')
    return updated
  }

  async cancel(executionId: string): Promise<boolean> {
    const active = this.active.get(executionId)
    if (!active) return false
    try {
      await this.dependencies.adapters.cancel(
        active.runtime.binding,
        executionId
      )
    } catch {
      // The local abort below remains authoritative when remote cleanup fails.
    } finally {
      active.controller.abort()
    }
    return true
  }

  async cancelByParent(parentExecutionId: string): Promise<number> {
    const executionIds = [...this.active.entries()]
      .filter(
        ([, active]) =>
          active.runtime.parentExecutionId === parentExecutionId
      )
      .map(([executionId]) => executionId)
    const results = await Promise.all(
      executionIds.map((executionId) => this.cancel(executionId))
    )
    return results.filter(Boolean).length
  }

  async list(query: {
    nodeRunId: string
    limit: number
  }): Promise<ToolExecutionRecord[]> {
    const executionIds = await this.scanExecutionIds((event) =>
      isRecord(event.payload.context) &&
      event.payload.context.nodeRunId === query.nodeRunId
    )
    const states = await Promise.all(
      executionIds.map((id) => this.dependencies.projections.getExecution(id))
    )
    return states
      .filter((state): state is ToolExecutionState => Boolean(state))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, Math.max(0, query.limit))
      .map(toolExecutionRecord)
  }

  async recoverInterrupted(): Promise<number> {
    await this.catchUpProjection()
    const executionIds = await this.scanExecutionIds(() => true)
    let recovered = 0
    for (const executionId of executionIds) {
      const state = await this.dependencies.projections.getExecution(
        executionId
      )
      if (
        !state ||
        !['queued', 'running', 'retry_wait', 'cancelling'].includes(
          state.status
        )
      ) {
        continue
      }
      const at = this.now()
      await this.appendExecutionEvents(
        executionId,
        `recovery:${executionId}:${state.revision}`,
        [
          {
            eventType: 'tool.recovery_started',
            payload: { recoveredAt: at }
          },
          {
            eventType: 'tool.interrupted',
            payload: {
              interruptedAt: at,
              error: {
                code: 'tool_restart_interrupted',
                message:
                  'Tool execution was interrupted by an application restart',
                retryable: false
              }
            }
          }
        ],
        'recovery',
        'realmflow'
      )
      recovered += 1
    }
    if (recovered > 0) await this.catchUpProjection()
    return recovered
  }

  async restorePendingPermissions(): Promise<number> {
    await this.catchUpProjection()
    const requests = await this.dependencies.projections.listPendingPermissions()
    let restored = 0
    for (const request of requests) {
      const checkpoint = await this.dependencies.pendingCheckpoints.load(
        request.executionId
      )
      if (!checkpoint) continue
      const restoredRuntime = parsePendingRuntime(checkpoint.runtime)
      if (
        restoredRuntime.invocation.executionId !== request.executionId ||
        restoredRuntime.invocation.idempotencyKey.length === 0 ||
        restoredRuntime.effectsDigest !== request.effectsDigest ||
        toolExecutionDigest(restoredRuntime.invocation.arguments) !==
          request.argumentsDigest
      ) {
        continue
      }
      if (!await this.pendingPolicyValid(restoredRuntime)) {
        await this.interruptUnavailable(
          request.executionId, `restore:${request.id}:policy-changed`, 'tool_policy_changed',
          restoredRuntime,
        )
        continue
      }
      const definition = await this.resolveDefinition(
        restoredRuntime.command.definition,
        restoredRuntime.command
      )
      const binding = (await this.prepareRuntime(restoredRuntime.command, definition, request.executionId,
        restoredRuntime.invocation.attemptId, restoredRuntime.invocation.idempotencyKey)).binding
      const preparation = runtimeControlEffects(definition, restoredRuntime.invocation.arguments)
        ? { outcome: 'ready' as const } : await this.dependencies.adapters.prepare(binding, restoredRuntime.invocation)
      if (preparation.outcome !== 'ready') continue
      this.pending.set(request.executionId, {
        ...restoredRuntime,
        definition,
        binding
      })
      restored += 1
    }
    await this.catchUpProjection()
    return restored
  }

  async listReusablePermissions(): Promise<ReusableToolPermissionView[]> {
    const grants = await this.permissionReuse.listGrants()
    return grants.map(({ fingerprint: _fingerprint, appSessionId: _appSessionId, ...view }) =>
      view as unknown as ReusableToolPermissionView)
  }

  async revokeReusablePermission(grantId: string): Promise<void> {
    await this.permissionReuse.revoke(grantId)
    await this.dependencies.onPermissionChanged?.()
  }

  private async pendingPolicyValid(runtime: PersistedPendingRuntime): Promise<boolean> {
    if (runtime.effects.some(effect => effect.kind === 'browser.page.read' || effect.kind === 'browser.page.control')) {
      const definition = await this.resolveDefinition(runtime.command.definition, runtime.command)
      const binding = await this.dependencies.adapters.resolve(definition, toolRuntimeContext(runtime.command, runtime.invocation.executionId))
      const plan = await this.dependencies.adapters.planEffects(binding, runtime.invocation)
      if (plan.outcome !== 'planned' || toolExecutionDigest(plan.effects) !== runtime.effectsDigest) return false
    }
    const stream = await this.dependencies.events.loadStream(runtime.invocation.executionId)
    const grantIds = stream.flatMap(event =>
      event.eventType === 'tool.authorization_auto_granted' && Array.isArray(event.payload.grantIds)
        ? event.payload.grantIds.filter((id): id is string => typeof id === 'string')
        : event.eventType === 'tool.permission_decided' && event.payload.reusableGrant
          ? [event.eventId] : [])
    if (grantIds.length) {
      const active = new Set((await this.permissionReuse.listGrants()).map(grant => grant.id))
      if (grantIds.some(id => !active.has(id))) return false
    }
    const policy = await this.dependencies.resolveRunPolicy?.(runtime.command)
    const profile = await this.dependencies.resolveApprovalProfile?.(runtime.command)
    const digest = runtime.command.context.toolPolicyDigest
    return (!profile || profile.digest === runtime.approvalProfile.digest) &&
      (!digest || policy?.digest === digest) &&
      policyAllows(policy, runtime.command.definition)
  }

  private async resolveDefinition(
    reference: ToolDefinitionReference,
    command: ToolExecutionCommand
  ): Promise<ToolDefinition> {
    if (reference.kind !== 'tool') {
      throw new Error('Skill execution requires the model Tool Loop')
    }
    const catalog = await this.dependencies.projections.getCatalog()
    const control = findAssistantRuntimeControlTool(catalog, reference)
    if (control) return control.definition
    const media = (await this.dependencies.mediaRuntime?.definitions(catalog))?.find(candidate =>
      candidate.id === reference.id && candidate.version === reference.version && candidate.definitionDigest === reference.digest)
    if (media) return media
    const item = catalog.tools.find(
      (candidate) =>
        candidate.id === reference.id &&
        candidate.version === reference.version
    )
    if (
      item &&
      item.definitionDigest === reference.digest &&
      item.status === 'enabled'
    ) {
      return item.definition
    }
    const external = await this.dependencies.resolveDefinition?.(
      reference,
      command
    )
    if (
      !external ||
      external.id !== reference.id ||
      external.version !== reference.version ||
      external.definitionDigest !== reference.digest
    ) {
      throw new Error('Tool definition is unavailable')
    }
    return external
  }

  private async resolveExecutableInvocation(
    command: ToolExecutionCommand,
    policy?: ToolPolicySnapshot,
  ): Promise<ExecutableToolInvocation> {
    if (command.definition.kind !== 'tool') {
      throw new Error('Skill execution requires the model Tool Loop')
    }
    const catalog = await this.directoryCatalog(command, policy)
    const control = findAssistantRuntimeControlTool(catalog, command.definition)
    if (control) {
      this.validateArguments(control.definition, command.input)
      return { command, definition: control.definition }
    }
    const media = (await this.dependencies.mediaRuntime?.definitions(catalog))?.find(candidate =>
      candidate.id === command.definition.id && candidate.version === command.definition.version &&
      candidate.definitionDigest === command.definition.digest)
    if (media) {
      this.validateArguments(media, command.input)
      return { command, definition: media }
    }
    const item = catalog.tools.find(
      (candidate) =>
        candidate.id === command.definition.id &&
        candidate.version === command.definition.version
    )
    if (
      item &&
      item.definitionDigest === command.definition.digest &&
      item.status === 'enabled'
    ) {
      this.validateArguments(item.definition, command.input)
      return { command, definition: item.definition }
    }

    const directoryToolCall = this.resolveDirectoryToolCall(catalog, command)
    if (directoryToolCall) return directoryToolCall

    const facade = resolveModelFacingFacadeInvocation(
      catalog,
      command.definition,
      command.input
    )
    if (facade) {
      this.validateArguments(facade.facadeDefinition, command.input)
      this.validateArguments(
        facade.primitiveDefinition,
        facade.primitiveInput
      )
      return {
        command: {
          ...command,
          definition: {
            kind: 'tool',
            id: facade.primitiveDefinition.id,
            version: facade.primitiveDefinition.version,
            digest: facade.primitiveDefinition.definitionDigest
          },
          input: facade.primitiveInput
        },
        definition: facade.primitiveDefinition,
        modelFacingFacade: facade.metadata
      }
    }

    const external = await this.dependencies.resolveDefinition?.(
      command.definition,
      command
    )
    if (
      !external ||
      external.id !== command.definition.id ||
      external.version !== command.definition.version ||
      external.definitionDigest !== command.definition.digest
    ) {
      throw new Error('Tool definition is unavailable')
    }
    this.validateArguments(external, command.input)
    return { command, definition: external }
  }

  private validateArguments(
    definition: ToolDefinition,
    input: Record<string, unknown>
  ): void {
    const validate = new Ajv2020({
      strict: true,
      allErrors: true
    }).compile(definition.inputSchema)
    if (!validate(input)) {
      throw new ToolArgumentValidationError(
        `Tool arguments invalid: ${formatSchemaErrors(validate.errors)}`
      )
    }
  }

  private async prepareRuntime(
    command: ToolExecutionCommand,
    definition: ToolDefinition,
    executionId: string,
    attemptId: string,
    idempotencyKey: string
  ): Promise<ResolvedRuntimeInvocation> {
    const context = toolRuntimeContext(command, executionId)
    const binding: ResolvedToolBinding = runtimeControlEffects(definition, command.input as JsonObject)
      ? { definitionId: definition.id, definitionVersion: definition.version,
          definitionDigest: definition.definitionDigest, adapterKind: 'builtin',
          bindingId: `runtime-${definition.id}-${definition.definitionDigest}`, opaqueRuntimeHandle: {} }
      : await this.dependencies.adapters.resolve(definition, context)
    return {
      command: {
        ...command,
        context: { ...command.context },
        input: cloneJsonObject(command.input, 'Tool arguments')
      },
      definition,
      binding,
      ...(command.context.parentExecutionId
        ? { parentExecutionId: command.context.parentExecutionId }
        : {}),
      invocation: {
        executionId,
        idempotencyKey,
        attemptId,
        attempt: 1,
        requestedBy: toolRequestedBy(command),
        arguments: cloneJsonObject(command.input, 'Tool arguments'),
        scopeRoots: await this.dependencies.resolveScopeRoots(command),
        connectorGrants:
          await this.dependencies.resolveConnectorGrants?.(command) ?? []
      }
    }
  }

  private async planRuntimeEffects(runtime: ResolvedRuntimeInvocation): Promise<AdapterEffectPlan> {
    const effects = runtimeControlEffects(runtime.definition, runtime.invocation.arguments)
    return effects ? { outcome: 'planned', effects }
      : this.dependencies.adapters.planEffects(runtime.binding, runtime.invocation)
  }

  private async dispatchRuntimeControl(runtime: RuntimeInvocation, signal: AbortSignal): Promise<AdapterExecutionResult> {
    const command = { ...runtime.command, idempotencyKey: runtime.invocation.idempotencyKey }
    try {
      const response = runtime.definition.executor.kind === 'builtin' &&
        runtime.definition.executor.handler === 'media-provider-runtime'
        ? await this.executeMediaProviderTool(command, signal, true)
        : await this.executeAssistantRuntimeTool(command, signal, true)
      if (response?.outcome === 'executed' && response.execution.status === 'succeeded') {
        const output = response.execution.output ?? {}
        return { outcome: 'succeeded', output: output as JsonObject,
          metrics: { durationMs: 0, outputBytes: Buffer.byteLength(JSON.stringify(output)) } }
      }
      return { outcome: 'failed', error: { code: 'runtime_execution_failed',
        message: 'Runtime operation failed', retryable: false }, metrics: { durationMs: 0, outputBytes: 0 } }
    } catch {
      return { outcome: 'failed', error: { code: 'runtime_execution_failed',
        message: 'Runtime operation failed', retryable: false }, metrics: { durationMs: 0, outputBytes: 0 } }
    }
  }

  private async planAndAuthorize(
    command: ToolExecutionCommand,
    runtime: ResolvedRuntimeInvocation,
    modelFacingFacade?: ToolFacadeDispatchMetadata,
    modelFacingDirectory?: ToolDirectoryDispatchMetadata
  ): Promise<RuntimeInvocation> {
    const planned = await this.planRuntimeEffects(runtime)
    if (planned.outcome !== 'planned') {
      throw Object.assign(new Error(planned.error.message), {
        code: planned.error.code
      })
    }
    const boundScopes =
      (await this.dependencies.resolveBoundScopes?.(
        command,
        runtime.invocation.scopeRoots
      )) ?? defaultBoundScopes(command, runtime.invocation.scopeRoots, this.now())
    const approvalProfile = await this.dependencies.resolveApprovalProfile?.(command)
      ?? createApprovalProfileSnapshot()
    let authorization = authorizeToolEffects({
      approvalProfile: approvalProfile.id,
      effects: planned.effects,
      risk: runtime.definition.risk,
      context: permissionContext(command),
      appSessionId:
        command.context.conversationId ??
        command.context.nodeRunId ??
        command.context.scheduleRunId ??
        'realmflow',
      boundScopes,
      explicitGrants:
        (await this.dependencies.listPermissionGrants?.(command)) ?? []
    })
    const policy = await this.dependencies.resolveRunPolicy?.(command)
    const permissionFingerprint = this.permissionReuse.fingerprint({
      command, definition: runtime.definition, bindingId: runtime.binding.bindingId,
      effects: planned.effects, boundScopes, policyDigest: policy?.digest,
      approvalProfileDigest: approvalProfile.digest,
    })
    if (authorization.outcome === 'ask' && authorization.maxGrant !== 'once') {
      const grantId = await this.permissionReuse.matchingGrant(
        permissionFingerprint, permissionSessionId(command), authorization.maxGrant, permissionScope(command),
      )
      if (grantId) authorization = {
        outcome: 'authorized', source: 'explicit_grant', grantIds: [grantId],
        effectiveRisk: authorization.effectiveRisk
      }
    }
    return {
      ...runtime,
      effects: planned.effects,
      effectsDigest: toolExecutionDigest(planned.effects),
      authorization,
      boundScopes,
      permissionFingerprint,
      approvalProfile,
      ...(modelFacingFacade ? { modelFacingFacade } : {}),
      ...(modelFacingDirectory ? { modelFacingDirectory } : {})
    }
  }

  private resolveDirectoryToolCall(
    catalog: ToolCatalogState,
    command: ToolExecutionCommand
  ): ExecutableToolInvocation | undefined {
    const control = findDirectoryControlTool(catalog, command.definition)
    if (!control || control.id !== 'tool_call') return undefined
    this.validateArguments(control.definition, command.input)
    const requestedToolId = typeof command.input.id === 'string'
      ? command.input.id
      : ''
    const args = command.input.args
    if (!isRecord(args)) {
      throw new ToolArgumentValidationError('Tool arguments invalid: args must be object')
    }
    const target = findDirectoryCatalogTool(catalog, requestedToolId)
    if (!target) {
      throw new Error(`Directory Tool is unavailable: ${requestedToolId}`)
    }
    if (
      target.modelFacing?.kind !== 'primitive' ||
      target.modelFacing.visibility !== 'directory_only'
    ) {
      return undefined
    }
    this.validateArguments(target.definition, args)
    return {
      command: {
        ...command,
        definition: {
          kind: 'tool',
          id: target.definition.id,
          version: target.definition.version,
          digest: target.definition.definitionDigest
        },
        input: args
      },
      definition: target.definition,
      modelFacingDirectory: {
        id: 'tool_call',
        requestedToolId,
        resolvedToolId: target.definition.id
      }
    }
  }

  private async executeDirectoryControlTool(
    command: ToolExecutionCommand & { idempotencyKey: string },
    policy?: ToolPolicySnapshot
  ): Promise<ExecuteToolExecutionResult | undefined> {
    const catalog = await this.directoryCatalog(command, policy)
    const control = findDirectoryControlTool(catalog, command.definition)
    if (!control) return undefined
    this.validateArguments(control.definition, command.input)

    if (control.id === 'tool_call') {
      const requestedToolId = typeof command.input.id === 'string'
        ? command.input.id
        : ''
      const target = findDirectoryCatalogTool(catalog, requestedToolId)
      if (
        target?.modelFacing?.kind === 'primitive' &&
        target.modelFacing.visibility === 'directory_only'
      ) {
        return undefined
      }
      return this.recordDirectoryControlResult({
        command,
        definition: control.definition,
        status: 'failed',
        error: {
          code: 'direct_tool_call_required',
          message: `Tool ${requestedToolId} is visible in directory mode; call it directly instead of using tool_call.`
        }
      })
    }

    const authorizedCatalog = {
      ...catalog,
      tools: catalog.tools.filter(({ definition }) => policyAllows(policy, referenceOf(definition))),
    }
    const output =
      control.id === 'tool_search'
        ? directorySearchOutput(authorizedCatalog, command.input)
        : directoryDescribeOutput(authorizedCatalog, command.input)
    return this.recordDirectoryControlResult({
      command,
      definition: control.definition,
      status: 'succeeded',
      output
    })
  }

  private async directoryCatalog(
    command: ToolExecutionCommand, policy?: ToolPolicySnapshot,
  ): Promise<ToolCatalogState> {
    const catalog = await this.dependencies.projections.getCatalog()
    if (!policy || !['tool_search', 'tool_describe', 'tool_call'].includes(command.definition.id)) return catalog
    const tools = [...catalog.tools]
    for (const grant of policy.grants) {
      if (command.definition.id !== 'tool_search' && grant.id !== command.input.id) continue
      if (tools.some((item) => item.id === grant.id && item.version === grant.version &&
        item.definitionDigest === grant.digest)) continue
      const definition = await this.dependencies.resolveDefinition?.(grant, command)
      if (!definition || definition.id !== grant.id || definition.version !== grant.version ||
        definition.definitionDigest !== grant.digest) continue
      tools.push({
        kind: 'tool', id: definition.id, version: definition.version,
        definitionDigest: definition.definitionDigest, definition,
        enabledPreference: true, status: 'enabled', dependencyIssues: [], revision: 0, updatedAt: 0,
      })
    }
    // Prefer the exact run grant when multiple catalog versions share an ID.
    tools.sort((a, b) => Number(policyAllows(policy, referenceOf(b.definition))) -
      Number(policyAllows(policy, referenceOf(a.definition))))
    return { ...catalog, tools }
  }

  private async executeAssistantRuntimeTool(
    command: ToolExecutionCommand & { idempotencyKey: string },
    signal?: AbortSignal,
    approved = false
  ): Promise<ExecuteToolExecutionResult | undefined> {
    const catalog = await this.dependencies.projections.getCatalog()
    const control = findAssistantRuntimeControlTool(catalog, command.definition)
    if (!control) return undefined
    if (!approved && runtimeControlEffects(control.definition, command.input as JsonObject)) return undefined
    this.validateArguments(control.definition, command.input)
    const runtimeInput = cloneJsonObject(command.input, 'Assistant runtime input')

    if (control.id === 'ask_user') {
      return this.recordAssistantRuntimeSuspension({
        command,
        definition: control.definition,
        input: runtimeInput
      })
    }

    const dependency = this.dependencies.assistantRuntime
    const output =
      control.id === 'secrets'
        ? sanitizeCredentialOutput(
            await requireRuntimeDependency(
              dependency?.resolveCredential,
              'secrets'
            )(runtimeInput, command.context)
          )
        : control.id === 'capabilities'
              ? sanitizeRuntimeOutput(
                  await requireRuntimeDependency(
                    dependency?.runCapabilityCommand,
                    'capabilities'
                  )(runtimeInput, command.context, command.idempotencyKey)
                )
          : control.id === 'gateway'
              ? sanitizeRuntimeOutput(
                  await requireRuntimeDependency(
                    dependency?.runGatewayCommand,
                    'gateway'
                  )(runtimeInput, command.context, command.idempotencyKey)
                )
          : control.id === 'automation'
              ? sanitizeRuntimeOutput(
                  await requireRuntimeDependency(
                    dependency?.runAutomationCommand,
                    'automation'
                  )(runtimeInput, command.context, command.idempotencyKey)
                )
              : control.id === 'subagents' ? undefined
                : (control.id === 'sessions' ? sanitizeSessionsOutput : sanitizeRuntimeOutput)(
                  await requireRuntimeDependency(dependency?.runAgentCommand, control.id)(
                    control.id, runtimeInput, command.context, command.idempotencyKey, signal
                  )
                )
    if (!output) return undefined
    if (approved) return { outcome: 'executed', execution: {
      id: command.idempotencyKey, status: 'succeeded', output
    } }
    return this.recordRuntimeControlResult({
      command,
      definition: control.definition,
      status: 'succeeded',
      output,
      resultSummary: `${control.definition.name} completed`
    })
  }

  private async executeMediaProviderTool(
    command: ToolExecutionCommand & { idempotencyKey: string },
    signal?: AbortSignal,
    approved = false
  ): Promise<ExecuteToolExecutionResult | undefined> {
    if (!approved) return undefined
    if (!this.dependencies.mediaRuntime) return undefined
    const catalog = await this.dependencies.projections.getCatalog()
    const definition = (
      await this.dependencies.mediaRuntime.definitions(catalog)
    ).find(
      (candidate) =>
        candidate.id === command.definition.id &&
        candidate.version === command.definition.version &&
        candidate.definitionDigest === command.definition.digest &&
        candidate.executor.kind === 'builtin' &&
        candidate.executor.handler === 'media-provider-runtime'
    )
    if (!definition) return undefined
    this.validateArguments(definition, command.input)
    const scopeRoots =
      await this.dependencies.resolveScopeRoots(command)
    const runtimeInput: JsonObject = {
      definition: {
        kind: command.definition.kind,
        id: command.definition.id,
        version: command.definition.version,
        digest: command.definition.digest
      },
      input: cloneJsonObject(command.input, 'Media input'),
      scopeRoots: [...scopeRoots]
    }
    let response: JsonObject
    try {
      response = await requireRuntimeDependency(
        this.dependencies.assistantRuntime?.runMediaCommand,
        'media'
      )(
        runtimeInput,
        command.context,
        command.idempotencyKey,
        signal ?? new AbortController().signal
      )
    } catch (error) {
      const code =
        error instanceof Error &&
        /^media_[a-z_]+$/.test(error.message)
          ? error.message
          : 'media_execution_failed'
      if (approved) throw new Error(code)
      return this.recordDirectoryControlResult({
        command,
        definition,
        status: 'failed',
        error: {
          code,
          message: 'Media generation failed'
        }
      })
    }
    if (!isRecord(response.output)) {
      if (approved) throw new Error('media_output_invalid')
      return this.recordDirectoryControlResult({
        command,
        definition,
        status: 'failed',
        error: {
          code: 'media_output_invalid',
          message: 'Media generation returned an invalid output'
        }
      })
    }
    const output = cloneJsonObject(response.output, 'Media output')
    const artifact = isRecord(response.artifact)
      ? cloneJsonObject(response.artifact, 'Media artifact')
      : undefined
    if (approved) return { outcome: 'executed', execution: {
      id: command.idempotencyKey, status: 'succeeded', output
    } }
    return this.recordDirectoryControlResult({
      command,
      definition,
      status: 'succeeded',
      output,
      artifact
    })
  }

  private async recordAssistantRuntimeSuspension(input: {
    command: ToolExecutionCommand & { idempotencyKey: string }
    definition: ToolDefinition
    input: JsonObject
  }): Promise<ExecuteToolExecutionResult> {
    const executionId = this.createId()
    const requestId = this.createId()
    const commandId = this.createId()
    const at = this.now()
    const metadata = this.metadata(input.command, commandId, at)
    const outbox: Parameters<ToolEventStore['append']>[0]['outbox'] = []
    const runId = input.command.context.parentExecutionId
    const callId = input.command.context.toolCallId ?? input.command.idempotencyKey
    if (runId && callId) {
      outbox.push({
        id: this.createId(),
        topic: 'ai_run.suspend_tool_call',
        messageKey: executionId,
        payload: { executionId, requestId, runId, callId },
        headers: { correlationId: metadata.correlationId },
        availableAt: at
      })
    }
    const append = await this.dependencies.events.append({
      streamId: executionId,
      streamType: 'tool_execution',
      expectedSequence: 0,
      command: {
        idempotencyKey: input.command.idempotencyKey,
        fingerprint: toolExecutionDigest({
          definition: input.command.definition,
          context: input.command.context,
          input: input.command.input
        }),
        result: { executionId, requestId }
      },
      events: [
        this.event('tool.invocation_requested', {
          executionId,
          ...(input.command.context.toolPolicyDigest
            ? { toolPolicyDigest: input.command.context.toolPolicyDigest } : {}),
          definition: {
            id: input.definition.id,
            version: input.definition.version,
            definitionDigest: input.definition.definitionDigest
          },
          context: toolRuntimeContext(input.command, commandId),
          requestedBy: toolRequestedBy(input.command)
        }, metadata),
        this.event('tool.arguments_validated', {
          argumentsDigest: toolExecutionDigest(input.command.input)
        }, metadata),
        this.event('tool.permission_requested', {
          executionId,
          requestId,
          requestIds: [requestId],
          runId: runId ?? executionId,
          callId,
          toolId: input.definition.id,
          toolName: input.definition.name,
          status: 'requested',
          reason: 'system',
          risk: input.definition.risk,
          approvalProfileId: createApprovalProfileSnapshot().id,
          approvalProfileDigest: createApprovalProfileSnapshot().digest,
          effectiveRisk: 'L3',
          maxGrant: 'once',
          effectsDigest: toolExecutionDigest([]),
          argumentsDigest: toolExecutionDigest(input.command.input),
          bindingRevision: 0,
          requestRevision: 1,
          prompt: input.input.prompt,
          responseType: input.input.responseType ?? 'text',
          choices: Array.isArray(input.input.choices)
            ? input.input.choices
            : [],
          requestedAt: at,
          expiresAt: at + 24 * 60 * 60_000,
          requests: [
            {
              resource: {
                kind: 'application',
                displayName: 'User input'
              }
            }
          ]
        }, metadata)
      ],
      outbox
    })
    if (append.status === 'idempotency_conflict') {
      throw new Error('Tool execution idempotency key conflicts')
    }
    if (append.status === 'sequence_conflict') {
      throw new Error('Tool execution stream conflicted')
    }
    const confirmedExecutionId =
      typeof append.result.executionId === 'string'
        ? append.result.executionId
        : executionId
    const confirmedRequestId =
      typeof append.result.requestId === 'string'
        ? append.result.requestId
        : requestId
    if (append.status === 'appended') {
      await this.dependencies.assistantRuntime?.requestUserInput?.(
        {
          ...input.input,
          requestId: confirmedRequestId,
          toolExecutionId: confirmedExecutionId
        },
        input.command.context
      )
      if (outbox.length > 0) await this.drainOutbox()
    }
    await this.catchUpProjection()
    return {
      outcome: 'permission_required',
      executionId: confirmedExecutionId,
      permissionRequests: [
        {
          id: confirmedRequestId,
          executionId: confirmedExecutionId,
          status: 'requested',
          reason: 'system'
        }
      ]
    }
  }

  private async recordDirectoryControlResult(input: {
    command: ToolExecutionCommand & { idempotencyKey: string }
    definition: ToolDefinition
    status: 'succeeded' | 'failed'
    output?: JsonObject
    error?: { code: string; message: string }
    policyDenied?: boolean
    artifact?: JsonObject
  }): Promise<ExecuteToolExecutionResult> {
    const executionId = this.createId()
    const commandId = this.createId()
    const dispatchId = this.createId()
    const attempt = 1
    const at = this.now()
    const metadata = this.metadata(input.command, commandId, at)
    const effectsDigest = toolExecutionDigest([])
    const resultEvents = input.status === 'succeeded'
      ? [
          ...(input.artifact
            ? [
                this.event(
                  'tool.artifact_produced',
                  { attempt, ...input.artifact },
                  metadata
                )
              ]
            : []),
          this.event(
            'tool.attempt_succeeded',
            {
              attempt,
              output: input.output ?? {},
              metrics: { durationMs: 0, outputBytes: outputByteLength(input.output ?? {}) },
              finishedAt: at
            },
            metadata
          ),
          this.event('tool.completed', { completedAt: at }, metadata)
        ]
      : [
          ...(!input.policyDenied ? [
          this.event(
            'tool.attempt_failed',
            {
              attempt,
              error: {
                ...(input.error ?? {
                  code: 'directory_tool_failed',
                  message: 'Directory control Tool failed'
                }),
                retryable: false
              },
              metrics: { durationMs: 0, outputBytes: 0 },
              finishedAt: at
            },
            metadata
          ),
          ] : []),
          this.event(
            'tool.failed',
            {
              failedAt: at,
              error: {
                ...(input.error ?? {
                  code: 'directory_tool_failed',
                  message: 'Directory control Tool failed'
                }),
                retryable: false
              }
            },
            metadata
          )
        ]
    const append = await this.dependencies.events.append({
      streamId: executionId,
      streamType: 'tool_execution',
      expectedSequence: 0,
      command: {
        idempotencyKey: input.command.idempotencyKey,
        fingerprint: toolExecutionDigest({
          definition: input.command.definition,
          context: input.command.context,
          input: input.command.input
        }),
        result: { executionId }
      },
      events: [
        this.event('tool.invocation_requested', {
          executionId,
          ...(input.command.context.toolPolicyDigest
            ? { toolPolicyDigest: input.command.context.toolPolicyDigest } : {}),
          definition: {
            id: input.definition.id,
            version: input.definition.version,
            definitionDigest: input.definition.definitionDigest
          },
          context: toolRuntimeContext(input.command, commandId),
          requestedBy: toolRequestedBy(input.command)
        }, metadata),
        ...(!input.policyDenied ? [this.event('tool.arguments_validated', {
          argumentsDigest: toolExecutionDigest(input.command.input)
        }, metadata),
        this.event('tool.binding_resolved', {
          adapterKind: 'builtin',
          bindingId: 'directory-control'
        }, metadata),
        this.event('tool.effects_planned', {
          effectsDigest,
          effectCount: 0
        }, metadata),
        this.event('tool.authorization_auto_granted', {
          authorizationIds: [],
          grantIds: []
        }, metadata),
        this.event('tool.dispatch_enqueued', { dispatchId }, metadata),
        this.event('tool.attempt_started', { attempt, startedAt: at }, metadata)] : []),
        ...resultEvents
      ],
      // Synchronous results are returned to the Coordinator, including replay.
      // Only suspended invocations use the asynchronous result outbox.
      outbox: []
    })
    if (append.status === 'idempotency_conflict') {
      throw new Error('Tool execution idempotency key conflicts')
    }
    if (append.status === 'sequence_conflict') {
      throw new Error('Tool execution stream conflicted')
    }
    const confirmedExecutionId =
      typeof append.result.executionId === 'string'
        ? append.result.executionId
        : executionId
    await this.catchUpProjection()
    const state = await this.dependencies.projections.getExecution(confirmedExecutionId)
    if (!state) throw new Error('Tool execution projection is unavailable')
    return {
      outcome: 'executed', execution: toolExecutionRecord(state)
    }
  }

  private async recordPolicyDenial(
    command: ToolExecutionCommand & { idempotencyKey: string }
  ): Promise<ExecuteToolExecutionResult> {
    const catalog = await this.dependencies.projections.getCatalog()
    const candidates = [
      ...projectModelFacingToolCatalog(catalog, 'facade').tools,
      ...projectModelFacingToolCatalog(catalog, 'directory').tools,
    ]
    const definition = candidates.find((item) =>
      item.id === command.definition.id && item.version === command.definition.version &&
      item.definitionDigest === command.definition.digest,
    )?.definition ?? await this.dependencies.resolveDefinition?.(command.definition, command)
    if (!definition) throw new Error('Tool definition is unavailable')
    return this.recordDirectoryControlResult({
      command, definition, status: 'failed', policyDenied: true,
      error: { code: 'tool_policy_denied', message: 'Tool is denied by the effective run policy' },
    })
  }

  private recordRuntimeControlResult(input: {
    command: ToolExecutionCommand & { idempotencyKey: string }
    definition: ToolDefinition
    status: 'succeeded' | 'failed'
    output?: JsonObject
    error?: { code: string; message: string }
    resultSummary: string
  }): Promise<ExecuteToolExecutionResult> {
    return this.recordDirectoryControlResult(input)
  }

  private async completeDispatch(
    executionId: string,
    dispatchId: string,
    attempt: number,
    result: Awaited<ReturnType<ToolAdapterRegistry['execute']>>,
    runtime: RuntimeInvocation
  ): Promise<void> {
    const at = this.now()
    if (result.outcome === 'succeeded') {
      const artifacts = (result.artifacts ?? []).map((artifact) => ({
        eventType: 'tool.artifact_produced',
        payload: { attempt, ...artifact }
      }))
      await this.appendExecutionEvents(
        executionId,
        `${dispatchId}:succeeded`,
        [
          ...artifacts,
          {
            eventType: 'tool.attempt_succeeded',
            payload: {
              attempt,
              output: result.output,
              metrics: result.metrics,
              finishedAt: at
            }
          },
          {
            eventType: 'tool.completed',
            payload: { completedAt: at }
          }
        ],
        'system',
        'realmflow',
        [
          ...this.terminalResultOutbox(runtime, executionId, {
            callId: runtime.command.context.toolCallId!,
            status: 'completed',
            output: result.output,
            toolExecutionId: executionId,
            resultSummary: 'Tool execution completed'
          }),
          ...this.pluginHookOutbox(
            runtime,
            executionId,
            result.output
          )
        ]
      )
      return
    }
    if (result.outcome === 'cancelled') {
      await this.appendExecutionEvents(
        executionId,
        `${dispatchId}:cancelled`,
        [
          {
            eventType: 'tool.cancellation_requested',
            payload: { requestedAt: at }
          },
          {
            eventType: 'tool.cancelled',
            payload: { cancelledAt: at, metrics: result.metrics }
          }
        ],
        'system',
        'realmflow',
        this.terminalFailureOutbox(runtime, executionId, {
          code: 'tool_cancelled',
          message: 'Tool execution was cancelled'
        })
      )
      return
    }
    if (result.outcome === 'interrupted') {
      await this.appendExecutionEvents(
        executionId,
        `${dispatchId}:interrupted`,
        [
          {
            eventType: 'tool.interrupted',
            payload: {
              interruptedAt: at,
              ...(result.error ? { error: result.error } : {})
            }
          }
        ],
        'system',
        'realmflow',
        this.terminalFailureOutbox(
          runtime,
          executionId,
          result.error ?? {
            code: 'tool_interrupted',
            message: 'Tool execution was interrupted'
          }
        )
      )
      return
    }
    const error = result.error ?? {
      code: 'tool_execution_failed',
      message: 'Tool execution failed',
      retryable: false
    }
    await this.appendExecutionEvents(
      executionId,
      `${dispatchId}:failed`,
      [
        {
          eventType: 'tool.attempt_failed',
          payload: {
            attempt,
            error,
            metrics: result.metrics,
            finishedAt: at
          }
        },
        {
          eventType: 'tool.failed',
          payload: { error, failedAt: at }
        }
      ],
      'system',
      'realmflow',
      this.terminalFailureOutbox(runtime, executionId, error)
    )
  }

  private terminalResultOutbox(
    runtime: PersistedPendingRuntime,
    executionId: string,
    result: AiRunToolResult
  ): Parameters<ToolEventStore['append']>[0]['outbox'] {
    const runId = runtime.command.context.parentExecutionId
    const callId = runtime.command.context.toolCallId
    if (
      runtime.authorization.outcome !== 'ask' ||
      !runId ||
      !callId
    ) {
      return []
    }
    return [{
      id: this.createId(),
      topic: 'ai_run.submit_tool_result',
      messageKey: executionId,
      payload: { runId, ...result },
      headers: {},
      availableAt: this.now()
    }]
  }

  private pluginHookOutbox(
    runtime: RuntimeInvocation,
    executionId: string,
    output: JsonObject
  ): Parameters<ToolEventStore['append']>[0]['outbox'] {
    if (
      !this.dependencies.pluginHooks ||
      runtime.command.triggerSource === 'hook'
    ) {
      return []
    }
    return [{
      id: this.createId(),
      topic: 'plugin_hook.dispatch',
      messageKey: executionId,
      payload: {
        eventId: `tool-completed:${executionId}`,
        context: runtime.command.context,
        payload: {
          executionId,
          toolId: runtime.definition.id,
          output
        }
      },
      headers: {},
      availableAt: this.now()
    }]
  }

  private terminalFailureOutbox(
    runtime: PersistedPendingRuntime,
    executionId: string,
    error: { code: string; message: string }
  ): Parameters<ToolEventStore['append']>[0]['outbox'] {
    return this.terminalResultOutbox(runtime, executionId, {
      callId: runtime.command.context.toolCallId ?? runtime.invocation.idempotencyKey,
      status: 'failed',
      errorCode: error.code,
      message: error.message,
      toolExecutionId: executionId
    })
  }

  private async interruptUnavailable(
    executionId: string,
    dispatchId: string,
    code = 'tool_runtime_state_lost',
    runtime: PersistedPendingRuntime | undefined = this.pending.get(executionId),
  ): Promise<void> {
    const message = code === 'tool_policy_changed'
      ? 'Tool policy changed before dispatch'
      : 'Tool runtime state was lost before dispatch'
    await this.appendExecutionEvents(
      executionId,
      `${dispatchId}:unavailable`,
      [
        {
          eventType: 'tool.interrupted',
          payload: {
            interruptedAt: this.now(),
            error: {
              code,
              message,
              retryable: false
            }
          }
        }
      ],
      'recovery',
      'realmflow',
      runtime ? this.terminalFailureOutbox(runtime, executionId, { code, message }) : [],
    )
    this.pending.delete(executionId)
    await this.dependencies.pendingCheckpoints.delete(executionId)
  }

  private async appendExecutionEvents(
    executionId: string,
    idempotencyKey: string,
    events: Array<{
      eventType: string
      eventSchemaVersion?: number
      payload: JsonObject
    }>,
    actorType: 'system' | 'recovery',
    actorId: string,
    outbox: Parameters<ToolEventStore['append']>[0]['outbox'] = []
  ): Promise<void> {
    const stream = await this.dependencies.events.loadStream(executionId)
    const commandId = this.createId()
    const occurredAt = this.now()
    const append = await this.dependencies.events.append({
      streamId: executionId,
      streamType: 'tool_execution',
      expectedSequence: stream.length,
      command: {
        idempotencyKey,
        fingerprint: toolExecutionDigest(events),
        result: { executionId }
      },
      events: events.map((event) => ({
        eventId: this.createId(),
        eventType: event.eventType,
        eventSchemaVersion: event.eventSchemaVersion ?? 1,
        payload: event.payload,
        metadata: {
          correlationId:
            stream[0]?.metadata.correlationId ?? commandId,
          causationId: stream.at(-1)?.eventId ?? commandId,
          commandId,
          actorType,
          actorId,
          occurredAt
        }
      })),
      outbox
    })
    if (append.status === 'idempotency_conflict') {
      throw new Error('Tool execution event idempotency conflicts')
    }
    if (append.status === 'sequence_conflict') {
      throw new Error('Tool execution event sequence conflicts')
    }
  }

  private async drainOutbox(): Promise<void> {
    while ((await this.dependencies.dispatcher.dispatchBatch()).claimed > 0) {
      // Continue until control and follow-up result messages are published.
    }
  }

  private async catchUpProjection(): Promise<void> {
    while (
      await this.dependencies.projectionRunner.runExecutionBatch(
        PROJECTION_BATCH_SIZE
      )
    ) {
      // Continue until confirmed events are queryable.
    }
    while (
      await this.dependencies.projectionRunner.runPermissionBatch(
        PROJECTION_BATCH_SIZE
      )
    ) {
      // Continue until permission requests are queryable.
    }
  }

  private async scanExecutionIds(
    accepts: (
      event: Awaited<ReturnType<ToolEventStore['scan']>>[number]
    ) => boolean
  ): Promise<string[]> {
    const executionIds: string[] = []
    let position = 0
    while (true) {
      const batch = await this.dependencies.events.scan(position, 1_000)
      for (const event of batch) {
        if (
          event.streamType === 'tool_execution' &&
          event.eventType === 'tool.invocation_requested' &&
          accepts(event)
        ) {
          executionIds.push(event.streamId)
        }
      }
      if (batch.length < 1_000) break
      position = batch.at(-1)!.globalPosition
    }
    return executionIds
  }

  private metadata(
    command: ToolExecutionCommand,
    commandId: string,
    occurredAt: number
  ) {
    return {
      correlationId: commandId,
      causationId: commandId,
      commandId,
      actorType: command.triggerSource === 'model'
        ? 'model' as const
        : command.triggerSource === 'user'
          ? 'local_user' as const
          : 'system' as const,
      actorId: toolRequestedBy(command).id,
      occurredAt
    }
  }

  private event(
    eventType: string,
    payload: JsonObject,
    metadata: ReturnType<ToolExecutionApplicationService['metadata']>
  ) {
    return {
      eventId: this.createId(),
      eventType,
      eventSchemaVersion: 1,
      payload,
      metadata
    }
  }
}

function referenceOf(definition: ToolDefinition): ToolDefinitionReference {
  return { kind: 'tool', id: definition.id, version: definition.version, digest: definition.definitionDigest }
}

function policyAllows(policy: ToolPolicySnapshot | undefined, reference: ToolDefinitionReference): boolean {
  return !policy || policy.grants.some((grant) =>
    grant.kind === reference.kind && grant.id === reference.id &&
    grant.version === reference.version && grant.digest === reference.digest,
  )
}

function permissionContext(
  command: ToolExecutionCommand
): {
  sessionId?: string
  requirementId?: string
  workspaceId?: string
} {
  return {
    ...(command.context.conversationId
      ? { sessionId: command.context.conversationId }
      : {}),
    ...(command.context.requirementId
      ? { requirementId: command.context.requirementId }
      : {}),
    ...(command.context.workspaceId
      ? { workspaceId: command.context.workspaceId }
      : {})
  }
}

function permissionSessionId(command: ToolExecutionCommand): string {
  return command.context.conversationId ?? command.context.nodeRunId ??
    command.context.scheduleRunId ??
    (command.context.scope.kind === 'conversation'
      ? command.context.scope.conversationId : 'realmflow')
}

function permissionScope(command: ToolExecutionCommand): { workspaceId?: string; requirementId?: string } {
  return {
    workspaceId: command.context.workspaceId ?? (command.context.scope.kind === 'space'
      ? command.context.scope.workspaceId : undefined),
    requirementId: command.context.requirementId ?? (command.context.scope.kind === 'requirement'
      ? command.context.scope.requirementId : undefined),
  }
}

function toolNameForRuntime(runtime: RuntimeInvocation): string {
  return runtime.definition.executor.kind === 'builtin'
    ? runtime.definition.executor.handler === 'media-provider-runtime' ? runtime.definition.id : runtime.definition.executor.handler
    : runtime.definition.id
}

function defaultBoundScopes(
  command: ToolExecutionCommand,
  roots: string[],
  createdAt: number
): BoundScopeAuthorization[] {
  if (roots.length === 0) return []
  const source: BoundScopeAuthorization['source'] =
    command.context.folderPath
      ? {
          kind: 'folder',
          folderSessionId:
            command.context.conversationId ?? command.context.folderPath
        }
      : command.context.requirementId && command.context.workspaceId
        ? {
            kind: 'requirement',
            requirementId: command.context.requirementId,
            workspaceId: command.context.workspaceId
          }
        : command.context.workspaceId
          ? { kind: 'space', workspaceId: command.context.workspaceId }
          : {
              kind: 'folder',
              folderSessionId:
                command.context.conversationId ?? 'tool-execution'
            }
  return [
    {
      authorizationId: `bound-${toolExecutionDigest({
        source,
        roots
      }).slice(0, 24)}`,
      source,
      roots: roots.map((canonicalPath) => ({
        canonicalPath,
        access: 'read-write' as const
      })),
      bindingRevision: 1,
      status: 'active',
      createdAt
    }
  ]
}

function findDirectoryControlTool(
  catalog: ToolCatalogState,
  reference: ToolDefinitionReference
): ToolCatalogItem | undefined {
  if (
    reference.kind !== 'tool' ||
    !['tool_search', 'tool_describe', 'tool_call'].includes(reference.id)
  ) {
    return undefined
  }
  return projectModelFacingToolCatalog(catalog, 'directory').tools.find(
    (candidate) =>
      candidate.id === reference.id &&
      candidate.version === reference.version &&
      candidate.definitionDigest === reference.digest &&
      candidate.status === 'enabled' &&
      candidate.modelFacing?.kind === 'facade'
  )
}

function findAssistantRuntimeControlTool(
  catalog: ToolCatalogState,
  reference: ToolDefinitionReference
): ToolCatalogItem | undefined {
  if (
    reference.kind !== 'tool' ||
    !isAssistantRuntimeControl(reference.id)
  ) {
    return undefined
  }
  const projected = projectModelFacingToolCatalog(catalog, 'facade').tools.find(
    (candidate) =>
      candidate.id === reference.id &&
      candidate.version === reference.version &&
      candidate.definitionDigest === reference.digest &&
      candidate.status === 'enabled' &&
      candidate.modelFacing?.kind === 'facade'
  )
  return projected
}

function findDirectoryCatalogTool(
  catalog: ToolCatalogState,
  id: string
): ToolCatalogItem | undefined {
  return projectModelFacingToolCatalog(catalog, 'directory').tools.find(
    (candidate) => candidate.id === id && candidate.status === 'enabled'
  )
}

function outputByteLength(output: JsonObject): number {
  return Buffer.byteLength(JSON.stringify(output))
}

function requireRuntimeDependency<T>(
  dependency: T | undefined,
  toolId: string
): T {
  if (!dependency) {
    throw Object.assign(new Error(`Assistant runtime dependency is unavailable: ${toolId}`), {
      code: 'assistant_runtime_unavailable'
    })
  }
  return dependency
}

function sanitizeCredentialOutput(output: JsonObject): JsonObject {
  const credentialHandle = stringProperty(output, 'credentialHandle') ??
    stringProperty(output, 'handle')
  const sanitized: JsonObject = {
    status: stringProperty(output, 'status') ?? 'available'
  }
  if (credentialHandle) sanitized.credentialHandle = credentialHandle
  const name = stringProperty(output, 'name')
  const service = stringProperty(output, 'service')
  if (name) sanitized.name = name
  if (service) sanitized.service = service
  const expiresAt = output.expiresAt
  if (typeof expiresAt === 'number' || typeof expiresAt === 'string') {
    sanitized.expiresAt = expiresAt
  }
  return sanitized
}

function sanitizeSessionsOutput(output: JsonObject): JsonObject {
  if (!Array.isArray(output.sessions)) return sanitizeRuntimeOutput(output)
  return {
    ...sanitizeRuntimeOutput(output),
    sessions: output.sessions
      .filter(isRecord)
      .map((session) => {
        const compact: JsonObject = {}
        for (const key of [
          'id',
          'kind',
          'title',
          'workspaceId',
          'requirementId',
          'nodeRunId',
          'folderPath',
          'createdAt',
          'updatedAt',
          'revision'
        ]) {
          const value = session[key]
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            compact[key] = value
          }
        }
        return compact
      })
  }
}

function sanitizeRuntimeOutput(output: JsonObject): JsonObject {
  const sanitized: JsonObject = {}
  for (const [key, value] of Object.entries(output)) {
    if (isSensitiveRuntimeKey(key)) continue
    if (Array.isArray(value)) {
      sanitized[key] = value
        .map((item) =>
          isRecord(item) ? sanitizeRuntimeOutput(item) : sanitizeRuntimeValue(item)
        )
        .filter((item) => item !== undefined) as JsonObject[]
    } else if (isRecord(value)) {
      sanitized[key] = sanitizeRuntimeOutput(value)
    } else {
      const safe = sanitizeRuntimeValue(value)
      if (safe !== undefined) sanitized[key] = safe
    }
  }
  return sanitized
}

function sanitizeRuntimeValue(value: unknown): JsonObject[keyof JsonObject] | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }
  return undefined
}

function stringProperty(output: JsonObject, key: string): string | undefined {
  const value = output[key]
  return typeof value === 'string' && value ? value : undefined
}

function isSensitiveRuntimeKey(key: string): boolean {
  return /(?:secret|token|password|credential|apiKey|apikey|value)/i.test(key) &&
    key !== 'credentialHandle'
}

function maximumBindingRevision(
  scopes: readonly BoundScopeAuthorization[]
): number {
  return scopes.reduce(
    (maximum, scope) => Math.max(maximum, scope.bindingRevision),
    0
  )
}

type PersistedPendingRuntime = Omit<
  RuntimeInvocation,
  'definition' | 'binding'
>

function serializePendingRuntime(runtime: RuntimeInvocation): JsonObject {
  return cloneJsonObject(
    JSON.parse(
      JSON.stringify({
        command: runtime.command,
        invocation: runtime.invocation,
        parentExecutionId: runtime.parentExecutionId,
        effects: runtime.effects,
        effectsDigest: runtime.effectsDigest,
        authorization: runtime.authorization,
        boundScopes: runtime.boundScopes,
        permissionFingerprint: runtime.permissionFingerprint,
        approvalProfile: runtime.approvalProfile,
      })
    ),
    'pending Tool invocation'
  )
}

function parsePendingRuntime(value: JsonObject): PersistedPendingRuntime {
  if (
    !isRecord(value.command) ||
    !isRecord(value.invocation) ||
    typeof value.invocation.executionId !== 'string' ||
    typeof value.invocation.idempotencyKey !== 'string' ||
    !isRecord(value.invocation.arguments) ||
    !Array.isArray(value.effects) ||
    typeof value.effectsDigest !== 'string' ||
    !isRecord(value.authorization) ||
    value.authorization.outcome !== 'ask' ||
    !Array.isArray(value.boundScopes)
  ) {
    throw new Error('Pending Tool invocation checkpoint is invalid')
  }
  return value as unknown as PersistedPendingRuntime
}

function formatSchemaErrors(
  errors: Array<{
    instancePath?: string
    keyword?: string
    message?: string
    params?: Record<string, unknown>
  }> | null | undefined
): string {
  const details = (errors ?? []).map((error) => {
    if (
      error.keyword === 'additionalProperties' &&
      typeof error.params?.additionalProperty === 'string'
    ) {
      return `unsupported property ${error.params.additionalProperty}`
    }
    if (
      error.keyword === 'required' &&
      typeof error.params?.missingProperty === 'string'
    ) {
      return `missing required property ${error.params.missingProperty}`
    }
    const path = schemaErrorPath(error.instancePath)
    const message = error.message ?? error.keyword ?? 'schema mismatch'
    return path ? `${path} ${message}` : message
  })
  if (details.length === 0) return 'input does not match schema'
  return [...new Set(details)].slice(0, 5).join('; ').slice(0, 500)
}

function schemaErrorPath(instancePath: string | undefined): string {
  if (!instancePath) return ''
  return instancePath
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join('.')
}

function terminalToolResult(payload: JsonObject): AiRunToolResult {
  const callId = payload.callId
  const status = payload.status
  if (typeof callId !== 'string') {
    throw new Error('AI Run Tool result message is invalid')
  }
  if (status === 'completed' && isRecord(payload.output)) {
    return {
      callId,
      status,
      output: cloneJsonObject(payload.output, 'Tool result'),
      ...(typeof payload.toolExecutionId === 'string'
        ? { toolExecutionId: payload.toolExecutionId }
        : {}),
      ...(typeof payload.resultSummary === 'string'
        ? { resultSummary: payload.resultSummary }
        : {})
    }
  }
  if (
    status === 'failed' &&
    typeof payload.errorCode === 'string' &&
    typeof payload.message === 'string'
  ) {
    return {
      callId,
      status,
      errorCode: payload.errorCode,
      message: payload.message,
      ...(typeof payload.toolExecutionId === 'string'
        ? { toolExecutionId: payload.toolExecutionId }
        : {})
    }
  }
  throw new Error('AI Run Tool result message is invalid')
}
