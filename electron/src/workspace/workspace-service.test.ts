import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RequirementManifest } from '../../../shared/workspace'
import { WorkspaceService } from './workspace-service'
import type {
  ArtifactMetadataInput,
  WorkspaceMetadataStore
} from './workspace-metadata-store'

class MemoryWorkspaceMetadataStore implements WorkspaceMetadataStore {
  readonly bindings = new Map<string, string>()
  readonly manifests = new Map<string, RequirementManifest>()

  async getBinding(requirementId: string): Promise<string | undefined> {
    return this.bindings.get(requirementId)
  }

  async setBinding(requirementId: string, rootPath: string): Promise<void> {
    this.bindings.set(requirementId, rootPath)
  }

  async readManifest(requirementId: string): Promise<RequirementManifest> {
    return (
      this.manifests.get(requirementId) ?? {
        version: 1,
        requirementId,
        stages: {}
      }
    )
  }

  async replaceManifest(
    requirementId: string,
    artifacts: ArtifactMetadataInput[]
  ): Promise<void> {
    const stages: RequirementManifest['stages'] = {}
    for (const artifact of artifacts) {
      const stage = stages[artifact.stageId] ?? { artifacts: [] }
      stage.artifacts.push({
        path: artifact.path,
        ...(artifact.primary ? { primary: true } : {})
      })
      stages[artifact.stageId] = stage
    }
    this.manifests.set(requirementId, {
      version: 1,
      requirementId,
      stages
    })
  }
}

describe('WorkspaceService', () => {
  let temporaryDirectory: string
  let workspaceDirectory: string
  let service: WorkspaceService
  let metadata: MemoryWorkspaceMetadataStore

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-workspace-'))
    workspaceDirectory = join(temporaryDirectory, 'project')
    await mkdir(workspaceDirectory)
    metadata = new MemoryWorkspaceMetadataStore()
    service = new WorkspaceService(metadata)
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

  it('initializes a managed work root with private metadata directories', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)

    await service.initializeWorkRoot(rootPath, 'root-1')

    await expect(
      readFile(join(rootPath, '.realmflow', 'root.json'), 'utf8').then(JSON.parse)
    ).resolves.toEqual({ version: 1, rootId: 'root-1' })
    expect((await stat(join(rootPath, '.realmflow', 'tmp'))).isDirectory()).toBe(
      true
    )
    expect((await stat(join(rootPath, '.realmflow', 'trash'))).isDirectory()).toBe(
      true
    )
  })

  it('creates a managed space and requirement under the selected root', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')

    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'sp_a1b2c3',
      name: 'Product Space'
    })
    const requirement = await service.createManagedRequirementDirectory({
      spacePath: space.path,
      spaceId: 'sp_a1b2c3',
      requirementId: 'req_d4e5f6',
      name: 'Login Flow'
    })

    expect(space.directoryName).toBe('Product-Space--sp_a1b2c3')
    expect(requirement.directoryName).toBe('Login-Flow--req_d4e5f6')
    expect(requirement.path.startsWith(`${space.path}/`)).toBe(true)
    await expect(
      readFile(join(space.path, '.realmflow', 'space.json'), 'utf8').then(
        JSON.parse
      )
    ).resolves.toMatchObject({ version: 1, spaceId: 'sp_a1b2c3' })
    await expect(
      readFile(
        join(requirement.path, '.realmflow', 'requirement.json'),
        'utf8'
      ).then(JSON.parse)
    ).resolves.toMatchObject({
      version: 1,
      requirementId: 'req_d4e5f6',
      spaceId: 'sp_a1b2c3'
    })
  })

  it('cleans temporary directories when a managed directory is rolled back', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const pending = await service.prepareManagedSpaceDirectory({
      rootPath,
      spaceId: 'sp_rollback',
      name: 'Rollback'
    })

    await pending.rollback()

    await expect(readdir(join(rootPath, '.realmflow', 'tmp'))).resolves.toEqual([])
    await expect(stat(pending.path)).rejects.toThrow()
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
    expect(metadata.bindings.has(opened.binding.requirementId)).toBe(false)
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
    expect(metadata.bindings.has(binding.requirementId)).toBe(false)
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
