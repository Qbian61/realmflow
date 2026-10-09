import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtensionPackageService } from './extension-package-service'

let directory: string
let userDataPath: string
let sourcePath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-extension-package-'))
  userDataPath = join(directory, 'user-data')
  sourcePath = join(directory, 'source')
  await writeExtensionPackage(sourcePath)
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('ExtensionPackageService', () => {
  it('stages and validates a directory package without executing it', async () => {
    const service = createService()

    const prepared = await service.prepare(sourcePath)

    expect(prepared.manifest).toMatchObject({
      packageId: 'com.example.planning',
      version: '1.0.0',
    })
    expect(prepared.packageDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(prepared.tools).toEqual([])
    expect(prepared.skills).toHaveLength(1)
    expect(prepared.skills[0]).toMatchObject({
      id: 'com.example.planning.create',
      origin: 'local_upload',
      package: {
        packageId: 'com.example.planning',
        packageVersion: '1.0.0',
        packageDigest: prepared.packageDigest,
      },
    })
    expect(prepared.skills[0].definitionDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(prepared.byteSize).toBeGreaterThan(0)
    expect(prepared.fileCount).toBe(3)
    await expect(
      readFile(join(prepared.pending.path, 'instructions', 'plan.md'), 'utf8'),
    ).resolves.toBe('Create a grounded implementation plan.\n')
    await prepared.pending.rollback()
  })

  it('extracts a zip source into isolated staging before validation', async () => {
    const archivePath = join(directory, 'planning.zip')
    await writeFile(archivePath, 'archive')
    const extractArchive = vi.fn(async (_source: string, target: string) => {
      await writeExtensionPackage(target)
    })
    const service = createService({ extractArchive })

    const prepared = await service.prepare(archivePath)
    const canonicalArchivePath = await realpath(archivePath)

    expect(extractArchive).toHaveBeenCalledWith(
      canonicalArchivePath,
      prepared.pending.path,
    )
    expect(prepared.source).toEqual({
      type: 'archive',
      displayName: 'planning.zip',
    })
    await prepared.pending.rollback()
  })

  it('maps a legacy Python skill.json to a sandbox Tool and Skill', async () => {
    await rm(sourcePath, { recursive: true })
    await writeLegacyPythonSkill(sourcePath)
    const service = createService()

    const prepared = await service.prepare(sourcePath)

    expect(prepared.manifest).toMatchObject({
      packageId: 'com.example.legacy-python',
      name: 'Legacy Python',
    })
    expect(prepared.tools).toMatchObject([
      {
        id: 'com.example.legacy-python.execute',
        executor: {
          kind: 'sandbox',
          runtime: 'python',
          entryPath: 'main.py',
        },
        capabilities: ['filesystem.read', 'process.execute'],
      },
    ])
    expect(prepared.skills).toMatchObject([
      {
        id: 'com.example.legacy-python',
        requiredTools: [
          {
            toolId: 'com.example.legacy-python.execute',
            versionRange: '1.0.0',
            required: true,
          },
        ],
      },
    ])
    await prepared.pending.rollback()
  })

  it('rejects unsafe manifests and removes the staging directory', async () => {
    await writeFile(
      join(sourcePath, 'extension.json'),
      JSON.stringify({
        ...extensionManifest(),
        skills: [{ path: '../outside.json' }],
      }),
    )
    const service = createService()

    await expect(service.prepare(sourcePath)).rejects.toThrow(
      'Extension package skills path is invalid',
    )
    await expect(
      stat(join(userDataPath, 'extensions', '.staging', 'operation-1')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects missing definition resources and enforces size limits', async () => {
    await rm(join(sourcePath, 'instructions', 'plan.md'))
    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Skill instructions file is missing',
    )

    await writeExtensionPackage(sourcePath)
    await expect(
      createService({ maxFiles: 2 }).prepare(sourcePath),
    ).rejects.toThrow('Extension package contains too many files')
  })

  it('rejects an executable Skill whose fixed entry is missing', async () => {
    await writeFile(
      join(sourcePath, 'skills', 'planning.json'),
      JSON.stringify(
        {
          ...skillDefinitionSource(),
          runtime: {
            kind: 'executable',
            runtime: 'python',
            entryPath: 'runtime/main.py',
            capabilities: ['process.execute'],
            connectorServices: [],
            resources: {
              maxMemoryMb: 128,
              maxOutputBytes: 4096,
            },
          },
        },
        null,
        2,
      ),
    )

    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Skill executable entry file is missing',
    )
  })

  it('commits to a content-addressed directory and compensates rollback', async () => {
    const service = createService()
    const prepared = await service.prepare(sourcePath)

    const committed = await prepared.pending.commit()

    expect(committed.path).toBe(
      join(userDataPath, 'extensions', 'packages', prepared.packageDigest),
    )
    await expect(stat(committed.path)).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    })
    await expect(
      service.readSkillInstructions(prepared.skills[0]),
    ).resolves.toBe('Create a grounded implementation plan.\n')
    await prepared.pending.rollback()
    await expect(stat(committed.path)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('cleans abandoned staging and unreferenced package directories', async () => {
    const staging = join(userDataPath, 'extensions', '.staging', 'abandoned')
    const orphanDigest = 'a'.repeat(64)
    const referencedDigest = 'b'.repeat(64)
    await mkdir(staging, { recursive: true })
    await mkdir(join(userDataPath, 'extensions', 'packages', orphanDigest), {
      recursive: true,
    })
    await mkdir(
      join(userDataPath, 'extensions', 'packages', referencedDigest),
      { recursive: true },
    )
    const service = createService()

    await expect(service.recover(new Set([referencedDigest]))).resolves.toEqual(
      { stagingRemoved: 1, orphansRemoved: 1 },
    )
    await expect(stat(staging)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(userDataPath, 'extensions', 'packages', orphanDigest)),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(userDataPath, 'extensions', 'packages', referencedDigest)),
    ).resolves.toBeDefined()
  })
})

function createService(
  options: {
    extractArchive?: (sourcePath: string, targetPath: string) => Promise<void>
    maxFiles?: number
  } = {},
): ExtensionPackageService {
  let operation = 0
  return new ExtensionPackageService({
    userDataPath,
    realmFlowVersion: '0.1.0',
    platform: 'darwin',
    architecture: 'arm64',
    createId: () => `operation-${++operation}`,
    ...options,
  })
}

async function writeExtensionPackage(path: string): Promise<void> {
  await mkdir(join(path, 'skills'), { recursive: true })
  await mkdir(join(path, 'instructions'), { recursive: true })
  await writeFile(
    join(path, 'extension.json'),
    JSON.stringify(extensionManifest(), null, 2),
  )
  await writeFile(
    join(path, 'skills', 'planning.json'),
    JSON.stringify(skillDefinitionSource(), null, 2),
  )
  await writeFile(
    join(path, 'instructions', 'plan.md'),
    'Create a grounded implementation plan.\n',
  )
}

function extensionManifest() {
  return {
    schemaVersion: 1,
    packageId: 'com.example.planning',
    version: '1.0.0',
    name: 'Planning',
    description: 'Planning capabilities.',
    publisher: { name: 'Example' },
    compatibility: {
      realmflow: '>=0.1.0 <1.0.0',
      platforms: ['darwin'],
      architectures: ['arm64'],
    },
    tools: [],
    skills: [{ path: 'skills/planning.json' }],
    assets: ['instructions/plan.md'],
  }
}

function skillDefinitionSource() {
  return {
    schemaVersion: 1,
    id: 'com.example.planning.create',
    version: '1.0.0',
    name: 'Create plan',
    description: 'Create an implementation plan.',
    instructionsPath: 'instructions/plan.md',
    runtime: { kind: 'instruction' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    requiredTools: [],
    activation: {
      intents: ['create implementation plan'],
      contexts: ['general', 'requirement'],
    },
    limits: {
      maxToolCalls: 4,
      timeoutMs: 120_000,
    },
  }
}

async function writeLegacyPythonSkill(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await writeFile(
    join(path, 'skill.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'com.example.legacy-python',
      version: '1.0.0',
      name: 'Legacy Python',
      description: 'Run a legacy Python skill.',
      entry: { kind: 'python', path: 'main.py' },
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      permissions: ['filesystem.read', 'process.execute'],
      network: { required: false, services: [] },
      resources: {
        timeoutMs: 120_000,
        maxMemoryMb: 256,
        maxOutputBytes: 1_048_576,
      },
    }),
  )
  await writeFile(join(path, 'main.py'), 'print("legacy")\n')
}
