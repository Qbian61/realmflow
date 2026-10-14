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
import type { ConnectorAction } from '../../../../domain/connector-runtime'

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
        configurationSchema: connectorConfigurationSchema(),
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
        contract: { status: 'passed', diagnostics: [] },
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

  it('rejects an uploaded Connector package whose model input contract is not described and strict', async () => {
    const runTest = vi.fn(async ({ id }: { id: string }) => ({
      id,
      status: 'passed' as const
    }))
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'http',
          credentialRefs: [],
          configurationSchema: connectorConfigurationSchema(),
          actions: [
            {
              ...connectorAction(),
              inputSchema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  query: { type: 'string' }
                }
              }
            }
          ]
        }
      })
    )

    await expect(createService({ runTest }).prepare(sourcePath)).rejects.toThrow(
      'Capability contract failed: com.example.connector.actions.search.inputSchema schema.description is required'
    )
    expect(runTest).not.toHaveBeenCalled()
  })

  it('rejects an uploaded Connector package whose model-visible fields omit usage guidance before running tests', async () => {
    const runTest = vi.fn(async ({ id }: { id: string }) => ({
      id,
      status: 'passed' as const
    }))
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'http',
          credentialRefs: [],
          configurationSchema: connectorConfigurationSchema(),
          actions: [
            {
              ...connectorAction(),
              inputSchema: {
                type: 'object',
                description: 'Arguments accepted by this Connector action.',
                additionalProperties: false,
                required: ['query'],
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search query sent as a URL query parameter.'
                  }
                },
                examples: [{ query: 'release notes' }]
              }
            }
          ]
        }
      })
    )

    await expect(createService({ runTest }).prepare(sourcePath)).rejects.toThrow(
      'Capability contract failed: com.example.connector.actions.search.inputSchema schema.properties.query.description must explain when the required field is required'
    )
    expect(runTest).not.toHaveBeenCalled()
  })

  it('rejects an uploaded Connector package whose action schema cannot satisfy the protocol', async () => {
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'http',
          credentialRefs: [],
          configurationSchema: connectorConfigurationSchema(),
          actions: [
            {
              ...connectorAction(),
              inputSchema: {
                type: 'object',
                description: 'Arguments accepted by this Connector action.',
                additionalProperties: false,
                properties: {
                  query: {
                    type: 'string',
                    description:
                      'Required. Search query sent as a URL query parameter when reading one document.'
                  }
                },
                required: ['query'],
                examples: [{ query: 'release notes' }]
              },
              protocol: {
                ...connectorAction().protocol,
                pathTemplate: '/documents/{documentId}'
              }
            }
          ]
        }
      })
    )

    await expect(createService().prepare(sourcePath)).rejects.toThrow(
      'Connector HTTP path parameter must be a required scalar input property'
    )
  })

  it('rejects an uploaded HTTP Connector package whose model inputs include credential refs', async () => {
    const runTest = vi.fn(async ({ id }: { id: string }) => ({
      id,
      status: 'passed' as const
    }))
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'http',
          credentialRefs: ['github-token'],
          configurationSchema: connectorConfigurationSchema(),
          actions: [
            {
              ...connectorAction(),
              inputSchema: {
                type: 'object',
                description: 'Arguments accepted by this Connector action.',
                additionalProperties: false,
                properties: {
                  'github-token': {
                    type: 'string',
                    description:
                      'Required. Incorrectly exposed credential reference supplied by the model.'
                  }
                },
                required: ['github-token'],
                examples: [{ 'github-token': 'credential-handle' }]
              },
              protocol: {
                ...connectorAction().protocol,
                authentication: {
                  type: 'bearer',
                  credentialRef: 'github-token'
                }
              }
            }
          ]
        }
      })
    )

    await expect(createService({ runTest }).prepare(sourcePath)).rejects.toThrow(
      'Connector HTTP credentials must not be model input properties'
    )
    expect(runTest).not.toHaveBeenCalled()
  })

  it('rejects an uploaded Database Connector package whose parameters drift from the statement before running tests', async () => {
    const runTest = vi.fn(async ({ id }: { id: string }) => ({
      id,
      status: 'passed' as const
    }))
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'database',
          credentialRefs: ['database-primary'],
          configurationSchema: connectorConfigurationSchema(),
          actions: [databaseConnectorAction()]
        }
      })
    )

    await expect(createService({ runTest }).prepare(sourcePath)).rejects.toThrow(
      'Connector Database parameters must match statement'
    )
    expect(runTest).not.toHaveBeenCalled()
  })

  it('rejects an uploaded CLI Connector package whose arguments drift from the input schema before running tests', async () => {
    const runTest = vi.fn(async ({ id }: { id: string }) => ({
      id,
      status: 'passed' as const
    }))
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'cli',
          credentialRefs: [],
          configurationSchema: connectorConfigurationSchema(),
          actions: [
            cliConnectorAction({
              inputSchema: {
                type: 'object',
                description:
                  'Arguments accepted by this CLI Connector action.',
                additionalProperties: false,
                properties: {
                  short: {
                    type: 'boolean',
                    description:
                      'Optional. Omit when full output is needed; when present maps to CLI flag "--short".'
                  },
                  porcelain: {
                    type: 'string',
                    description:
                      'Optional. Omit when porcelain output is not requested; when present maps to CLI flag "--porcelain".'
                  }
                },
                examples: [{ short: true, porcelain: 'v1' }]
              },
              protocol: {
                kind: 'cli',
                executable: '/usr/bin/git',
                subcommand: ['status'],
                argumentNames: ['short'],
                workingDirectory: 'workspace',
                environmentCredentialRefs: {}
              }
            })
          ]
        }
      })
    )

    await expect(createService({ runTest }).prepare(sourcePath)).rejects.toThrow(
      'Connector CLI arguments must match input schema'
    )
    expect(runTest).not.toHaveBeenCalled()
  })

  it('rejects an uploaded CLI Connector package whose argument descriptions omit flag mappings before running tests', async () => {
    const runTest = vi.fn(async ({ id }: { id: string }) => ({
      id,
      status: 'passed' as const
    }))
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'cli',
          credentialRefs: [],
          configurationSchema: connectorConfigurationSchema(),
          actions: [
            cliConnectorAction({
              inputSchema: {
                type: 'object',
                description:
                  'Arguments accepted by this CLI Connector action.',
                additionalProperties: false,
                properties: {
                  short: {
                    type: 'boolean',
                    description:
                      'Optional. Omit when full output is needed; when present enables short output.'
                  }
                },
                examples: [{ short: true }]
              }
            })
          ]
        }
      })
    )

    await expect(createService({ runTest }).prepare(sourcePath)).rejects.toThrow(
      'Connector CLI argument description must document flag mapping'
    )
    expect(runTest).not.toHaveBeenCalled()
  })

  it('rejects an uploaded CLI Connector package whose examples omit declared arguments before running tests', async () => {
    const runTest = vi.fn(async ({ id }: { id: string }) => ({
      id,
      status: 'passed' as const
    }))
    await writePackage(
      sourcePath,
      manifest({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'cli',
          credentialRefs: [],
          configurationSchema: connectorConfigurationSchema(),
          actions: [
            cliConnectorAction({
              inputSchema: {
                type: 'object',
                description:
                  'Arguments accepted by this CLI Connector action.',
                additionalProperties: false,
                properties: {
                  short: {
                    type: 'boolean',
                    description:
                      'Optional. Omit when full output is needed; when present maps to CLI flag "--short".',
                    examples: [true]
                  }
                },
                examples: [{}]
              }
            })
          ]
        }
      })
    )

    await expect(createService({ runTest }).prepare(sourcePath)).rejects.toThrow(
      'Connector CLI argument examples must cover every declared argument'
    )
    expect(runTest).not.toHaveBeenCalled()
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
    runTest?: (test: { id: string }) => Promise<{
      id: string
      status: 'passed' | 'failed'
      detail?: string
    }>
  } = {}
): CapabilityPackageService {
  let operation = 0
  return new CapabilityPackageService({
    userDataPath,
    realmFlowVersion: '0.1.0',
    platform: 'darwin',
    createId: () => `operation-${++operation}`,
    runTest: options.runTest ?? (async ({ id }) => ({ id, status: 'passed' })),
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
    inputSchema: {
      type: 'object',
      description: 'Arguments accepted by this Connector action.',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description:
            'Optional. Omit when listing all documentation; otherwise use the user supplied query as a URL query parameter.'
        }
      },
      examples: [{ query: 'release notes' }]
    },
    outputSchema: {
      type: 'object',
      description: 'JSON object returned by this Connector action.',
      additionalProperties: true
    },
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

function connectorConfigurationSchema() {
  return {
    type: 'object',
    description: 'Configuration accepted by this Connector.',
    additionalProperties: false,
    properties: {},
    examples: [{}]
  }
}

function databaseConnectorAction() {
  return {
    id: 'read_document',
    name: 'Read document',
    description: 'Read one document.',
    operation: 'read' as const,
    inputSchema: {
      type: 'object',
      description: 'Arguments accepted by this Connector action.',
      additionalProperties: false,
      properties: {
        id: {
          type: 'string',
          description:
            'Required. Document identifier selected from trusted database records.'
        },
        unused: {
          type: 'string',
          description:
            'Required. Parameter incorrectly omitted from the SQL statement.'
        }
      },
      required: ['id', 'unused'],
      examples: [{ id: 'doc-1', unused: 'stale' }]
    },
    outputSchema: {
      type: 'object',
      description: 'JSON object returned by this Connector action.',
      additionalProperties: true
    },
    risk: 'low' as const,
    effects: ['external.read'],
    timeoutMs: 5_000,
    maxOutputBytes: 16_384,
    protocol: {
      kind: 'database' as const,
      driver: 'sqlite' as const,
      access: 'read' as const,
      statement: 'SELECT title FROM documents WHERE id = :id',
      parameterNames: ['id', 'unused'],
      allowedTables: ['documents'],
      maxRows: 100,
      connectionRef: 'database-primary'
    }
  }
}

function cliConnectorAction(
  overrides: Partial<ConnectorAction> = {}
): ConnectorAction {
  return {
    ...baseCliConnectorAction(),
    ...overrides
  }
}

function baseCliConnectorAction(): ConnectorAction {
  return {
    id: 'status',
    name: 'Git status',
    description: 'Read repository status.',
    operation: 'read' as const,
    inputSchema: {
      type: 'object',
      description: 'Arguments accepted by this CLI Connector action.',
      additionalProperties: false,
      properties: {
        short: {
          type: 'boolean',
          description:
            'Optional. Omit when full output is needed; when present maps to CLI flag "--short".'
        }
      },
      examples: [{ short: true }]
    },
    outputSchema: {
      type: 'object',
      description: 'JSON object returned by this Connector action.',
      additionalProperties: true
    },
    risk: 'low' as const,
    effects: ['process.execute'],
    timeoutMs: 5_000,
    maxOutputBytes: 16_384,
    protocol: {
      kind: 'cli' as const,
      executable: '/usr/bin/git',
      subcommand: ['status'],
      argumentNames: ['short'],
      workingDirectory: 'workspace' as const,
      environmentCredentialRefs: {}
    }
  }
}

function toYaml(value: CapabilityPackageManifestSource): string {
  return JSON.stringify(value, null, 2)
}
