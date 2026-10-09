import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { RequirementManifest } from '../../../shared/workspace'
import { WorkspaceService } from './workspace-service'
import type {
  ArtifactMetadataInput,
  WorkspaceMetadataStore
} from './workspace-metadata-store'

class MemoryWorkspaceMetadataStore implements WorkspaceMetadataStore {
  readonly bindings = new Map<string, string>()
  readonly manifests = new Map<string, RequirementManifest>()
  replaceManifestGate?: Promise<void>

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
    await this.replaceManifestGate
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
    await expect(readdir(requirement.path)).resolves.toEqual([
      '.realmflow',
      'artifacts',
      'attachments',
      'workspace'
    ])
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

  it('inspects an externally moved managed space without modifying it', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const created = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'space-1',
      name: 'Product Space'
    })
    const relocatedPath = join(rootPath, 'Externally-Moved-Space')
    await rename(created.path, relocatedPath)

    await expect(
      service.inspectManagedSpaceDirectory({
        path: relocatedPath,
        spaceId: 'space-1'
      })
    ).resolves.toEqual({
      path: await realpath(relocatedPath),
      directoryName: 'Externally-Moved-Space'
    })
    await expect(
      readFile(join(relocatedPath, '.realmflow', 'space.json'), 'utf8').then(
        JSON.parse
      )
    ).resolves.toMatchObject({ version: 1, spaceId: 'space-1' })
  })

  it('rejects a relocation target whose space manifest does not match', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const otherSpace = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'space-other',
      name: 'Other Space'
    })

    await expect(
      service.inspectManagedSpaceDirectory({
        path: otherSpace.path,
        spaceId: 'space-1'
      })
    ).rejects.toThrow('Managed space manifest does not match')
  })

  it('rejects missing and escaped relocation manifests', async () => {
    const missingManifestPath = join(temporaryDirectory, 'missing-manifest')
    await mkdir(missingManifestPath)
    await expect(
      service.inspectManagedSpaceDirectory({
        path: missingManifestPath,
        spaceId: 'space-1'
      })
    ).rejects.toThrow('Managed space manifest is invalid')

    const escapedManifestPath = join(temporaryDirectory, 'escaped-manifest')
    const outsideMetadataPath = join(temporaryDirectory, 'outside-metadata')
    await mkdir(escapedManifestPath)
    await mkdir(outsideMetadataPath)
    await writeFile(
      join(outsideMetadataPath, 'space.json'),
      JSON.stringify({ version: 1, spaceId: 'space-1' })
    )
    await symlink(outsideMetadataPath, join(escapedManifestPath, '.realmflow'))

    await expect(
      service.inspectManagedSpaceDirectory({
        path: escapedManifestPath,
        spaceId: 'space-1'
      })
    ).rejects.toThrow('Path is outside the bound workspace')
  })

  it('renames a managed requirement within its parent and can roll it back', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'space-1',
      name: 'Product Space'
    })
    const requirement = await service.createManagedRequirementDirectory({
      spacePath: space.path,
      spaceId: 'space-1',
      requirementId: 'requirement-1',
      name: 'Login Flow'
    })

    const moved = await service.renameManagedDirectory({
      parentPath: space.path,
      currentPath: requirement.path,
      entityType: 'requirement',
      entityId: 'requirement-1',
      name: 'Renamed Flow'
    })

    expect(moved.directoryName).toBe('Renamed-Flow--requirement-1')
    expect((await stat(moved.path)).isDirectory()).toBe(true)
    await expect(stat(requirement.path)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      readFile(
        join(moved.path, '.realmflow', 'requirement.json'),
        'utf8'
      ).then(JSON.parse)
    ).resolves.toMatchObject({ requirementId: 'requirement-1' })

    await moved.rollback()
    await moved.rollback()
    expect((await stat(requirement.path)).isDirectory()).toBe(true)
    await expect(stat(moved.path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unsafe managed directory rename inputs before moving the source', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'space-1',
      name: 'Product Space'
    })
    const requirement = await service.createManagedRequirementDirectory({
      spacePath: space.path,
      spaceId: 'space-1',
      requirementId: 'requirement-1',
      name: 'Login Flow'
    })

    await expect(
      service.renameManagedDirectory({
        parentPath: space.path,
        currentPath: requirement.path,
        entityType: 'requirement',
        entityId: 'requirement-1',
        name: '   '
      })
    ).rejects.toThrow('Managed directory name is invalid')

    await writeFile(
      join(requirement.path, '.realmflow', 'requirement.json'),
      JSON.stringify({
        version: 1,
        requirementId: 'another-requirement',
        spaceId: 'space-1'
      })
    )
    await expect(
      service.renameManagedDirectory({
        parentPath: space.path,
        currentPath: requirement.path,
        entityType: 'requirement',
        entityId: 'requirement-1',
        name: 'Renamed Flow'
      })
    ).rejects.toThrow('Managed requirement manifest does not match')

    expect((await stat(requirement.path)).isDirectory()).toBe(true)
  })

  it('rejects an occupied rename destination and paths outside the parent', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'space-1',
      name: 'Product Space'
    })
    const requirement = await service.createManagedRequirementDirectory({
      spacePath: space.path,
      spaceId: 'space-1',
      requirementId: 'requirement-1',
      name: 'Login Flow'
    })
    await mkdir(join(space.path, 'Occupied--requirement-1'))

    await expect(
      service.renameManagedDirectory({
        parentPath: space.path,
        currentPath: requirement.path,
        entityType: 'requirement',
        entityId: 'requirement-1',
        name: 'Occupied'
      })
    ).rejects.toThrow('Managed directory already exists')
    await expect(
      service.renameManagedDirectory({
        parentPath: space.path,
        currentPath: rootPath,
        entityType: 'requirement',
        entityId: 'requirement-1',
        name: 'Escaped'
      })
    ).rejects.toThrow('Path is outside the bound workspace')

    expect((await stat(requirement.path)).isDirectory()).toBe(true)
  })

  it('rejects a requirement when the parent space manifest does not match', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'space-1',
      name: 'Product Space'
    })
    await writeFile(
      join(space.path, '.realmflow', 'space.json'),
      JSON.stringify({ version: 1, spaceId: 'different-space' })
    )

    await expect(
      service.prepareManagedRequirementDirectory({
        spacePath: space.path,
        spaceId: 'space-1',
        requirementId: 'requirement-1',
        name: 'Login Flow'
      })
    ).rejects.toThrow('Managed space manifest does not match')
    await expect(
      readdir(space.path).then((entries) =>
        entries.filter((entry) => entry !== '.realmflow')
      )
    ).resolves.toEqual([])
  })

  it('keeps long requirement ids distinct when their trailing characters match', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'space-1',
      name: 'Product Space'
    })
    const sharedSuffix = '123456789012345678901234'

    const first = await service.createManagedRequirementDirectory({
      spacePath: space.path,
      spaceId: 'space-1',
      requirementId: `requirement-first-${sharedSuffix}`,
      name: 'Login Flow'
    })
    const second = await service.createManagedRequirementDirectory({
      spacePath: space.path,
      spaceId: 'space-1',
      requirementId: `requirement-second-${sharedSuffix}`,
      name: 'Login Flow'
    })

    expect(first.directoryName).not.toBe(second.directoryName)
    expect((await stat(first.path)).isDirectory()).toBe(true)
    expect((await stat(second.path)).isDirectory()).toBe(true)
  })

  it('keeps long stable ids distinct when their trailing characters match', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const sharedSuffix = '123456789012345678901234'

    const first = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: `space-first-${sharedSuffix}`,
      name: 'Product Space'
    })
    const second = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: `space-second-${sharedSuffix}`,
      name: 'Product Space'
    })

    expect(first.directoryName).not.toBe(second.directoryName)
    expect((await stat(first.path)).isDirectory()).toBe(true)
    expect((await stat(second.path)).isDirectory()).toBe(true)
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

  it('restores trash only to a path inside the same managed work root', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'sp_restore',
      name: 'Restore'
    })
    const move = await service.moveManagedDirectoryToTrash({
      workRootPath: rootPath,
      entityType: 'space',
      entityId: 'sp_restore',
      path: space.path
    })

    await expect(
      service.restoreManagedDirectory({
        originalPath: join(temporaryDirectory, 'outside-space'),
        trashPath: move.movedPath
      })
    ).rejects.toThrow('Path is outside the bound workspace')
    expect((await stat(move.movedPath)).isDirectory()).toBe(true)

    await service.restoreManagedDirectory({
      originalPath: move.originalPath,
      trashPath: move.movedPath
    })
    expect((await stat(move.originalPath)).isDirectory()).toBe(true)
  })

  it('permanently removes only managed trash entries and supports replay', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'sp_purge',
      name: 'Purge'
    })
    const move = await service.moveManagedDirectoryToTrash({
      workRootPath: rootPath,
      entityType: 'space',
      entityId: 'sp_purge',
      path: space.path
    })

    await service.purgeManagedTrashDirectory({ trashPath: move.movedPath })

    await expect(stat(move.movedPath)).rejects.toThrow()
    await expect(
      readdir(join(rootPath, '.realmflow', 'purge'))
    ).resolves.toEqual([])
    await expect(
      service.purgeManagedTrashDirectory({ trashPath: move.movedPath })
    ).resolves.toBeUndefined()
    await expect(
      service.purgeManagedTrashDirectory({
        trashPath: join(temporaryDirectory, 'outside-trash')
      })
    ).rejects.toThrow('Managed trash path is invalid')
  })

  it('continues permanent removal from its deterministic purge path', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    await mkdir(rootPath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'sp_resume_purge',
      name: 'Resume Purge'
    })
    const move = await service.moveManagedDirectoryToTrash({
      workRootPath: rootPath,
      entityType: 'space',
      entityId: 'sp_resume_purge',
      path: space.path
    })
    const purgePath = join(
      rootPath,
      '.realmflow',
      'purge',
      basename(move.movedPath)
    )
    await mkdir(join(rootPath, '.realmflow', 'purge'), { recursive: true })
    await rename(move.movedPath, purgePath)

    await service.purgeManagedTrashDirectory({ trashPath: move.movedPath })

    await expect(stat(purgePath)).rejects.toThrow()
  })

  it('rejects a purge root symbolic link before moving the trash entry', async () => {
    const rootPath = join(temporaryDirectory, 'managed-root')
    const outsidePath = join(temporaryDirectory, 'outside-purge')
    await mkdir(rootPath)
    await mkdir(outsidePath)
    await service.initializeWorkRoot(rootPath, 'root-1')
    const space = await service.createManagedSpaceDirectory({
      rootPath,
      spaceId: 'sp_unsafe_purge',
      name: 'Unsafe Purge'
    })
    const move = await service.moveManagedDirectoryToTrash({
      workRootPath: rootPath,
      entityType: 'space',
      entityId: 'sp_unsafe_purge',
      path: space.path
    })
    await symlink(outsidePath, join(rootPath, '.realmflow', 'purge'))

    await expect(
      service.purgeManagedTrashDirectory({ trashPath: move.movedPath })
    ).rejects.toThrow('Path is outside the bound workspace')

    expect((await stat(move.movedPath)).isDirectory()).toBe(true)
    await expect(readdir(outsidePath)).resolves.toEqual([])
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

  it('opens OFD as a read-only fixed-layout binary', async () => {
    await writeFile(
      join(workspaceDirectory, 'invoice.ofd'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])
    )

    const opened = await service.readFile('requirement-1', 'invoice.ofd')

    expect(opened).toMatchObject({
      name: 'invoice.ofd',
      path: 'invoice.ofd',
      content: '',
      kind: 'fixed-layout',
      language: 'binary',
      size: 5
    })
    await expect(
      service.readPreviewBytes('requirement-1', 'invoice.ofd')
    ).resolves.toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))
    await expect(
      service.writeFile({
        requirementId: 'requirement-1',
        path: 'invoice.ofd',
        content: 'replace',
        expectedVersion: opened.version
      })
    ).rejects.toThrow('Binary files are read-only')
  })

  it('opens selected PDF files through the fixed-layout preview path', async () => {
    const selectedFile = join(workspaceDirectory, 'resume.pdf')
    await writeFile(selectedFile, Buffer.from([0x25, 0x50, 0x44, 0x46]))

    const opened = await service.openSessionFiles([selectedFile])

    expect(opened.files[0]).toMatchObject({
      name: 'resume.pdf',
      path: 'resume.pdf',
      content: '',
      kind: 'fixed-layout',
      language: 'binary',
      size: 4
    })
    await expect(
      service.readPreviewBytes(opened.binding.requirementId, 'resume.pdf')
    ).resolves.toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
  })

  it('opens selected Office documents as read-only binary files', async () => {
    const selectedFile = join(workspaceDirectory, 'resume.docx')
    await writeFile(selectedFile, Buffer.from([0x50, 0x4b, 0x03, 0x04]))

    const opened = await service.openSessionFiles([selectedFile])

    expect(opened.files[0]).toMatchObject({
      name: 'resume.docx',
      path: 'resume.docx',
      content: '',
      kind: 'binary',
      language: 'binary',
      size: 4
    })
    await expect(
      service.writeFile({
        requirementId: opened.binding.requirementId,
        path: 'resume.docx',
        content: 'replace',
        expectedVersion: opened.files[0]!.version
      })
    ).rejects.toThrow('Binary files are read-only')
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

  it('tracks active RealmFlow writes under their managed directory', async () => {
    await writeFile(join(workspaceDirectory, 'artifact.md'), '# Result')
    let releaseWrite: (() => void) | undefined
    metadata.replaceManifestGate = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })

    const pendingWrite = service.writeManifest('requirement-1', {
      version: 1,
      requirementId: 'requirement-1',
      stages: {
        analysis: {
          artifacts: [{ path: 'artifact.md', primary: true }]
        }
      }
    })

    await vi.waitFor(async () => {
      await expect(
        service.hasActiveWrites(workspaceDirectory)
      ).resolves.toBe(true)
    })
    releaseWrite?.()
    await pendingWrite
    await expect(service.hasActiveWrites(workspaceDirectory)).resolves.toBe(
      false
    )
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

  it('resolves only files authorized by an ephemeral selection', async () => {
    const selectedFile = join(workspaceDirectory, 'selected.md')
    await writeFile(selectedFile, '# Selected')
    await writeFile(join(workspaceDirectory, 'private.md'), '# Private')
    const opened = await service.openSessionFiles([selectedFile])

    await expect(
      service.resolveSelectedFile(
        opened.binding.requirementId,
        'selected.md'
      )
    ).resolves.toBe(await realpath(selectedFile))
    await expect(
      service.resolveSelectedFile(opened.binding.requirementId, 'private.md')
    ).rejects.toThrow('File is not authorized for this session')
    await expect(
      service.resolveSelectedFile('session-missing', 'selected.md')
    ).rejects.toThrow('File selection is no longer available')
  })

  it('opens a folder through an ephemeral browseable workspace', async () => {
    await writeFile(join(workspaceDirectory, 'notes.md'), 'notes')

    const binding = await service.bindSessionDirectory(workspaceDirectory)

    expect(binding.requirementId).toMatch(/^session-/)
    await expect(
      service.getSessionDirectoryBinding(binding.requirementId)
    ).resolves.toEqual(binding)
    await expect(service.listDirectory(binding.requirementId)).resolves.toEqual([
      {
        name: 'notes.md',
        path: 'notes.md',
        type: 'file'
      }
    ])
    expect(metadata.bindings.has(binding.requirementId)).toBe(false)
  })

  it('does not treat requirement metadata as a session directory authorization', async () => {
    await expect(
      service.getSessionDirectoryBinding('requirement-1')
    ).resolves.toBeNull()
    await expect(
      service.getSessionDirectoryBinding('session-missing')
    ).resolves.toBeNull()
  })

  it('rejects a persisted session directory after it becomes unavailable', async () => {
    const binding = await service.bindSessionDirectory(workspaceDirectory)
    await expect(
      service.assertSessionDirectoryAvailable(binding.rootPath)
    ).resolves.toBeUndefined()

    await rm(workspaceDirectory, { recursive: true })

    await expect(
      service.assertSessionDirectoryAvailable(binding.rootPath)
    ).rejects.toThrow('绑定的文件夹不可用，请检查目录后重试')
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
