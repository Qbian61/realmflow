import { join } from 'node:path'
import { realpath } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import {
  APPLICATION_TOOL_HANDLER_NAMES,
  createBuiltinToolAdapter,
  type ApplicationToolHandlerName
} from './builtin-tool-runtime'

describe('builtin Tool runtime', () => {
  it('registers every non-computer builtin definition at startup', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definitions = catalog.flatMap(({ tools }) => tools)
    const adapter = createBuiltinToolAdapter(dependencies())

    expect(
      definitions.filter(({ executor }) => executor.kind === 'builtin')
    ).toHaveLength(110)
    expect(() => adapter.assertDefinitions(definitions)).not.toThrow()
  })

  it('registers the public web fetch Tool schema from the builtin catalog', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.web.fetch')

    expect(definition?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: { type: 'string', minLength: 1, maxLength: 4096 },
        mode: { type: 'string', enum: ['readable', 'raw_text'] },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000 },
        maxBytes: { type: 'integer', minimum: 1024, maximum: 1048576 },
        maxRedirects: { type: 'integer', minimum: 0, maximum: 10 }
      }
    })
    expect(definition?.capabilities).toEqual(['network.connect'])
    expect(() =>
      createBuiltinToolAdapter(dependencies()).assertDefinitions(
        definition ? [definition] : []
      )
    ).not.toThrow()
  })

  it('registers the provider-backed web search Tool schema from the builtin catalog', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.web.search')

    expect(definition?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 500 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
        language: { type: 'string', minLength: 2, maxLength: 16 },
        locale: { type: 'string', minLength: 2, maxLength: 32 },
        recency: { type: 'string', enum: ['day', 'week', 'month', 'year', 'any'] },
        safeSearch: { type: 'string', enum: ['strict', 'moderate', 'off'] },
        provider: { type: 'string', enum: ['searxng'] }
      }
    })
    expect(definition?.capabilities).toEqual(['network.connect'])
    expect(() =>
      createBuiltinToolAdapter(dependencies()).assertDefinitions(
        definition ? [definition] : []
      )
    ).not.toThrow()
  })

  it('registers a strict local document reader', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.documents.read')

    expect(definition?.description).toContain('PDF and DOCX')
    expect(definition?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['path']
    })
    expect(definition?.capabilities).toEqual(['filesystem.read'])
    expect(() =>
      createBuiltinToolAdapter(dependencies()).assertDefinitions(
        definition ? [definition] : []
      )
    ).not.toThrow()
  })

  it('registers strict Process Tool schemas from the builtin catalog', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definitions = new Map(
      catalog
        .flatMap(({ tools }) => tools)
        .filter(({ id }) => id.startsWith('builtin.process.'))
        .map((definition) => [definition.id, definition])
    )

    expect(definitions.get('builtin.process.discover')?.inputSchema)
      .toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['names']
      })
    expect(definitions.get('builtin.process.run')?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['executable'],
      properties: {
        executable: {
          type: 'string',
          anyOf: [
            { pattern: '^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$' },
            { pattern: '^/[A-Za-z0-9._+/-]{1,199}$' }
          ]
        },
        arguments: { type: 'array' },
        maxOutputBytes: {
          type: 'integer',
          minimum: 1024,
          maximum: 16 * 1024 * 1024
        },
        timeoutMs: {
          type: 'integer',
          minimum: 1000,
          maximum: 3600000
        }
      }
    })
    expect(
      definitions.get('builtin.process.run')?.inputSchema.properties
    ).not.toHaveProperty('command')
    expect(definitions.get('builtin.process.stop')?.inputSchema)
      .toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['processId']
      })
    expect(() =>
      createBuiltinToolAdapter(dependencies()).assertDefinitions([
        ...definitions.values()
      ])
    ).not.toThrow()
  })

  it('allows read-only PDF preview tools to ignore expectedRevision hints', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definitions = new Map(
      catalog
        .flatMap(({ tools }) => tools)
        .filter(
          ({ id }) =>
            id === 'builtin.pdf.thumbnail' || id === 'builtin.pdf.ocr'
        )
        .map((definition) => [definition.id, definition])
    )

    for (const id of ['builtin.pdf.thumbnail', 'builtin.pdf.ocr']) {
      expect(definitions.get(id)?.inputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['sessionId', 'pageNumber'],
        properties: {
          sessionId: expect.any(Object),
          expectedRevision: { type: 'integer', minimum: 0 },
          pageNumber: expect.any(Object)
        }
      })
    }
    expect(() =>
      createBuiltinToolAdapter(dependencies()).assertDefinitions([
        ...definitions.values()
      ])
    ).not.toThrow()
  })

  it('registers the conversation-scoped attachment chunk reader', () => {
    expect(APPLICATION_TOOL_HANDLER_NAMES).toContain('attachment.read_chunk')
  })

  it('plans session-backed effects through the Main session registry', async () => {
    const sessionPath = await realpath(join(process.cwd(), 'package.json'))
    const resolveSessionPath = vi.fn().mockResolvedValue(sessionPath)
    const adapter = createBuiltinToolAdapter({
      ...dependencies(),
      resolveSessionPath
    })
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.document.save')
    if (!definition) throw new Error('Missing fixture definition')
    const binding = await adapter.resolve(definition, {
      owner: { type: 'application', id: 'realmflow' },
      correlationId: 'correlation-1',
      causationId: 'command-1'
    })

    await expect(
      adapter.planEffects(binding, {
        executionId: 'execution-1',
        idempotencyKey: 'request-1',
        attemptId: 'attempt-1',
        attempt: 1,
        requestedBy: { type: 'user', id: 'local-user' },
        arguments: { sessionId: 'session-1', expectedRevision: 1 },
        scopeRoots: [process.cwd()],
        connectorGrants: []
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [{ kind: 'filesystem.write', path: sessionPath }]
    })
    expect(resolveSessionPath).toHaveBeenCalledWith('word', 'session-1')
  })

  it('delegates RealmFlow and Knowledge handlers to application ports', async () => {
    const dependencies_ = dependencies()
    const adapter = createBuiltinToolAdapter(dependencies_)
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.knowledge.search')
    if (!definition) throw new Error('Missing fixture definition')
    const context = {
      owner: { type: 'application' as const, id: 'realmflow' },
      workspaceId: 'workspace-1',
      correlationId: 'correlation-1',
      causationId: 'command-1'
    }
    const binding = await adapter.resolve(definition, context)

    await expect(
      adapter.execute(
        binding,
        {
          executionId: 'execution-1',
          idempotencyKey: 'request-1',
          attemptId: 'attempt-1',
          attempt: 1,
          requestedBy: { type: 'user', id: 'local-user' },
          arguments: { query: 'event sourcing' },
          scopeRoots: [],
          connectorGrants: []
        },
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'succeeded',
      output: { delegated: 'knowledge.search' }
    })
    expect(
      dependencies_.application['knowledge.search']
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: {
          query: 'event sourcing',
          workspaceId: 'workspace-1',
          scope: { kind: 'workspace', workspaceId: 'workspace-1' }
        },
        context
      })
    )
  })

  it('binds knowledge source reads to the Tool execution workspace', async () => {
    const dependencies_ = dependencies()
    const adapter = createBuiltinToolAdapter(dependencies_)
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.knowledge.source.read')
    if (!definition) throw new Error('Missing fixture definition')
    const context = {
      owner: { type: 'conversation' as const, id: 'conversation-1' },
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      causationId: 'command-1'
    }
    const binding = await adapter.resolve(definition, context)

    await adapter.execute(
      binding,
      {
        executionId: 'execution-1',
        idempotencyKey: 'request-1',
        attemptId: 'attempt-1',
        attempt: 1,
        requestedBy: { type: 'model', id: 'conversation-1' },
        arguments: { sourceId: 'source-1' },
        scopeRoots: [],
        connectorGrants: []
      },
      { emit: vi.fn() },
      new AbortController().signal
    )

    expect(
      dependencies_.application['knowledge.source.read']
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: {
          sourceId: 'source-1',
          workspaceId: 'workspace-1',
          conversationId: 'conversation-1'
        },
        context
      })
    )
  })

  it('binds RealmFlow Tool IDs to the trusted execution context', async () => {
    const dependencies_ = dependencies()
    const adapter = createBuiltinToolAdapter(dependencies_)
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.realmflow.artifacts.list')
    if (!definition) throw new Error('Missing fixture definition')
    const context = {
      owner: { type: 'node_run' as const, id: 'node-run-1' },
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      causationId: 'command-1'
    }
    const binding = await adapter.resolve(definition, context)

    await adapter.execute(
      binding,
      {
        executionId: 'execution-1',
        idempotencyKey: 'request-1',
        attemptId: 'attempt-1',
        attempt: 1,
        requestedBy: { type: 'model', id: 'conversation-1' },
        arguments: {
          requirementId: 'model-invented-requirement',
          workspaceId: 'model-invented-workspace'
        },
        scopeRoots: ['/requirements/requirement-1'],
        connectorGrants: []
      },
      { emit: vi.fn() },
      new AbortController().signal
    )

    expect(
      dependencies_.application['realmflow.artifacts.list']
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: {
          requirementId: 'requirement-1',
          workspaceId: 'workspace-1',
          nodeRunId: 'node-run-1',
          conversationId: 'conversation-1'
        },
        context
      })
    )
  })

  it('removes model-supplied context IDs that are not present in the trusted context', async () => {
    const dependencies_ = dependencies()
    const adapter = createBuiltinToolAdapter(dependencies_)
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.realmflow.artifacts.list')
    if (!definition) throw new Error('Missing fixture definition')
    const context = {
      owner: { type: 'application' as const, id: 'realmflow' },
      correlationId: 'correlation-1',
      causationId: 'command-1'
    }
    const binding = await adapter.resolve(definition, context)

    await adapter.execute(
      binding,
      {
        executionId: 'execution-1',
        idempotencyKey: 'request-1',
        attemptId: 'attempt-1',
        attempt: 1,
        requestedBy: { type: 'model', id: 'conversation-1' },
        arguments: {
          requirementId: 'model-invented-requirement',
          workspaceId: 'model-invented-workspace',
          nodeRunId: 'model-invented-node-run',
          conversationId: 'model-invented-conversation'
        },
        scopeRoots: [],
        connectorGrants: []
      },
      { emit: vi.fn() },
      new AbortController().signal
    )

    expect(
      dependencies_.application['realmflow.artifacts.list']
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: {},
        context
      })
    )
  })
})

function dependencies() {
  const application = Object.fromEntries(
    APPLICATION_TOOL_HANDLER_NAMES.map((name) => [
      name,
      vi.fn().mockResolvedValue({ delegated: name })
    ])
  ) as unknown as Record<
    ApplicationToolHandlerName,
    (input: unknown) => Promise<JsonObject>
  >
  return {
    files: { trashItem: vi.fn().mockResolvedValue(undefined) },
    documents: {
      extractor: {
        extract: vi.fn().mockResolvedValue({
          text: 'document',
          extraction: 'docx',
          characterCount: 8,
          truncated: false
        })
      },
      delivery: {
        create: vi.fn().mockResolvedValue({}),
        exportPdf: vi.fn().mockResolvedValue({}),
        verify: vi.fn().mockResolvedValue({})
      }
    },
    wordDocuments: {
      sessions: {
        open: vi.fn().mockResolvedValue({}),
        execute: vi.fn().mockResolvedValue({}),
        save: vi.fn().mockResolvedValue({})
      }
    },
    images: {
      sessions: {
        open: vi.fn().mockResolvedValue({}),
        transform: vi.fn().mockResolvedValue({}),
        ocr: vi.fn().mockResolvedValue({}),
        save: vi.fn().mockResolvedValue({})
      }
    },
    pdf: {
      sessions: {
        open: vi.fn().mockResolvedValue({}),
        thumbnail: vi.fn().mockResolvedValue({}),
        ocr: vi.fn().mockResolvedValue({}),
        mutate: vi.fn().mockResolvedValue({}),
        save: vi.fn().mockResolvedValue({})
      }
    },
    spreadsheets: {
      sessions: {
        open: vi.fn().mockResolvedValue({}),
        execute: vi.fn().mockResolvedValue({}),
        save: vi.fn().mockResolvedValue({})
      }
    },
    presentations: {
      sessions: {
        open: vi.fn().mockResolvedValue({}),
        execute: vi.fn().mockResolvedValue({}),
        save: vi.fn().mockResolvedValue({})
      }
    },
    legacyOffice: {
      importer: {
        import: vi.fn().mockResolvedValue({})
      }
    },
    officeSafeCopy: {
      safeCopy: {
        create: vi.fn().mockResolvedValue({})
      }
    },
    officeReadOnly: {
      sessions: {
        open: vi.fn().mockResolvedValue({})
      }
    },
    archives: {
      archives: {
        list: vi.fn().mockResolvedValue({}),
        extract: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    },
    fixedLayout: {
      fixedLayout: {
        inspect: vi.fn().mockResolvedValue({}),
        ocr: vi.fn().mockResolvedValue({})
      }
    },
    git: {
      run: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        truncated: false
      })
    },
    processes: {
      discover: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue({}),
      start: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue([]),
      stop: vi.fn().mockResolvedValue({})
    },
    application
  }
}
