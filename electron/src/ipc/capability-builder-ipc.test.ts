import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { registerCapabilityBuilderIpc } from './capability-builder-ipc'

describe('Capability Builder IPC', () => {
  it('registers create, get, revise, confirm, and cancel handlers', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >()
    const builder = {
      createDraft: vi.fn().mockResolvedValue({ id: 'generation-1' }),
      getSession: vi.fn().mockResolvedValue({ id: 'generation-1' }),
      reviseDraft: vi.fn().mockResolvedValue({ id: 'generation-1' }),
      confirmInstall: vi.fn().mockResolvedValue({
        definition: { id: 'com.example.lookup' },
        installation: { id: 'installation-1' }
      }),
      cancel: vi.fn().mockResolvedValue({
        id: 'generation-1',
        status: 'cancelled'
      })
    }
    registerCapabilityBuilderIpc({
      builder,
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      }
    })
    const create = createCommand()

    await handlers.get('capability-builder:create')!(
      {} as IpcMainInvokeEvent,
      create
    )
    await handlers.get('capability-builder:get')!(
      {} as IpcMainInvokeEvent,
      'generation-1'
    )
    await handlers.get('capability-builder:revise')!(
      {} as IpcMainInvokeEvent,
      {
        sessionId: 'generation-1',
        expectedRevision: 3,
        request: create.request,
        spec: create.spec
      }
    )
    await handlers.get('capability-builder:confirm')!(
      {} as IpcMainInvokeEvent,
      {
        sessionId: 'generation-1',
        proposalId: 'proposal-1',
        revision: 3,
        packageDigest: 'a'.repeat(64),
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        enable: false
      }
    )
    await handlers.get('capability-builder:cancel')!(
      {} as IpcMainInvokeEvent,
      {
        sessionId: 'generation-1',
        expectedRevision: 3
      }
    )

    expect(builder.createDraft).toHaveBeenCalledWith({
      ...create,
      spec: {
        ...create.spec,
        permissions: {
          ...create.spec.permissions,
          capabilities: ['credential.use', 'network.connect']
        }
      }
    })
    expect(builder.getSession).toHaveBeenCalledWith('generation-1')
    expect(builder.reviseDraft).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 3 })
    )
    expect(builder.confirmInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        packageDigest: 'a'.repeat(64),
        enable: false
      })
    )
    expect(builder.cancel).toHaveBeenCalledWith({
      sessionId: 'generation-1',
      expectedRevision: 3
    })
  })

  it('rejects extra fields and unsupported generated runtimes', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >()
    registerCapabilityBuilderIpc({
      builder: {
        createDraft: vi.fn(),
        getSession: vi.fn(),
        reviseDraft: vi.fn(),
        confirmInstall: vi.fn(),
        cancel: vi.fn()
      },
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      }
    })

    expect(() =>
      handlers.get('capability-builder:create')!(
        {} as IpcMainInvokeEvent,
        {
          ...createCommand(),
          physicalPath: '/renderer-controlled'
        }
      )
    ).toThrow('Capability Builder create command contains unexpected fields')

    expect(() =>
      handlers.get('capability-builder:create')!(
        {} as IpcMainInvokeEvent,
        {
          ...createCommand(),
          conversationId: 'renderer-controlled',
          requestedBy: 'another-user'
        }
      )
    ).toThrow('Capability Builder create command contains unexpected fields')

    expect(() =>
      handlers.get('capability-builder:create')!(
        {} as IpcMainInvokeEvent,
        {
          ...createCommand(),
          spec: {
            ...createCommand().spec,
            runtime: {
              ...createCommand().spec.runtime,
              connectorKind: 'cli'
            }
          }
        }
      )
    ).toThrow('Capability Builder only supports HTTP Connectors')
  })
})

function createCommand() {
  return {
    request: 'Create an issue lookup connector.',
    spec: {
      schemaVersion: 1 as const,
      id: 'com.example.issue-lookup',
      kind: 'connector' as const,
      version: '1.0.0',
      name: 'Issue lookup',
      description: 'Reads issue details.',
      scope: { kind: 'workspace' as const, workspaceId: 'workspace-1' },
      runtime: {
        kind: 'connector' as const,
        connectorKind: 'http' as const,
        baseUrl: 'https://api.example.com',
        method: 'GET' as const,
        path: '/issues/{issueId}',
        credentialRefs: ['issue-api-key'],
        externalWrite: false
      },
      permissions: {
        capabilities: ['network.connect' as const, 'credential.use' as const],
        maximumRisk: 'medium' as const,
        pathPrefixes: [],
        networkTargets: ['api.example.com']
      },
      dependencies: [],
      compatibility: {
        realmflowVersionRange: '>=0.1.0',
        platforms: ['darwin' as const]
      }
    }
  }
}
