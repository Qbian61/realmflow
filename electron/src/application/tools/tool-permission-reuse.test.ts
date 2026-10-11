import { describe, expect, it } from 'vitest'
import { createToolDomainEvent, type ToolDomainEvent } from '../../../../domain/tool-domain-event'
import type { ToolEventStore } from './tool-event-store'
import { ToolPermissionReuse } from './tool-permission-reuse'

function fixture() {
  const log: ToolDomainEvent[] = []
  const store = {
    scan: async (position: number, limit: number) => log.filter(e => e.globalPosition > position).slice(0, limit),
    loadStream: async (id: string) => log.filter(e => e.streamId === id),
    append: async (input: Parameters<ToolEventStore['append']>[0]) => {
      const added = input.events.map((event, index) => createToolDomainEvent({
        ...event, streamId: input.streamId, streamType: input.streamType,
        sequence: input.expectedSequence + index + 1, globalPosition: log.length + index + 1,
      }))
      log.push(...added)
      return { status: 'appended' as const, result: input.command.result, events: added }
    },
    verifyIntegrity: async () => ({ status: 'healthy' as const }),
  }
  const record = (grant: ReturnType<ToolPermissionReuse['createGrant']>) => {
    log.push(createToolDomainEvent({
      eventId: `grant-${log.length}`, streamId: `execution-${log.length}`,
      streamType: 'tool_execution', sequence: 1, globalPosition: log.length + 1,
      eventType: 'tool.permission_decided', eventSchemaVersion: 1,
      payload: { outcome: 'authorized', decision: grant.mode, reusableGrant: grant },
      metadata: { correlationId: 'command', causationId: 'command', commandId: 'command',
        actorType: 'local_user', actorId: 'user', occurredAt: 100 },
    }))
  }
  return { store, record }
}

describe('exact permission grant lifecycle', () => {
  it('reuses a space approval across conversations only inside that space, including restart', async () => {
    const { store, record } = fixture()
    const reuse = new ToolPermissionReuse(store)
    record(reuse.createGrant('exact', 'chat-1', 'allow_space', { workspaceId: 'space-1' }))
    expect(await reuse.matchingGrant('exact', 'chat-2', 'space', { workspaceId: 'space-1' })).toBe('grant-0')
    expect(await reuse.matchingGrant('exact', 'chat-2', 'space', { workspaceId: 'space-2' })).toBeUndefined()
    expect(await new ToolPermissionReuse(store).matchingGrant('exact', 'chat-2', 'space',
      { workspaceId: 'space-1' })).toBe('grant-0')
  })

  it('keeps requirement approvals inside the requirement and workspace', async () => {
    const { store, record } = fixture()
    const reuse = new ToolPermissionReuse(store)
    record(reuse.createGrant('exact', 'chat-1', 'allow_requirement',
      { workspaceId: 'space-1', requirementId: 'req-1' }))
    expect(await reuse.matchingGrant('exact', 'chat-2', 'space',
      { workspaceId: 'space-1', requirementId: 'req-1' })).toBe('grant-0')
    expect(await reuse.matchingGrant('exact', 'chat-2', 'space',
      { workspaceId: 'space-1', requirementId: 'req-2' })).toBeUndefined()
  })

  it('does not let a persistent approval bypass a narrower current ceiling', async () => {
    const { store, record } = fixture()
    const reuse = new ToolPermissionReuse(store)
    record(reuse.createGrant('exact', 'chat-1', 'allow_always'))
    expect(await reuse.matchingGrant('exact', 'chat-1', 'space')).toBeUndefined()
    expect(await reuse.matchingGrant('exact', 'chat-1', 'session')).toBeUndefined()
  })

  it('revokes through immutable events and remains revoked after restart', async () => {
    const { store, record } = fixture()
    const reuse = new ToolPermissionReuse(store)
    record(reuse.createGrant('exact', 'chat-1', 'allow_always'))
    expect(await reuse.matchingGrant('exact', 'chat-1')).toBe('grant-0')
    await reuse.revoke('grant-0')
    expect(await reuse.matchingGrant('exact', 'chat-1')).toBeUndefined()
    expect(await new ToolPermissionReuse(store).matchingGrant('exact', 'chat-1')).toBeUndefined()
    expect(await reuse.listGrants()).toEqual([])
    expect((await store.scan(0, 100)).map(e => e.eventType))
      .toEqual(['tool.permission_decided', 'tool.permission_revoked'])
  })

  it('rejects scope grants without a corresponding trusted context', () => {
    const { store } = fixture()
    const reuse = new ToolPermissionReuse(store)
    expect(() => reuse.createGrant('exact', 'chat-1', 'allow_space')).toThrow('permission_scope_missing')
    expect(() => reuse.createGrant('exact', 'chat-1', 'allow_requirement')).toThrow('permission_scope_missing')
  })
})
