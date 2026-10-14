import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { projectProviderToolSchema } from '../../ai-run/application/provider-tool-schema'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import { compileRuntimeToolInputSchema } from './model-tool-contract-compiler'
import {
  projectModelFacingToolCatalog,
  resolveModelFacingFacadeInvocation,
  type ToolModelFacingMode
} from './tool-model-facing-projection'

describe('projectModelFacingToolCatalog', () => {
  it('keeps primitive Tools unchanged in direct mode', async () => {
    const catalog = await catalogFixture()

    const projected = projectModelFacingToolCatalog(catalog, 'direct')

    expect(projected.tools.map(({ id }) => id)).toEqual(
      catalog.tools.map(({ id }) => id)
    )
    expect(
      projected.tools.find(({ id }) => id === 'builtin.files.read')
        ?.modelFacing
    ).toMatchObject({
      mode: 'direct',
      kind: 'primitive',
      visibility: 'direct'
    })
  })

  it('omits runtime degraded and unavailable Tools from every model-facing projection', async () => {
    const catalog = await catalogFixture()
    catalog.tools = catalog.tools.map((tool) => {
      if (tool.id === 'builtin.web.search') {
        return {
          ...tool,
          status: 'unavailable' as const,
          runtimeEligibility: {
            status: 'unavailable' as const,
            reasonCode: 'web_search_disabled',
            checkedAt: 1_000,
            expiresAt: 31_000,
            dependencyRevision: 'web-provider:7',
          },
        }
      }
      if (tool.id === 'builtin.office.import_legacy') {
        return {
          ...tool,
          status: 'degraded' as const,
          runtimeEligibility: {
            status: 'degraded' as const,
            reasonCode: 'local_dependency_degraded',
            checkedAt: 2_000,
            expiresAt: 32_000,
            dependencyRevision: 'libreoffice:fallback',
          },
        }
      }
      return tool
    })

    for (const mode of ['direct', 'facade', 'directory'] as const) {
      const toolIds = projectModelFacingToolCatalog(catalog, mode).tools.map(
        ({ id }) => id
      )

      expect(toolIds).not.toContain('builtin.web.search')
      expect(toolIds).not.toContain('builtin.office.import_legacy')
    }
  })


  it('preserves builtin input examples in the direct model-facing view', async () => {
    const catalog = await catalogFixture()

    const projected = projectModelFacingToolCatalog(catalog, 'direct')
    const schema = projected.tools.find(({ id }) => id === 'builtin.files.read')
      ?.definition.inputSchema as {
      examples?: unknown[]
      properties?: Record<string, { description?: string; examples?: unknown[] }>
    }

    expect(schema.examples).toEqual([
      expect.objectContaining({
        path: 'docs/example.md',
        offset: 0,
        limit: 1
      })
    ])
    expect(schema.properties?.offset).toMatchObject({
      description: 'Byte offset where bounded UTF-8 text reading begins.',
      examples: [0]
    })
  })
  it('projects P0 facade Tools and marks covered primitives as facade-backed', async () => {
    const catalog = await catalogFixture()


    const projected = projectModelFacingToolCatalog(catalog, 'facade')

    expect(projected.tools.map(({ id }) => id).slice(0, 30)).toEqual([
      'ask_user',
      'secrets',
      'sessions',
      'subagents',
      'progress_card',
      'capabilities',
      'gateway',
      'automation',
      'session_status',
      'sessions_history',
      'sessions_send',
      'goal',
      'steer',
      'sessions_spawn',
      'sessions_yield',
      'agents_list',
      'filesystem_read',
      'filesystem_write',
      'filesystem_delete',
      'git_read',
      'git_commit',
      'process',
      'realmflow_context',
      'realmflow_node_action',
      'document',
      'spreadsheet',
      'presentation',
      'pdf',
      'image',
      'archive'
    ])
    expect(projected.tools.find(({ id }) => id === 'ask_user'))
      .toMatchObject({
        kind: 'tool',
        status: 'enabled',
        definition: {
          inputSchema: {
            required: ['prompt'],
            properties: {
              prompt: { type: 'string', minLength: 1 },
              responseType: {
                type: 'string',
                enum: ['text', 'choice', 'confirmation']
              }
            }
          }
        },
        modelFacing: {
          mode: 'facade',
          kind: 'facade',
          visibility: 'direct',
          coveredPrimitiveToolIds: [],
          maxRisk: 'low'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'secrets')?.definition.inputSchema)
      .toMatchObject({
        required: ['action', 'name'],
        properties: {
          action: { type: 'string', enum: ['request', 'resolve'] },
          name: { type: 'string', minLength: 1 }
        }
      })
    expect(projected.tools.find(({ id }) => id === 'sessions')?.definition.inputSchema)
      .toMatchObject({
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'search']
          }
        }
      })
    expect(projected.tools.find(({ id }) => id === 'subagents')?.definition.inputSchema)
      .toMatchObject({
        required: ['tasks'],
        properties: {
          tasks: { type: 'array', minItems: 1 }
        }
      })
    expect(projected.tools.find(({ id }) => id === 'progress_card')?.definition.inputSchema)
      .toMatchObject({
        required: ['cardId', 'status', 'message', 'expectedRevision'],
        properties: {
          cardId: { type: 'string', minLength: 1 },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'blocked', 'completed', 'failed']
          }
        }
      })
    expect(projected.tools.find(({ id }) => id === 'capabilities')?.definition.inputSchema)
      .toMatchObject({
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['search', 'inspect', 'install', 'enable', 'disable', 'upgrade', 'rollback']
          }
        }
      })
    expect(projected.tools.find(({ id }) => id === 'filesystem_read'))
      .toMatchObject({
        kind: 'tool',
        status: 'enabled',
        modelFacing: {
          mode: 'facade',
          kind: 'facade',
          visibility: 'direct',
          coveredPrimitiveToolIds: [
            'builtin.documents.read',
            'builtin.files.list',
            'builtin.files.read',
            'builtin.files.search',
            'builtin.files.stat'
          ],
          maxRisk: 'low'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'builtin.files.read'))
      .toMatchObject({
        modelFacing: {
          mode: 'facade',
          kind: 'primitive',
          visibility: 'facade_backed',
          facadeId: 'filesystem_read'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'document')).toMatchObject({
      modelFacing: {
        mode: 'facade',
        kind: 'facade',
        visibility: 'direct',
        coveredPrimitiveToolIds: expect.arrayContaining([
          'builtin.document.replace_text',
          'builtin.artifact.verify'
        ]),
        maxRisk: 'medium'
      }
    })
    expect(projected.tools.find(({ id }) => id === 'presentation'))
      .toMatchObject({
        modelFacing: {
          kind: 'facade',
          maxRisk: 'high'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'image')).toMatchObject({
      modelFacing: {
        kind: 'facade',
        maxRisk: 'high'
      }
    })
    expect(projected.tools.find(({ id }) => id === 'builtin.document.replace_text'))
      .toMatchObject({
        modelFacing: {
          mode: 'facade',
          kind: 'primitive',
          visibility: 'facade_backed',
          facadeId: 'document'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'builtin.spreadsheet.read_range'))
      .toMatchObject({
        modelFacing: {
          visibility: 'facade_backed',
          facadeId: 'spreadsheet'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'builtin.presentation.delete_slide'))
      .toMatchObject({
        modelFacing: {
          visibility: 'facade_backed',
          facadeId: 'presentation'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'builtin.pdf.watermark'))
      .toMatchObject({
        modelFacing: {
          visibility: 'facade_backed',
          facadeId: 'pdf'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'builtin.image.redact'))
      .toMatchObject({
        modelFacing: {
          visibility: 'facade_backed',
          facadeId: 'image'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'builtin.archives.extract'))
      .toMatchObject({
        modelFacing: {
          visibility: 'facade_backed',
          facadeId: 'archive'
        }
      })
  })

  it('compiles facade input contracts from covered primitive tool schemas', async () => {
    const catalog = await catalogFixture()

    const projected = projectModelFacingToolCatalog(catalog, 'facade')
    const filesystemRead = projected.tools.find(({ id }) => id === 'filesystem_read')
    const schema = filesystemRead?.definition.inputSchema

    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['action', 'arguments'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'read_document', 'search', 'stat']
        }
      },
      oneOf: expect.arrayContaining([
        expect.objectContaining({
          properties: {
            action: { const: 'read' },
            arguments: expect.objectContaining({
              required: ['path'],
              properties: expect.objectContaining({
                path: expect.objectContaining({ type: 'string', minLength: 1 })
              })
            })
          }
        }),
        expect.objectContaining({
          properties: {
            action: { const: 'search' },
            arguments: expect.objectContaining({
              required: ['query'],
              properties: expect.objectContaining({
                contentMode: expect.objectContaining({
                  type: 'string',
                  enum: ['text_only', 'structured_cached', 'structured_extract']
                })
              })
            })
          }
        }),
        expect.objectContaining({
          properties: {
            action: { const: 'stat' },
            arguments: expect.objectContaining({
              properties: expect.objectContaining({
                path: expect.objectContaining({ type: 'string', minLength: 1 }),
                paths: expect.objectContaining({
                  type: 'array',
                  minItems: 1
                })
              }),
              oneOf: expect.arrayContaining([
                expect.objectContaining({ required: ['path'] }),
                expect.objectContaining({ required: ['paths'] })
              ])
            })
          }
        })
      ])
    })
  })

  it('projects facade provider contracts with action-specific runtime constraints', async () => {
    const catalog = await catalogFixture()

    const projected = projectModelFacingToolCatalog(catalog, 'facade')
    const filesystemRead = projected.tools.find(({ id }) => id === 'filesystem_read')
    if (!filesystemRead) throw new Error('Missing filesystem_read facade')

    const providerSchema = projectProviderToolSchema(
      filesystemRead.definition.inputSchema
    )

    expect(providerSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['action', 'arguments'],
      properties: {
        action: {
          enum: ['list', 'read', 'read_document', 'search', 'stat']
        },
        arguments: {
          type: 'object',
          additionalProperties: false,
          properties: expect.objectContaining({
            path: expect.objectContaining({ type: 'string', minLength: 1 }),
            paths: expect.objectContaining({ type: 'array', minItems: 1 }),
            query: expect.objectContaining({ type: 'string', minLength: 1 }),
            contentMode: expect.objectContaining({
              type: 'string',
              enum: ['text_only', 'structured_cached', 'structured_extract']
            })
          })
        }
      }
    })
    const validate = new Ajv2020({ strict: true }).compile(providerSchema)
    expect(validate({ action: 'read', arguments: { path: 'docs/a.md' } }))
      .toBe(true)
    expect(validate({ action: 'stat', arguments: { paths: ['docs/a.md'] } }))
      .toBe(true)
    expect(validate({ action: 'read', arguments: { query: 'routing' } }))
      .toBe(false)
    expect(validate({ action: 'stat', arguments: {} })).toBe(false)
    expect(validate({ action: 'missing', arguments: { path: 'docs/a.md' } }))
      .toBe(false)
  })

  it('keeps filesystem write create and replace requirements visible to providers', async () => {
    const catalog = await catalogFixture()

    const projected = projectModelFacingToolCatalog(catalog, 'facade')
    const filesystemWrite = projected.tools.find(({ id }) => id === 'filesystem_write')
    if (!filesystemWrite) throw new Error('Missing filesystem_write facade')

    const providerSchema = projectProviderToolSchema(
      filesystemWrite.definition.inputSchema
    )
    const validate = new Ajv2020({ strict: true }).compile(providerSchema)

    expect(validate({
      action: 'write',
      arguments: {
        path: 'docs/a.md',
        mode: 'create',
        content: 'hello',
        expectedAbsent: true
      }
    })).toBe(true)
    expect(validate({
      action: 'write',
      arguments: {
        path: 'docs/a.md',
        mode: 'replace',
        content: 'hello',
        expectedChecksum:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    })).toBe(true)
    expect(validate({
      action: 'write',
      arguments: {
        path: 'docs/a.md',
        mode: 'create',
        content: 'hello'
      }
    })).toBe(false)
    expect(validate({
      action: 'write',
      arguments: {
        path: 'docs/a.md',
        mode: 'replace',
        content: 'hello',
        expectedAbsent: true
      }
    })).toBe(false)
  })

  it('validates every facade action example against provider and primitive runtime schemas', async () => {
    const catalog = await catalogFixture()
    const projected = projectModelFacingToolCatalog(catalog, 'facade')
    const ajv = new Ajv2020({ strict: true, allErrors: true })

    for (const facade of projected.tools.filter(
      ({ modelFacing }) =>
        modelFacing?.kind === 'facade' &&
        modelFacing.coveredPrimitiveToolIds.length > 0
    )) {
      const providerValidate = ajv.compile(
        projectProviderToolSchema(facade.definition.inputSchema)
      )
      const branches = Array.isArray(facade.definition.inputSchema.oneOf)
        ? facade.definition.inputSchema.oneOf.filter(isJsonObject)
        : []
      expect(branches.length, facade.id).toBeGreaterThan(0)

      for (const branch of branches) {
        const properties = branch.properties
        if (!isJsonObject(properties)) {
          throw new Error(`Missing facade branch properties: ${facade.id}`)
        }
        const action = branchAction(properties.action)
        const argumentsSchema = properties.arguments
        if (!isJsonObject(argumentsSchema)) {
          throw new Error(`Missing facade branch arguments: ${facade.id}.${action}`)
        }
        const input = {
          action,
          arguments: sampleFromSchema(argumentsSchema)
        }
        expect(providerValidate(input), `${facade.id}.${action} provider`)
          .toBe(true)
        const invocation = resolveModelFacingFacadeInvocation(
          catalog,
          {
            kind: 'tool',
            id: facade.definition.id,
            version: facade.definition.version,
            digest: facade.definition.definitionDigest
          },
          input
        )
        if (!invocation) {
          throw new Error(`Missing facade invocation: ${facade.id}.${action}`)
        }
        const primitiveValidate = ajv.compile(
          compileRuntimeToolInputSchema(invocation.primitiveDefinition.inputSchema)
        )
        expect(
          primitiveValidate(invocation.primitiveInput),
          `${facade.id}.${action} primitive`
        ).toBe(true)
      }
    }
  })

  it('publishes knowledge note create and edit as precise model-visible contracts', async () => {
    const catalog = await catalogFixture()

    const projected = projectModelFacingToolCatalog(catalog, 'facade')
    const create = projected.tools.find(
      ({ id }) => id === 'builtin.knowledge.note.create'
    )
    const edit = projected.tools.find(
      ({ id }) => id === 'builtin.knowledge.note.edit'
    )

    expect(projected.tools.find(({ id }) => id === 'builtin.knowledge.note.save'))
      .toBeUndefined()
    expect(create?.definition.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'sourceMessageIds', 'title', 'content'],
      properties: {
        kind: {
          type: 'string',
          enum: ['conversation_note', 'decision', 'retrospective']
        },
        sourceMessageIds: { type: 'array', minItems: 1 },
        title: { type: 'string', minLength: 1 },
        content: { type: 'string', minLength: 1 }
      }
    })
    expect(JSON.stringify(create?.definition.inputSchema)).not.toMatch(
      /workspaceId|sessionId|versionId/
    )
    expect(projectProviderToolSchema(create!.definition.inputSchema))
      .toMatchObject({
        required: ['kind', 'sourceMessageIds', 'title', 'content']
      })
    expect(edit?.definition.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['noteId', 'expectedRevision', 'title', 'content'],
      properties: {
        noteId: { type: 'string', minLength: 1 },
        expectedRevision: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
        content: { type: 'string', minLength: 1 }
      }
    })
    expect(JSON.stringify(edit?.definition.inputSchema)).not.toContain(
      'versionId'
    )
  })

  it('exposes strict orchestration commands in facade and directory views with no client identity fields', async () => {
    const catalog = await catalogFixture()
    for (const mode of ['facade', 'directory'] as const) {
      const tools = projectModelFacingToolCatalog(catalog, mode).tools
      for (const id of ['session_status', 'sessions_history', 'sessions_send', 'goal', 'steer', 'sessions_spawn', 'sessions_yield', 'agents_list']) {
        const tool = tools.find((item) => item.id === id)
        expect(tool?.status).toBe('enabled')
        expect(tool?.modelFacing?.visibility).toBe('direct')
        expect(JSON.stringify(tool?.definition.inputSchema)).not.toMatch(/sourceRunId|rootRunId|parentRunId/)
      }
      expect(tools.find(({ id }) => id === 'sessions_send')?.definition.inputSchema)
        .toMatchObject({ additionalProperties: false, required: ['sessionId', 'message'] })
    }
  })

  it('projects directory mode as catalog controls plus directory-only primitives', async () => {
    const catalog = await catalogFixture()

    const projected = projectModelFacingToolCatalog(catalog, 'directory')

    expect(projected.tools.map(({ id }) => id).slice(0, 10)).toEqual([
      'tool_search',
      'tool_describe',
      'tool_call',
      'ask_user',
      'secrets',
      'sessions',
      'subagents',
      'progress_card',
      'capabilities',
      'gateway'
    ])
    expect(projected.tools.find(({ id }) => id === 'progress_card'))
      .toMatchObject({
        modelFacing: {
          mode: 'directory',
          kind: 'facade',
          visibility: 'direct'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'builtin.git.status'))
      .toMatchObject({
        modelFacing: {
          mode: 'directory',
          kind: 'primitive',
          visibility: 'directory_only'
        }
      })
    expect(projected.tools.find(({ id }) => id === 'tool_search')?.definition.inputSchema)
      .toMatchObject({
        required: ['query'],
        properties: {
          query: { oneOf: [
            { type: 'string', minLength: 1, maxLength: 500 },
            { type: 'array', minItems: 1, maxItems: 8,
              items: { type: 'string', minLength: 1, maxLength: 500 } },
          ] },
          limit: { type: 'integer', minimum: 1, maximum: 50 }
        }
      })
    expect(projected.tools.find(({ id }) => id === 'tool_describe')?.definition.inputSchema)
      .toMatchObject({
        required: ['id'],
        properties: {
          id: { type: 'string', minLength: 1 }
        }
      })
    expect(projected.tools.find(({ id }) => id === 'tool_call')?.definition.inputSchema)
      .toMatchObject({
        required: ['id', 'args'],
        properties: {
          id: { type: 'string', minLength: 1 },
          args: { type: 'object', additionalProperties: true }
        }
      })
  })

  it('projects the proposal-only Gateway Runtime control', async () => {
    const projected = projectModelFacingToolCatalog(
      await catalogFixture(),
      'facade'
    )

    expect(projected.tools.find(({ id }) => id === 'gateway')).toMatchObject({
      status: 'enabled',
      definition: {
        capabilities: ['realmflow.read'],
        effects: ['runtime.gateway'],
        risk: 'medium',
        inputSchema: {
          additionalProperties: false,
          required: ['action'],
          properties: {
            action: {
              enum: [
                'health',
                'config_schema_lookup',
                'config_get',
                'config_patch_proposal',
                'restart_proposal',
                'update_check'
              ]
            },
            patches: {
              type: 'array',
              maxItems: 20
            }
          }
        }
      },
      modelFacing: {
        mode: 'facade',
        kind: 'facade',
        visibility: 'direct'
      }
    })
  })

  it('projects the read and proposal-only Automation Runtime control', async () => {
    const projected = projectModelFacingToolCatalog(
      await catalogFixture(),
      'facade'
    )

    expect(projected.tools.find(({ id }) => id === 'automation')).toMatchObject({
      status: 'enabled',
      definition: {
        capabilities: ['realmflow.read'],
        effects: ['runtime.automation'],
        risk: 'medium',
        inputSchema: {
          additionalProperties: false,
          required: ['action'],
          properties: {
            action: {
              enum: [
                'status',
                'list',
                'runs',
                'heartbeat',
                'create_proposal',
                'update_proposal',
                'pause_proposal',
                'resume_proposal'
              ]
            }
          }
        }
      }
    })
  })

  it('keeps destructive and explicit-selection tools direct in directory mode', async () => {
    const projected = projectModelFacingToolCatalog(await catalogFixture(), 'directory')
    expect(projected.tools.find(({ id }) => id === 'builtin.files.delete_permanently'))
      .toMatchObject({ modelFacing: { visibility: 'direct' } })
    expect(projected.tools.filter(({ definition }) => definition.risk === 'high')
      .every((tool) => tool.modelFacing?.visibility === 'direct')).toBe(true)
  })
})

async function catalogFixture(): Promise<ToolCatalogState> {
  const packages = await new BuiltinCatalogLoader(
    join(process.cwd(), 'resources', 'extensions', 'builtin')
  ).load()
  return {
    packages: [],
    tools: packages.flatMap(({ tools }) =>
      tools.map((definition) => ({
        kind: 'tool' as const,
        id: definition.id,
        version: definition.version,
        definitionDigest: definition.definitionDigest,
        definition,
        enabledPreference: true,
        status: 'enabled' as const,
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      }))
    ),
    skills: []
  }
}

function assertMode(_mode: ToolModelFacingMode): void {
  // Compile-time assertion for the exported mode union.
}

function branchAction(value: unknown): string {
  if (!isJsonObject(value)) {
    throw new Error('Facade branch action schema must be an object')
  }
  if (typeof value.const === 'string') return value.const
  if (Array.isArray(value.enum) && typeof value.enum[0] === 'string') {
    return value.enum[0]
  }
  throw new Error('Facade branch action schema must define const or enum')
}

function sampleFromSchema(schema: JsonObject): unknown {
  const examples = Array.isArray(schema.examples) ? schema.examples : []
  if (examples.length > 0) return examples[0]
  if (schema.const !== undefined) return schema.const
  if (Array.isArray(schema.enum)) return schema.enum[0]
  if (Array.isArray(schema.oneOf)) {
    const candidate = schema.oneOf.find(isJsonObject)
    if (candidate) return sampleFromSchema(candidate)
  }
  if (Array.isArray(schema.anyOf)) {
    const candidate = schema.anyOf.find(isJsonObject)
    if (candidate) return sampleFromSchema(candidate)
  }
  if (schema.type === 'object') {
    const properties = isJsonObject(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : Object.keys(properties)
    return Object.fromEntries(
      required.map((name) => {
        const property = properties[name]
        return [
          name,
          isJsonObject(property) ? sampleFromSchema(property) : 'value'
        ]
      })
    )
  }
  if (schema.type === 'array') {
    return [isJsonObject(schema.items) ? sampleFromSchema(schema.items) : 'value']
  }
  if (schema.type === 'integer') return schema.minimum ?? 1
  if (schema.type === 'number') return schema.minimum ?? 1
  if (schema.type === 'boolean') return true
  if (schema.type === 'null') return null
  return 'value'
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

assertMode('direct')
assertMode('facade')
assertMode('directory')
