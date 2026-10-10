import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import {
  projectModelFacingToolCatalog,
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

async function catalogFixture() {
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

assertMode('direct')
assertMode('facade')
assertMode('directory')
