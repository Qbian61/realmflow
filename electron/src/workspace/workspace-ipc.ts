import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import {
  requireNoIpcPayload,
  requireRequirementManifest,
  requireString,
  requireWriteWorkspaceFileInput
} from '../ipc/runtime-validation'
import type { WorkspaceService } from './workspace-service'

type InvokeHandler = (event: unknown, ...args: any[]) => unknown

type WorkspaceIpcDependencies = {
  workspace: WorkspaceService
  ipcMain: {
    handle: (channel: string, handler: InvokeHandler) => void
  }
  dialog: {
    showOpenDialog: (options: {
      properties: Array<
        'openFile' | 'openDirectory' | 'multiSelections' | 'createDirectory'
      >
    }) => Promise<{ canceled: boolean; filePaths: string[] }>
  }
  shell: {
    showItemInFolder: (path: string) => void
  }
}

export function registerWorkspaceIpc({
  workspace,
  ipcMain,
  dialog,
  shell
}: WorkspaceIpcDependencies): void {
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workspaceChooseFiles,
    async (_event, ...values) => {
      requireNoIpcPayload(values, IPC_COMMAND_CHANNELS.workspaceChooseFiles)
      const selection = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections']
      })
      if (selection.canceled || selection.filePaths.length === 0) return null
      return workspace.openSessionFiles(selection.filePaths)
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workspaceOpenSessionFiles,
    async (_event, filePaths: unknown) => {
      return workspace.openSessionFiles(
        requireFilePaths(
          filePaths,
          IPC_COMMAND_CHANNELS.workspaceOpenSessionFiles
        )
      )
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workspaceChooseFolder,
    async (_event, ...values) => {
      requireNoIpcPayload(values, IPC_COMMAND_CHANNELS.workspaceChooseFolder)
      const selection = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      if (selection.canceled || selection.filePaths.length === 0) return null
      return workspace.bindSessionDirectory(selection.filePaths[0])
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workspaceChooseDirectory,
    async (_event, requirementId: unknown) => {
      const channel = IPC_COMMAND_CHANNELS.workspaceChooseDirectory
      const validRequirementId = requireString(
        requirementId,
        channel,
        'requirementId'
      )
      const selection = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      if (selection.canceled || selection.filePaths.length === 0) return null
      return workspace.bindRequirement(
        validRequirementId,
        selection.filePaths[0]
      )
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workspaceGetBinding,
    (_event, requirementId: unknown) => {
      const channel = IPC_QUERY_CHANNELS.workspaceGetBinding
      return workspace.getBinding(
        requireString(requirementId, channel, 'requirementId')
      )
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workspaceListDirectory,
    (_event, requirementId: unknown, path: unknown = '') => {
      const channel = IPC_QUERY_CHANNELS.workspaceListDirectory
      return workspace.listDirectory(
        requireString(requirementId, channel, 'requirementId'),
        requireString(path, channel, 'path', { allowEmpty: true })
      )
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workspaceReadFile,
    (_event, requirementId: unknown, path: unknown) => {
      const channel = IPC_QUERY_CHANNELS.workspaceReadFile
      return workspace.readFile(
        requireString(requirementId, channel, 'requirementId'),
        requireString(path, channel, 'path')
      )
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workspaceReadPreviewBytes,
    (_event, requirementId: unknown, path: unknown) => {
      const channel = IPC_QUERY_CHANNELS.workspaceReadPreviewBytes
      return workspace.readPreviewBytes(
        requireString(requirementId, channel, 'requirementId'),
        requireString(path, channel, 'path')
      )
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workspaceWriteFile,
    (_event, input: unknown) =>
      workspace.writeFile(
        requireWriteWorkspaceFileInput(
          input,
          IPC_COMMAND_CHANNELS.workspaceWriteFile
        )
      )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workspaceReadManifest,
    (_event, requirementId: unknown) => {
      const channel = IPC_QUERY_CHANNELS.workspaceReadManifest
      return workspace.readManifest(
        requireString(requirementId, channel, 'requirementId')
      )
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workspaceWriteManifest,
    (_event, requirementId: unknown, manifest: unknown) => {
      const channel = IPC_COMMAND_CHANNELS.workspaceWriteManifest
      return workspace.writeManifest(
        requireString(requirementId, channel, 'requirementId'),
        requireRequirementManifest(manifest, channel)
      )
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workspaceGetPreviewUrl,
    (_event, requirementId: unknown, path: unknown) => {
      const channel = IPC_QUERY_CHANNELS.workspaceGetPreviewUrl
      return workspace.getPreviewUrl(
        requireString(requirementId, channel, 'requirementId'),
        requireString(path, channel, 'path')
      )
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workspaceShowItem,
    async (_event, requirementId: unknown, path: unknown) => {
      const channel = IPC_COMMAND_CHANNELS.workspaceShowItem
      shell.showItemInFolder(
        await workspace.resolvePreviewPath(
          requireString(requirementId, channel, 'requirementId'),
          requireString(path, channel, 'path', { allowEmpty: true })
        )
      )
    }
  )
}

function requireFilePaths(value: unknown, channel: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: filePaths`)
  }
  return value
}
