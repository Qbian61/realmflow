import type { RequirementManifest, WriteWorkspaceFileInput } from '../../../shared/workspace'
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
  ipcMain.handle('workspace:choose-files', async () => {
    const selection = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections']
    })
    if (selection.canceled || selection.filePaths.length === 0) return null
    return workspace.openSessionFiles(selection.filePaths)
  })
  ipcMain.handle('workspace:choose-folder', async () => {
    const selection = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (selection.canceled || selection.filePaths.length === 0) return null
    return workspace.bindSessionDirectory(selection.filePaths[0])
  })
  ipcMain.handle(
    'workspace:choose-directory',
    async (_event, requirementId: string) => {
      const selection = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      if (selection.canceled || selection.filePaths.length === 0) return null
      return workspace.bindRequirement(requirementId, selection.filePaths[0])
    }
  )
  ipcMain.handle(
    'workspace:get-binding',
    (_event, requirementId: string) => workspace.getBinding(requirementId)
  )
  ipcMain.handle(
    'workspace:list-directory',
    (_event, requirementId: string, path = '') =>
      workspace.listDirectory(requirementId, path)
  )
  ipcMain.handle(
    'workspace:read-file',
    (_event, requirementId: string, path: string) =>
      workspace.readFile(requirementId, path)
  )
  ipcMain.handle(
    'workspace:write-file',
    (_event, input: WriteWorkspaceFileInput) => workspace.writeFile(input)
  )
  ipcMain.handle(
    'workspace:read-manifest',
    (_event, requirementId: string) => workspace.readManifest(requirementId)
  )
  ipcMain.handle(
    'workspace:write-manifest',
    (_event, requirementId: string, manifest: RequirementManifest) =>
      workspace.writeManifest(requirementId, manifest)
  )
  ipcMain.handle(
    'workspace:get-preview-url',
    (_event, requirementId: string, path: string) =>
      workspace.getPreviewUrl(requirementId, path)
  )
  ipcMain.handle(
    'workspace:show-item',
    async (_event, requirementId: string, path: string) => {
      shell.showItemInFolder(
        await workspace.resolvePreviewPath(requirementId, path)
      )
    }
  )
}
