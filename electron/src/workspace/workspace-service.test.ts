import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceService } from './workspace-service'

describe('WorkspaceService', () => {
  let temporaryDirectory: string
  let workspaceDirectory: string
  let service: WorkspaceService

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-workspace-'))
    workspaceDirectory = join(temporaryDirectory, 'project')
    await mkdir(workspaceDirectory)
    service = new WorkspaceService(join(temporaryDirectory, 'bindings.json'))
    await service.bindRequirement('requirement-1', workspaceDirectory)
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('lists folders first and returns workspace-relative paths', async () => {
    await mkdir(join(workspaceDirectory, 'docs'))
    await writeFile(join(workspaceDirectory, 'README.md'), '# RealmFlow')

    await expect(service.listDirectory('requirement-1')).resolves.toEqual([
      {
        name: 'docs',
        path: 'docs',
        type: 'directory'
      },
      {
        name: 'README.md',
        path: 'README.md',
        type: 'file'
      }
    ])
  })

  it('rejects traversal and symbolic links outside the bound directory', async () => {
    const outsideFile = join(temporaryDirectory, 'outside.md')
    await writeFile(outsideFile, 'private')
    await symlink(outsideFile, join(workspaceDirectory, 'outside-link.md'))

    await expect(
      service.readFile('requirement-1', '../outside.md')
    ).rejects.toThrow('Path is outside the bound workspace')
    await expect(
      service.readFile('requirement-1', 'outside-link.md')
    ).rejects.toThrow('Path is outside the bound workspace')
  })

  it('writes text atomically and rejects stale versions', async () => {
    await writeFile(join(workspaceDirectory, 'notes.md'), 'first')
    const openedFile = await service.readFile('requirement-1', 'notes.md')

    const savedFile = await service.writeFile({
      requirementId: 'requirement-1',
      path: 'notes.md',
      content: 'second',
      expectedVersion: openedFile.version
    })

    expect(savedFile.content).toBe('second')
    await expect(
      readFile(join(workspaceDirectory, 'notes.md'), 'utf8')
    ).resolves.toBe('second')
    await expect(
      service.writeFile({
        requirementId: 'requirement-1',
        path: 'notes.md',
        content: 'third',
        expectedVersion: openedFile.version
      })
    ).rejects.toThrow('File changed outside RealmFlow')
  })

  it('creates and persists a versioned requirement manifest', async () => {
    await writeFile(join(workspaceDirectory, 'requirement.md'), '# Scope')
    const manifest = await service.readManifest('requirement-1')

    expect(manifest).toEqual({
      version: 1,
      requirementId: 'requirement-1',
      stages: {}
    })

    manifest.stages.analysis = {
      artifacts: [{ path: 'requirement.md', primary: true }]
    }
    await service.writeManifest('requirement-1', manifest)

    await expect(service.readManifest('requirement-1')).resolves.toEqual(manifest)
  })

  it('opens selected files through an ephemeral restricted workspace', async () => {
    const selectedFile = join(workspaceDirectory, 'selected.md')
    const unselectedFile = join(workspaceDirectory, 'private.md')
    await writeFile(selectedFile, '# Selected')
    await writeFile(unselectedFile, '# Private')

    const opened = await service.openSessionFiles([selectedFile])

    expect(opened.binding.requirementId).toMatch(/^session-/)
    expect(opened.files).toHaveLength(1)
    expect(opened.files[0]).toMatchObject({
      name: 'selected.md',
      path: 'selected.md',
      content: '# Selected'
    })
    await expect(
      service.readFile(opened.binding.requirementId, 'private.md')
    ).rejects.toThrow('File is not authorized for this session')
    await expect(
      readFile(join(temporaryDirectory, 'bindings.json'), 'utf8')
    ).resolves.not.toContain(opened.binding.requirementId)
  })

  it('opens a folder through an ephemeral browseable workspace', async () => {
    await writeFile(join(workspaceDirectory, 'notes.md'), 'notes')

    const binding = await service.bindSessionDirectory(workspaceDirectory)

    expect(binding.requirementId).toMatch(/^session-/)
    await expect(service.listDirectory(binding.requirementId)).resolves.toEqual([
      {
        name: 'notes.md',
        path: 'notes.md',
        type: 'file'
      }
    ])
    await expect(
      readFile(join(temporaryDirectory, 'bindings.json'), 'utf8')
    ).resolves.not.toContain(binding.requirementId)
  })

  it('allows terminals only for full folder bindings', async () => {
    const selectedFile = join(workspaceDirectory, 'selected.md')
    await writeFile(selectedFile, '# Selected')
    const fileSelection = await service.openSessionFiles([selectedFile])
    const folderSelection = await service.bindSessionDirectory(workspaceDirectory)

    await expect(
      service.resolveTerminalBinding(fileSelection.binding.requirementId)
    ).rejects.toThrow('Terminal requires an authorized folder')
    await expect(
      service.resolveTerminalBinding(folderSelection.requirementId)
    ).resolves.toEqual(folderSelection)
    await expect(
      service.resolveTerminalBinding('requirement-1')
    ).resolves.toMatchObject({
      requirementId: 'requirement-1',
      rootPath: await realpath(workspaceDirectory)
    })
  })
})
