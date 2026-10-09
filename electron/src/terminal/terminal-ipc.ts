import { IPC_COMMAND_CHANNELS } from '../../../shared/ipc-contract'
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
  'create' | 'createHome' | 'write' | 'resize' | 'destroy' | 'disposeOwner'
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
  const observeSender = (event: TerminalIpcEvent): void => {
    if (observedSenders.has(event.sender.id)) return
    observedSenders.add(event.sender.id)
    event.sender.once('destroyed', () => {
      observedSenders.delete(event.sender.id)
      manager.disposeOwner(event.sender.id)
    })
  }

  ipcMain.handle(
    IPC_COMMAND_CHANNELS.terminalCreate,
    (event, workspaceId: unknown, dimensions: unknown) => {
      const channel = IPC_COMMAND_CHANNELS.terminalCreate
      const validWorkspaceId = requireString(
        workspaceId,
        channel,
        'workspaceId'
      )
      const validDimensions = requireTerminalDimensions(dimensions, channel)
      observeSender(event)
      return manager.create(event.sender, validWorkspaceId, validDimensions)
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.terminalCreateHome,
    (event, dimensions: unknown) => {
      const channel = IPC_COMMAND_CHANNELS.terminalCreateHome
      const validDimensions = requireTerminalDimensions(dimensions, channel)
      observeSender(event)
      return manager.createHome(event.sender, validDimensions)
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.terminalWrite,
    (event, sessionId: unknown, data: unknown) => {
      const channel = IPC_COMMAND_CHANNELS.terminalWrite
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
    IPC_COMMAND_CHANNELS.terminalResize,
    (event, sessionId: unknown, dimensions: unknown) => {
      const channel = IPC_COMMAND_CHANNELS.terminalResize
      return manager.resize(
        event.sender.id,
        requireString(sessionId, channel, 'sessionId'),
        requireTerminalDimensions(dimensions, channel)
      )
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.terminalDestroy,
    (event, sessionId: unknown) => {
      const channel = IPC_COMMAND_CHANNELS.terminalDestroy
      return manager.destroy(
        event.sender.id,
        requireString(sessionId, channel, 'sessionId')
      )
    }
  )
}
