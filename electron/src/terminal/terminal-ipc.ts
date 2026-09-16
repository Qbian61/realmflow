import type { TerminalDimensions } from '../../../shared/terminal'
import type { TerminalManager } from './terminal-manager'

type TerminalIpcEvent = {
  sender: {
    id: number
    send: (channel: string, payload: unknown) => void
    once: (event: 'destroyed', listener: () => void) => void
  }
}

type TerminalCommands = Pick<
  TerminalManager,
  'create' | 'write' | 'resize' | 'destroy' | 'disposeOwner'
>

type TerminalIpcDependencies = {
  manager: TerminalCommands
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: TerminalIpcEvent, ...args: any[]) => unknown
    ) => void
  }
}

export function registerTerminalIpc({
  manager,
  ipcMain
}: TerminalIpcDependencies): void {
  const observedSenders = new Set<number>()

  ipcMain.handle(
    'terminal:create',
    (
      event,
      workspaceId: string,
      dimensions: TerminalDimensions
    ) => {
      if (!observedSenders.has(event.sender.id)) {
        observedSenders.add(event.sender.id)
        event.sender.once('destroyed', () => {
          observedSenders.delete(event.sender.id)
          manager.disposeOwner(event.sender.id)
        })
      }
      return manager.create(event.sender, workspaceId, dimensions)
    }
  )
  ipcMain.handle(
    'terminal:write',
    (event, sessionId: string, data: string) =>
      manager.write(event.sender.id, sessionId, data)
  )
  ipcMain.handle(
    'terminal:resize',
    (
      event,
      sessionId: string,
      dimensions: TerminalDimensions
    ) => manager.resize(event.sender.id, sessionId, dimensions)
  )
  ipcMain.handle(
    'terminal:destroy',
    (event, sessionId: string) =>
      manager.destroy(event.sender.id, sessionId)
  )
}
