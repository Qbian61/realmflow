import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CapabilityPackageService,
  type CapabilityPackageManifestSource
} from './capability-package-service'
import type { CapabilityRuntime } from '../../../../domain/capability'

let root: string
let userDataPath: string
let sourcePath: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'realmflow-capability-package-'))
  userDataPath = join(root, 'user-data')
  sourcePath = join(root, 'source')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('CapabilityPackageService', () => {
  it.each([
    [
      'tool',
      {
        kind: 'tool',
        definitionId: 'files.read'
      }
    ],
    [
      'skill',
      {
        kind: 'skill',
        instructionsPath: 'README.md',
        executable: false
      }
    ],
    [
      'agent',
      {
        kind: 'agent',
        promptPath: 'README.md',
        modelCapabilities: ['tool_calling'],
        reasoningModes: ['medium'],
        delegation: { allowed: false, maximumDepth: 0 }
      }
    ],
    [
      'connector',
      {
        kind: 'connector',
        connectorKind: 'http',
        credentialRefs: ['github-token'],
        configurationSchema: {
          type: 'object',
          properties: {
            baseUrl: { type: 'string' }
          }
        },
        actions: [connectorAction()]
      }
    ]
  ] as const)(
    'validates and stages a %s capability package',
    async (kind, runtime) => {
      await writePackage(
        sourcePath,
        manifest({
          kind,
          runtime: structuredClone(runtime) as CapabilityRuntime
        })
      )

      const prepared = await createService().prepare(sourcePath)

      expect(prepared.definition).toMatchObject({
        id: `com.example.${kind}`,
        kind,
        version: '1.0.0',
        runtime,
        source: 'local_upload'
      })
      expect(prepared.definition.manifestDigest).toMatch(/^[a-f0-9]{64}$/)
      expect(prepared.definition.definitionDigest).toMatch(/^[a-f0-9]{64}$/)
      expect(prepared.validationReport).toMatchObject({
        compatible: true,
        dependencyStatus: 'resolved',
        tests: [{ id: 'contract', status: 'passed' }]
      })
      expect(prepared.managedRelativePath).toBe(
        `capabilities/packages/${prepared.packageDigest}`
      )
      await expect(stat(prepared.pending.path)).resolves.toBeDefined()
      await prepared.pending.rollback()
    }
  )

  it('extracts zip input only into isolated staging', async () => {
    const archivePath = join(root, 'capability.zip')
    await writeFile(archivePath, 'archive')
    const extractArchive = vi.fn(async (_source: string, target: string) => {
      await writePackage(
        target,
        manifest({
          kind: 'skill',
          runtime: {
            kind: 'skill',
            instructionsPath: 'README.md',
            executable: false
          }
        })
      )
    })

    const prepared = await createService({ extractArchive }).prepare(
      archivePath
    )

    expect(extractArchive).toHaveBeenCalledOnce()
    expect(prepared.source.type).toBe('archive')
    await prepared.pending.rollback()
  })

  it('rejects path traversal and removes staging', async () => {
    await writePackage(
      sourcePath,
      manifest({
        kind: 'skill',
        runtime: {
          kind: 'skill',
          instructionsPath: '../outside.md',
          executable: false
        }
      })
    )

    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Capability package path is invalid'
    )
    await expect(
      stat(join(userDataPath, 'capabilities', '.staging', 'operation-1'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects symbolic links, sensitive files, and oversized packages', async () => {
    await writePackage(sourcePath, manifest())
    await symlink(join(sourcePath, 'README.md'), join(sourcePath, 'linked.md'))
    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Capability package contains an unsupported file'
    )

    await rm(sourcePath, { recursive: true, force: true })
    await writePackage(sourcePath, manifest())
    await writeFile(join(sourcePath, '.env'), 'TOKEN=secret')
    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Capability package contains a sensitive file'
    )

    await rm(sourcePath, { recursive: true, force: true })
    await writePackage(sourcePath, manifest())
    await expect(
      createService({ maxTotalBytes: 16 }).prepare(sourcePath)
    ).rejects.toThrow('Capability package is too large')
  })

  it('requires locked dependencies for source packages', async () => {
    await writePackage(sourcePath, manifest())
    await mkdir(join(sourcePath, 'src'))
    await writeFile(join(sourcePath, 'src', 'index.ts'), 'export {}\n')

    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Capability package source dependencies must be locked'
    )

    await mkdir(join(sourcePath, 'lockfiles'))
    await writeFile(join(sourcePath, 'lockfiles', 'package-lock.json'), '{}')
    const prepared = await createService().prepare(sourcePath)
    await prepared.pending.rollback()
  })

  it('rejects inline credentials without exposing the secret', async () => {
    const secret = 'top-secret-value'
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'http',
          credentialRefs: ['github-token'],
          actions: [],
          configurationSchema: {
            type: 'object',
            properties: {
              apiKey: { type: 'string', default: secret }
            }
          }
        }
      })
    )

    let message = ''
    try {
      await createService().prepare(sourcePath)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe(
      'Capability package cannot contain inline credentials'
    )
    expect(message).not.toContain(secret)
  })

  it('rejects an uploaded Connector package without declared actions', async () => {
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'http',
          credentialRefs: [],
          configurationSchema: { type: 'object' },
          actions: []
        }
      })
    )

    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Connector capability package requires at least one action'
    )
  })

  it('rejects plaintext credentials in source files', async () => {
    await writePackage(sourcePath, manifest())
    await mkdir(join(sourcePath, 'src'))
    await mkdir(join(sourcePath, 'lockfiles'))
    await writeFile(join(sourcePath, 'lockfiles', 'package-lock.json'), '{}')
    await writeFile(
      join(sourcePath, 'src', 'config.ts'),
      'const apiKey = "plaintext-secret-value"\n'
    )

    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Capability package cannot contain plaintext credentials'
    )
  })
})

function createService(
  options: {
    extractArchive?: (sourcePath: string, targetPath: string) => Promise<void>
    maxTotalBytes?: number
  } = {}
): CapabilityPackageService {
  let operation = 0
  return new CapabilityPackageService({
    userDataPath,
    realmFlowVersion: '0.1.0',
    platform: 'darwin',
    createId: () => `operation-${++operation}`,
    runTest: async ({ id }) => ({ id, status: 'passed' }),
    ...options
  })
}

async function writePackage(
  path: string,
  source: CapabilityPackageManifestSource
): Promise<void> {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'capability.yaml'), toYaml(source))
  await writeFile(join(path, 'README.md'), '# Capability\n')
}

function manifest(
  input: Partial<CapabilityPackageManifestSource> = {}
): CapabilityPackageManifestSource {
  const kind = input.kind ?? 'tool'
  return {
    schemaVersion: 1,
    id: `com.example.${kind}`,
    kind,
    version: '1.0.0',
    name: `Example ${kind}`,
    description: `Example ${kind} capability.`,
    runtime: { kind: 'tool', definitionId: 'files.read' },
    permissions: {
      capabilities: [],
      maximumRisk: 'low',
      pathPrefixes: [],
      networkTargets: []
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0 <1.0.0',
      platforms: ['darwin']
    },
    testPlan: [{ id: 'contract', command: 'fixture:contract' }],
    ...input
  } as CapabilityPackageManifestSource
}

function connectorAction() {
  return {
    id: 'search',
    name: 'Search',
    description: 'Search documentation.',
    operation: 'read' as const,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'low' as const,
    effects: ['external.read'],
    timeoutMs: 5_000,
    maxOutputBytes: 16_384,
    protocol: {
      kind: 'http' as const,
      baseUrl: 'https://docs.example.com',
      method: 'GET' as const,
      pathTemplate: '/search',
      authentication: { type: 'none' as const },
      allowedRedirectOrigins: []
    }
  }
}

function toYaml(value: CapabilityPackageManifestSource): string {
  return JSON.stringify(value, null, 2)
}
