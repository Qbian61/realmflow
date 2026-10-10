import { randomUUID } from 'node:crypto'
import type { BoundScopeAuthorization } from '../../../../domain/capability-permission'
import type { ToolEffect } from '../../../../domain/tool-authorization'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ToolExecutionCommand } from './tool-execution-application-service'
import type { ToolEventStore } from './tool-event-store'
import { toolExecutionDigest } from './tool-execution-support'

/** Exact invocation approvals. These never confer broader capability/resource grants. */
export class ToolPermissionReuse {
  private readonly appSessionId = randomUUID()
  private position = 0
  private readonly grants = new Map<string, JsonObject>()

  constructor(private readonly events: ToolEventStore) {}

  fingerprint(input: {
    command: ToolExecutionCommand
    definition: ToolDefinition
    bindingId: string
    effects: ToolEffect[]
    boundScopes: BoundScopeAuthorization[]
    policyDigest?: string
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
      policyDigest: input.policyDigest
    })
  }

  createGrant(fingerprint: string, sessionId: string, mode: 'allow_session' | 'allow_always'): JsonObject {
    return { fingerprint, mode, sessionId, appSessionId: this.appSessionId }
  }

  async matchingGrant(fingerprint: string, sessionId: string): Promise<string | undefined> {
    // Only committed, checksum-verified events may become authorization truth.
    let position = this.position
    while (true) {
      const batch = await this.events.scan(position, 1_000)
      for (const event of batch) {
        const grant = event.payload.reusableGrant
        if (event.eventType === 'tool.permission_decided' &&
            event.payload.outcome === 'authorized' &&
            (event.payload.decision === 'allow_session' || event.payload.decision === 'allow_always') &&
            grant && typeof grant === 'object' && !Array.isArray(grant)) {
          this.grants.set(event.eventId, grant as JsonObject)
        }
      }
      position = batch.at(-1)?.globalPosition ?? position
      this.position = Math.max(this.position, position)
      if (batch.length < 1_000) break
    }
    for (const [id, grant] of this.grants) {
      if (grant.fingerprint !== fingerprint) continue
      if (grant.mode === 'allow_always' ||
          (grant.mode === 'allow_session' && grant.appSessionId === this.appSessionId &&
            grant.sessionId === sessionId)) return id
    }
    return undefined
  }
}
