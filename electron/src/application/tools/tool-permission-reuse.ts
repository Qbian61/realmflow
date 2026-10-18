import { randomUUID } from 'node:crypto'
import type { BoundScopeAuthorization } from '../../../../domain/capability-permission'
import type { ToolEffect } from '../../../../domain/tool-authorization'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ToolExecutionCommand } from './tool-execution-contract'
import type { ToolEventStore } from './tool-event-store'
import { toolExecutionDigest } from './tool-execution-support'

export type ReusablePermissionMode = 'allow_session' | 'allow_requirement' | 'allow_space' | 'allow_always'
export type PermissionScopeContext = { workspaceId?: string; requirementId?: string }
export type PermissionGrantCeiling = 'once' | 'session' | 'space' | 'persistent'

/** Exact invocation approvals. These never confer broader capability/resource grants. */
export class ToolPermissionReuse {
  private readonly appSessionId = randomUUID()
  private position = 0
  private readonly grants = new Map<string, JsonObject>()
  private readonly revoked = new Set<string>()

  constructor(private readonly events: ToolEventStore) {}

  fingerprint(input: {
    command: ToolExecutionCommand
    definition: ToolDefinition
    bindingId: string
    effects: ToolEffect[]
    boundScopes: BoundScopeAuthorization[]
    policyDigest?: string
    approvalProfileDigest?: string
  }): string {
    const { command, definition, boundScopes } = input
    return toolExecutionDigest({
      definition: [definition.id, definition.version, definition.definitionDigest],
      arguments: command.input,
      effects: input.effects,
      bindingId: input.bindingId,
      scopes: boundScopes.map(scope => ({
        id: scope.authorizationId, source: scope.source,
        roots: scope.roots, revision: scope.bindingRevision, status: scope.status
      })),
      context: {
        requirementId: command.context.requirementId,
        workspaceId: command.context.workspaceId,
        folderPath: command.context.folderPath,
        businessScope: command.context.scope.kind === 'conversation'
          ? undefined : command.context.scope
      },
      policyDigest: input.policyDigest,
      approvalProfileDigest: input.approvalProfileDigest,
    })
  }

  createGrant(fingerprint: string, sessionId: string, mode: ReusablePermissionMode,
    context: PermissionScopeContext = {}, details: JsonObject = {}): JsonObject {
    if (mode === 'allow_space' && !context.workspaceId ||
        mode === 'allow_requirement' && !context.requirementId) {
      throw new Error('permission_scope_missing')
    }
    return { ...details, fingerprint, mode, sessionId, appSessionId: this.appSessionId,
      ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
      ...(context.requirementId ? { requirementId: context.requirementId } : {}) }
  }

  async matchingGrant(fingerprint: string, sessionId: string,
    ceiling: PermissionGrantCeiling = 'persistent', context: PermissionScopeContext = {}): Promise<string | undefined> {
    await this.refresh()
    if (ceiling === 'once') return undefined
    for (const [id, grant] of this.grants) {
      if (this.revoked.has(id) || grant.fingerprint !== fingerprint) continue
      if (grant.mode === 'allow_session' && grant.appSessionId === this.appSessionId &&
          grant.sessionId === sessionId) return id
      if (ceiling === 'session') continue
      if (grant.mode === 'allow_requirement' && context.requirementId &&
          grant.requirementId === context.requirementId && grant.workspaceId === context.workspaceId) return id
      if (grant.mode === 'allow_space' && context.workspaceId && grant.workspaceId === context.workspaceId) return id
      if (ceiling === 'persistent' && grant.mode === 'allow_always') return id
    }
    return undefined
  }

  async listGrants(): Promise<Array<JsonObject & { id: string }>> {
    await this.refresh()
    return [...this.grants].filter(([id, grant]) => !this.revoked.has(id) &&
      (grant.mode !== 'allow_session' || grant.appSessionId === this.appSessionId))
      .map(([id, grant]) => ({ ...grant, id }))
  }

  async revoke(grantId: string): Promise<void> {
    await this.refresh()
    if (this.revoked.has(grantId)) return
    if (!this.grants.has(grantId)) throw new Error('permission_grant_not_found')
    const commandId = randomUUID()
    const streamId = `revoke-${grantId}`
    const stream = await this.events.loadStream(streamId)
    const result = await this.events.append({
      streamId, streamType: 'permission', expectedSequence: stream.length,
      command: { idempotencyKey: streamId, fingerprint: toolExecutionDigest({ grantId }), result: { grantId } },
      events: [{ eventId: commandId, eventType: 'tool.permission_revoked', eventSchemaVersion: 1,
        payload: { grantId }, metadata: { commandId, correlationId: commandId, causationId: grantId,
          actorType: 'local_user', actorId: 'local-user', occurredAt: Date.now() } }],
      outbox: [],
    })
    if (result.status !== 'appended' && result.status !== 'replayed') throw new Error('permission_revision_conflict')
    await this.refresh()
  }

  private async refresh(): Promise<void> {
    // Only committed, checksum-verified events may become authorization truth.
    let position = this.position
    while (true) {
      const batch = await this.events.scan(position, 1_000)
      for (const event of batch) {
        const grant = event.payload.reusableGrant
        if (event.eventType === 'tool.permission_decided' &&
            event.payload.outcome === 'authorized' &&
            ['allow_session', 'allow_requirement', 'allow_space', 'allow_always'].includes(String(event.payload.decision)) &&
            grant && typeof grant === 'object' && !Array.isArray(grant)) {
          this.grants.set(event.eventId, grant as JsonObject)
        }
        if (event.eventType === 'tool.permission_revoked' && typeof event.payload.grantId === 'string') {
          this.revoked.add(event.payload.grantId)
        }
      }
      position = batch.at(-1)?.globalPosition ?? position
      this.position = Math.max(this.position, position)
      if (batch.length < 1_000) break
    }
  }
}
