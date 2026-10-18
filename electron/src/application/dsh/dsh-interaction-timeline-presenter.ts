import {
  projectAssistantTurn,
  type AssistantRunEvent,
  type AssistantTurnProjection,
  type ToolCallCategory
} from '../../../../domain/assistant-turn'
import type { DshInteractionRequestRecord } from '../../../../shared/dsh-interaction-contract'
import type { AssistantRunTimelineRepository } from '../ports/business-repositories'
import type { DshInteractionPresenter } from './dsh-interaction-service'

export type DshInteractionTimelinePresenterDependencies = {
  timeline: Pick<
    AssistantRunTimelineRepository,
    'appendAndProject' | 'getSnapshot'
  >
  resolveConversationId(input: {
    record: DshInteractionRequestRecord
    projection: AssistantTurnProjection
  }): Promise<string | undefined> | string | undefined
  publishProjection(input: {
    sessionId: string
    turnId: string
    projection: AssistantTurnProjection
  }): Promise<void> | void
}

export class DshInteractionTimelinePresenter
  implements DshInteractionPresenter
{
  constructor(
    private readonly dependencies: DshInteractionTimelinePresenterDependencies
  ) {}

  async project(record: DshInteractionRequestRecord): Promise<void> {
    if (record.kind !== 'permission_approval') {
      return
    }
    if (record.status === 'pending') {
      await this.projectPendingPermission(record)
      return
    }
    if (
      record.status === 'resolved' &&
      record.response?.kind === 'permission_approval' &&
      record.response.decision === 'deny'
    ) {
      await this.projectDeniedPermission(record)
    }
  }

  private async projectPendingPermission(
    record: Extract<DshInteractionRequestRecord, { kind: 'permission_approval' }>
  ): Promise<void> {
    const current = await this.dependencies.timeline.getSnapshot(record.runId)
    if (!current) return

    const requested = toolCallRequestedEvent(record, current.lastSequence + 1)
    const requestedProjection = projectAssistantTurn(current, requested)
    const requestedAppended = await this.dependencies.timeline.appendAndProject(
      requested,
      requestedProjection
    )

    const permissionRequired = permissionRequiredEvent(
      record,
      requestedProjection.lastSequence + 1
    )
    const finalProjection = projectAssistantTurn(
      requestedProjection,
      permissionRequired
    )
    const permissionAppended =
      await this.dependencies.timeline.appendAndProject(
        permissionRequired,
        finalProjection
      )

    if (!requestedAppended && !permissionAppended) return
    const sessionId = await this.dependencies.resolveConversationId({
      record,
      projection: finalProjection
    })
    if (!sessionId) return
    await this.dependencies.publishProjection({
      sessionId,
      turnId: finalProjection.turnId,
      projection: finalProjection
    })
  }

  private async projectDeniedPermission(
    record: Extract<DshInteractionRequestRecord, { kind: 'permission_approval' }>
  ): Promise<void> {
    const current = await this.dependencies.timeline.getSnapshot(record.runId)
    if (!current) return
    const failed = toolCallDeniedEvent(record, current.lastSequence + 1)
    const failedProjection = projectAssistantTurn(current, failed)
    const failedAppended = await this.dependencies.timeline.appendAndProject(
      failed,
      failedProjection
    )

    const terminal = permissionDeniedRunFailedEvent(
      record,
      failedProjection.lastSequence + 1
    )
    const finalProjection = projectAssistantTurn(failedProjection, terminal)
    const terminalAppended = await this.dependencies.timeline.appendAndProject(
      terminal,
      finalProjection
    )

    if (!failedAppended && !terminalAppended) return
    const sessionId = await this.dependencies.resolveConversationId({
      record,
      projection: finalProjection
    })
    if (!sessionId) return
    await this.dependencies.publishProjection({
      sessionId,
      turnId: finalProjection.turnId,
      projection: finalProjection
    })
  }
}

function toolCallRequestedEvent(
  record: Extract<DshInteractionRequestRecord, { kind: 'permission_approval' }>,
  sequence: number
): AssistantRunEvent {
  return {
    id: `${record.runId}:dsh-interaction:${record.requestId}:tool-requested`,
    runId: record.runId,
    sequence,
    type: 'tool.call.requested',
    timestamp: record.requestedAt,
    data: {
      callId: record.activityId,
      toolName: record.capabilityId,
      category: categoryForCapability(record.capabilityId),
      argumentsSummary: record.payload.title
    }
  }
}

function permissionRequiredEvent(
  record: Extract<DshInteractionRequestRecord, { kind: 'permission_approval' }>,
  sequence: number
): AssistantRunEvent {
  return {
    id: `${record.runId}:dsh-interaction:${record.requestId}:permission-required`,
    runId: record.runId,
    sequence,
    type: 'tool.call.permission_required',
    timestamp: record.requestedAt,
    data: {
      callId: record.activityId,
      toolExecutionId: record.requestId,
      message: record.payload.message
    }
  }
}

function toolCallDeniedEvent(
  record: Extract<DshInteractionRequestRecord, { kind: 'permission_approval' }>,
  sequence: number
): AssistantRunEvent {
  return {
    id: `${record.runId}:dsh-interaction:${record.requestId}:permission-denied`,
    runId: record.runId,
    sequence,
    type: 'tool.call.failed',
    timestamp: record.resolvedAt ?? record.requestedAt,
    data: {
      callId: record.activityId,
      toolExecutionId: record.requestId,
      toolName: record.capabilityId,
      category: categoryForCapability(record.capabilityId),
      errorCode: 'permission_denied',
      message: 'Permission denied by user'
    }
  }
}

function permissionDeniedRunFailedEvent(
  record: Extract<DshInteractionRequestRecord, { kind: 'permission_approval' }>,
  sequence: number
): AssistantRunEvent {
  return {
    id: `${record.runId}:dsh-interaction:${record.requestId}:run-failed`,
    runId: record.runId,
    sequence,
    type: 'run.failed',
    timestamp: record.resolvedAt ?? record.requestedAt,
    data: {
      errorCode: 'permission_denied',
      message: 'Permission denied by user'
    }
  }
}

function categoryForCapability(capabilityId: string): ToolCallCategory {
  if (
    /(?:^|[._-])(?:bash|shell|command|terminal|exec|process[._-]run)(?:[._-]|$)/i.test(
      capabilityId
    )
  ) {
    return 'command'
  }
  if (/(?:^|[._-])web[._-]?(?:search|fetch)(?:[._-]|$)/i.test(capabilityId)) {
    return 'web_search'
  }
  if (
    /(?:^|[._-])(?:file|files|filesystem|read|write|edit|glob|grep|ls)(?:[._-]|$)/i.test(
      capabilityId
    )
  ) {
    return 'filesystem'
  }
  if (/skill/i.test(capabilityId)) return 'skill'
  if (/agent/i.test(capabilityId)) return 'agent'
  if (/mcp/i.test(capabilityId)) return 'mcp'
  if (/connector/i.test(capabilityId)) return 'connector'
  return 'other'
}
