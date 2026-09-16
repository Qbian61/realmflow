import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import {
  requireString,
  requireTerminalDimensions
} from '../ipc/runtime-validation'
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
    IPC_INVOKE_CHANNELS.terminalCreate,
    (event, workspaceId: unknown, dimensions: unknown) => {
      const channel = IPC_INVOKE_CHANNELS.terminalCreate
      const validWorkspaceId = requireString(
        workspaceId,
        channel,
        'workspaceId'
      )
      const validDimensions = requireTerminalDimensions(dimensions, channel)
      if (!observedSenders.has(event.sender.id)) {
        observedSenders.add(event.sender.id)
        event.sender.once('destroyed', () => {
          observedSenders.delete(event.sender.id)
          manager.disposeOwner(event.sender.id)
        })
      }
      return manager.create(event.sender, validWorkspaceId, validDimensions)
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.terminalWrite,
    (event, sessionId: unknown, data: unknown) => {
      const channel = IPC_INVOKE_CHANNELS.terminalWrite
      return manager.write(
        event.sender.id,
        requireString(sessionId, channel, 'sessionId'),
        requireString(data, channel, 'data', {
          allowEmpty: true,
          maxLength: 64 * 1024
        })
      )
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.terminalResize,
    (event, sessionId: unknown, dimensions: unknown) => {
      const channel = IPC_INVOKE_CHANNELS.terminalResize
      return manager.resize(
        event.sender.id,
        requireString(sessionId, channel, 'sessionId'),
        requireTerminalDimensions(dimensions, channel)
      )
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.terminalDestroy,
    (event, sessionId: unknown) => {
      const channel = IPC_INVOKE_CHANNELS.terminalDestroy
      return manager.destroy(
        event.sender.id,
        requireString(sessionId, channel, 'sessionId')
      )
    }
  )
}
