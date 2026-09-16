import { vi } from 'vitest'
import type { RealmFlowApi } from '../../shared/types'
import {
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS,
  IPC_SEND_CHANNELS
} from '../../shared/ipc-contract'
import { registerMainIpc } from './ipc/register-main-ipc'
import { createRealmFlowApi } from './preload-api'

describe('preload and main IPC contract', () => {
  it('registers every channel invoked by the preload API', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const listeners = new Map<string, (...args: unknown[]) => unknown>()
    registerMainIpc({
      sidecar: { getStatus: vi.fn() },
      quitApp: vi.fn(),
      persistence: {
        load: vi.fn(),
        save: vi.fn()
      },
      workspace: createWorkspaceMock() as never,
      terminalManager: createTerminalMock() as never,
      nativeOverlayManager: createNativeOverlayMock() as never,
      webWorkbenchManager: createWebWorkbenchMock() as never,
      ipcMain: {
        handle: (
          channel: string,
          handler: (...args: unknown[]) => unknown
        ) => handlers.set(channel, handler),
        on: (
          channel: string,
          listener: (...args: unknown[]) => unknown
        ) => listeners.set(channel, listener)
      } as never,
      dialog: {} as never,
      shell: {} as never
    })

    const invoked: string[] = []
    const subscribed: string[] = []
    const api = createRealmFlowApi(
      {
        invoke: async (channel) => {
          invoked.push(channel)
          return undefined
        },
        on: (channel) => {
          subscribed.push(channel)
        },
        removeListener: vi.fn()
      },
      'darwin'
    )

    await invokeEveryApiCommand(api)
    api.nativeOverlay?.onEvent(vi.fn())
    api.persistence.onChanged(vi.fn())
    api.webWorkbench.onStateChange(vi.fn())
    api.terminal.onEvent(vi.fn())

    expect(new Set(invoked)).toEqual(
      new Set(Object.values(IPC_INVOKE_CHANNELS))
    )
    expect(new Set(handlers.keys())).toEqual(new Set(invoked))
    expect(new Set(listeners.keys())).toEqual(
      new Set(Object.values(IPC_SEND_CHANNELS))
    )
    expect(new Set(subscribed)).toEqual(
      new Set(Object.values(IPC_EVENT_CHANNELS))
    )
  })
})

function createWorkspaceMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    [
      'openSessionFiles',
      'bindSessionDirectory',
      'bindRequirement',
      'getBinding',
      'listDirectory',
      'readFile',
      'writeFile',
      'readManifest',
      'writeManifest',
      'getPreviewUrl',
      'resolvePreviewPath'
    ].map((name) => [name, vi.fn()])
  )
}

function createTerminalMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    ['create', 'write', 'resize', 'destroy', 'disposeOwner'].map((name) => [
      name,
      vi.fn()
    ])
  )
}

function createNativeOverlayMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    ['show', 'hide', 'select', 'close'].map((name) => [name, vi.fn()])
  )
}

function createWebWorkbenchMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    [
      'create',
      'show',
      'hideAll',
      'setBounds',
      'navigate',
      'goBack',
      'goForward',
      'reload',
      'destroy',
      'openExternal'
    ].map((name) => [name, vi.fn()])
  )
}

async function invokeEveryApiCommand(api: RealmFlowApi): Promise<void> {
  const bounds = { x: 0, y: 0, width: 300, height: 200 }
  const dimensions = { cols: 80, rows: 24 }
  const manifest = {
    version: 1 as const,
    requirementId: 'requirement-1',
    stages: {}
  }

  await Promise.all([
    api.getSidecarStatus(),
    api.quitApp(),
    api.nativeOverlay?.show({ kind: 'workbench-menu', anchor: bounds }),
    api.nativeOverlay?.hide('workbench-menu'),
    api.persistence.load('workspaceNavigation'),
    api.persistence.save('workspaceNavigation', {}, 0),
    api.workspace.chooseFiles(),
    api.workspace.chooseFolder(),
    api.workspace.chooseDirectory('requirement-1'),
    api.workspace.getBinding('requirement-1'),
    api.workspace.listDirectory('requirement-1'),
    api.workspace.readFile('requirement-1', 'notes.md'),
    api.workspace.writeFile({
      requirementId: 'requirement-1',
      path: 'notes.md',
      content: 'content',
      expectedVersion: 'version-1'
    }),
    api.workspace.readManifest('requirement-1'),
    api.workspace.writeManifest('requirement-1', manifest),
    api.workspace.getPreviewUrl('requirement-1', 'notes.md'),
    api.workspace.showItem('requirement-1', 'notes.md'),
    api.webWorkbench.create('https://example.com'),
    api.webWorkbench.show('page-1', bounds),
    api.webWorkbench.hideAll(),
    api.webWorkbench.setBounds('page-1', bounds),
    api.webWorkbench.navigate('page-1', 'https://example.com'),
    api.webWorkbench.goBack('page-1'),
    api.webWorkbench.goForward('page-1'),
    api.webWorkbench.reload('page-1'),
    api.webWorkbench.destroy('page-1'),
    api.webWorkbench.openExternal('https://example.com'),
    api.terminal.create('requirement-1', dimensions),
    api.terminal.write('terminal-1', 'ls\r'),
    api.terminal.resize('terminal-1', dimensions),
    api.terminal.destroy('terminal-1')
  ])
}
