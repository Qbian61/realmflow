import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { WorkspaceService } from './workspace-service'
import { registerWorkspaceIpc } from './workspace-ipc'

describe('registerWorkspaceIpc', () => {
  it('registers explicit workspace channels without exposing filesystem access', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-ipc-'))
    const workspaceDirectory = join(temporaryDirectory, 'project')
    await mkdir(workspaceDirectory)
    const selectedFile = join(workspaceDirectory, 'notes.md')
    await writeFile(selectedFile, 'notes')
    const service = new WorkspaceService(join(temporaryDirectory, 'bindings.json'))
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const shownItems: string[] = []

    registerWorkspaceIpc({
      workspace: service,
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      },
      dialog: {
        showOpenDialog: async ({ properties }) => ({
          canceled: false,
          filePaths: properties.includes('openFile')
            ? [selectedFile]
            : [workspaceDirectory]
        })
      },
      shell: {
        showItemInFolder: (path) => {
          shownItems.push(path)
        }
      }
    })

    expect([...handlers.keys()]).toEqual([
      'workspace:choose-files',
      'workspace:choose-folder',
      'workspace:choose-directory',
      'workspace:get-binding',
      'workspace:list-directory',
      'workspace:read-file',
      'workspace:write-file',
      'workspace:read-manifest',
      'workspace:write-manifest',
      'workspace:get-preview-url',
      'workspace:show-item'
    ])

    const chooseFiles = handlers.get('workspace:choose-files')
    await expect(chooseFiles?.({})).resolves.toMatchObject({
      binding: { rootName: 'project' },
      files: [{ name: 'notes.md', content: 'notes' }]
    })

    const chooseFolder = handlers.get('workspace:choose-folder')
    await expect(chooseFolder?.({})).resolves.toMatchObject({
      rootName: 'project'
    })

    const chooseDirectory = handlers.get('workspace:choose-directory')
    await expect(chooseDirectory?.({}, 'requirement-1')).resolves.toMatchObject({
      requirementId: 'requirement-1',
      rootName: 'project'
    })

    const showItem = handlers.get('workspace:show-item')
    await showItem?.({}, 'requirement-1', '')
    expect(shownItems).toEqual([await realpath(workspaceDirectory)])

    await rm(temporaryDirectory, { recursive: true, force: true })
  })
})
