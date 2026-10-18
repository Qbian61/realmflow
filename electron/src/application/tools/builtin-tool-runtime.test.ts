import { join } from 'node:path'
import { realpath } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import {
  browserError,
  type BrowserSession,
  type BrowserToolRuntimePort
} from '../browser/browser-runtime-port'
import type { ToolExecutionContext } from './tool-adapter'
import {
  APPLICATION_TOOL_HANDLER_NAMES,
  createBuiltinToolAdapter,
  type ApplicationToolHandlerName
} from './builtin-tool-runtime'

function owned(
  records: Map<string, BrowserSession>,
  id: string,
  ownerKey: string
): BrowserSession {
  const session = records.get(id)
  if (!session || session.ownerKey !== ownerKey) {
    throw browserError('owner', 'Browser session owner does not match')
  }
  return session
}

describe('builtin Tool runtime', () => {
  it('executes browser lifecycle through the adapter with trusted owner/workspace and safe errors', async () => {
    const records = new Map<string, BrowserSession>()
    const browser: BrowserToolRuntimePort = {
      createSession: async (call) => {
        const session: BrowserSession = {
          id: 'browser-created',
          profileId: 'browser-profile',
          ownerKey: call.ownerKey,
          status: 'active',
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
          executionId: call.executionId
        }
        records.set(session.id, session)
        return session
      },
      attachSession: async (profileId, call) => {
        const session: BrowserSession = {
          id: 'browser-attached',
          profileId,
          ownerKey: call.ownerKey,
          status: 'active',
          revision: 1,
          createdAt: 2,
          updatedAt: 2,
          executionId: call.executionId
        }
        records.set(session.id, session)
        return session
      },
      closeSession: async (id, call) => {
        const session = owned(records, id, call.ownerKey)
        records.set(id, {
          ...session,
          status: 'closed',
          revision: session.revision + 1,
          executionId: call.executionId
        })
      },
      execute: async (id, action, _args, call) => {
        owned(records, id, call.ownerKey)
        if (action === 'navigate') throw new Error('CDP failed secret-token-without-a-url')
        return { text: 'Ready' }
      }
    }
    const adapter = createBuiltinToolAdapter({ ...dependencies(), browser })
    const definitions = (await new BuiltinCatalogLoader(join(process.cwd(), 'resources/extensions/builtin')).load()).flatMap((p) => p.tools)
    const context: ToolExecutionContext = {
      owner: { type: 'conversation', id: 'one' }, workspaceId: 'workspace-one',
      correlationId: 'correlation', causationId: 'cause'
    }
    const execute = async (action: string, args: JsonObject, ctx = context) => {
      const definition = definitions.find((d) => d.id === `builtin.browser.${action}`)!
      const binding = await adapter.resolve(definition, ctx)
      return adapter.execute(binding, {
        executionId: `execution-${action}`, idempotencyKey: `key-${action}`, attemptId: 'attempt',
        attempt: 1, requestedBy: { type: 'model', id: 'model' }, arguments: args, scopeRoots: [], connectorGrants: []
      }, { emit: async () => {} }, new AbortController().signal)
    }
    const created = await execute('create', {})
    expect(created.outcome).toBe('succeeded')
    if (created.outcome !== 'succeeded') throw new Error('create failed')
    const sessionId = created.output.sessionId as string
    expect(sessionId).toMatch(/^browser-/)
    expect(created.output).not.toHaveProperty('ownerKey')
    expect(records.get(sessionId)?.executionId).toBe('execution-create')
    expect(await execute('snapshot', { sessionId })).toMatchObject({ outcome: 'succeeded', output: { text: 'Ready' } })
    expect(await execute('snapshot', { sessionId }, { ...context, workspaceId: 'workspace-two' })).toMatchObject({
      outcome: 'failed', error: { code: 'browser_owner' }
    })
    expect(await execute('snapshot', { sessionId }, { ...context, owner: { type: 'conversation', id: 'two' } })).toMatchObject({
      outcome: 'failed', error: { code: 'browser_owner' }
    })
    const failed = await execute('navigate', { sessionId, url: 'https://example.com' })
    expect(failed).toMatchObject({ outcome: 'failed', error: { code: 'browser_operation_failed' } })
    expect(JSON.stringify(failed)).not.toContain('secret-token')
    expect(await execute('close', { sessionId })).toMatchObject({ outcome: 'succeeded', output: { status: 'closed' } })
    expect(await execute('attach', { profileId: created.output.profileId })).toMatchObject({
      outcome: 'succeeded', output: { profileId: created.output.profileId, status: 'active' }
    })
  })

  it('registers every non-computer builtin definition at startup', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definitions = catalog.flatMap(({ tools }) => tools)
    const adapter = createBuiltinToolAdapter(dependencies())

    expect(
      definitions.filter(({ executor }) => executor.kind === 'builtin')
    ).toHaveLength(127)
    expect(() => adapter.assertDefinitions(definitions)).not.toThrow()
  })

  it('registers unified PDF generation Tool schemas from the builtin catalog', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definitions = catalog.flatMap(({ tools }) => tools)
    const deliverPdf = definitions.find(
      ({ id }) => id === 'builtin.document.deliver_pdf'
    )
    const saveAs = definitions.find(({ id }) => id === 'builtin.pdf.save_as')

    expect(deliverPdf?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['source', 'outputPath', 'expectedAbsent'],
      properties: {
        qualityPolicy: {
          type: 'string',
          enum: [
            'require_print_layout',
            'prefer_print_layout',
            'allow_degraded_text'
          ]
        },
        requireRenderSmokeTest: { type: 'boolean' }
      }
    })
    expect(saveAs?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'sessionId',
        'expectedRevision',
        'outputPath',
        'expectedAbsent'
      ]
    })
    expect(() =>
      createBuiltinToolAdapter(dependencies()).assertDefinitions(
        [deliverPdf, saveAs].filter(Boolean) as NonNullable<typeof deliverPdf>[]
      )
    ).not.toThrow()
  })

  it('fails startup contract verification when builtin definitions and registered handlers drift', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definitions = catalog.flatMap(({ tools }) => tools)
    const adapter = createBuiltinToolAdapter(dependencies())

    expect(() => adapter.assertExactDefinitions(definitions)).not.toThrow()
    expect(() =>
      adapter.assertExactDefinitions(
        definitions.filter(({ id }) => id !== 'builtin.web.fetch')
      )
    ).toThrow(
      'Builtin Tool handler has no catalog definition: web.fetch@1.0.0'
    )
    expect(() =>
      adapter.assertExactDefinitions(
        definitions.map((definition) =>
          definition.id === 'builtin.web.fetch'
            ? {
                ...definition,
                executor: {
                  ...definition.executor,
                  handlerVersion: '2.0.0'
                }
              }
            : definition
        )
      )
    ).toThrow('Builtin Tool handler is unavailable: web.fetch@2.0.0')
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
        safeSearch: { type: 'string', enum: ['strict', 'moderate', 'off'] }
      }
    })
    expect(definition?.inputSchema.properties).not.toHaveProperty('provider')
    expect(definition?.capabilities).toEqual(['credential.use', 'network.connect'])
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

  it('registers structured file search modes from the builtin catalog', async () => {
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.files.search')

    expect(definition?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        contentMode: {
          type: 'string',
          enum: ['text_only', 'structured_cached', 'structured_extract'],
          description: expect.stringContaining('structured_cached')
        }
      }
    })
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

  it('delegates knowledge searches with only domain query fields and trusted scope', async () => {
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
          scope: { kind: 'workspace', workspaceId: 'workspace-1' }
        },
        context
      })
    )
  })

  it('binds knowledge searches to the trusted requirement context without exposing context IDs as arguments', async () => {
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
      owner: { type: 'conversation' as const, id: 'conversation-1' },
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
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
        arguments: { query: 'release risk', topK: 3 },
        scopeRoots: [],
        connectorGrants: []
      },
      { emit: vi.fn() },
      new AbortController().signal
    )

    expect(
      dependencies_.application['knowledge.search']
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: {
          query: 'release risk',
          topK: 3,
          scope: { kind: 'workspace', workspaceId: 'workspace-1' },
          requirementId: 'requirement-1'
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

  it('binds knowledge note creation to trusted conversation context and generated IDs', async () => {
    const dependencies_ = dependencies()
    const adapter = createBuiltinToolAdapter(dependencies_)
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.knowledge.note.create')
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
        executionId: 'execution-create-note',
        idempotencyKey: 'request-create-note',
        attemptId: 'attempt-1',
        attempt: 1,
        requestedBy: { type: 'model', id: 'conversation-1' },
        arguments: {
          kind: 'decision',
          sourceMessageIds: ['message-1', 'message-2'],
          title: 'Decision',
          content: 'Use SQLite.'
        },
        scopeRoots: [],
        connectorGrants: []
      },
      { emit: vi.fn() },
      new AbortController().signal
    )

    expect(
      dependencies_.application['knowledge.note.create']
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: {
          id: 'knowledge-note-52eb0684a7a0066f9a4f66c4',
          versionId: 'knowledge-note-version-d7ffbf2f49fdf2474ddce2b5',
          workspaceId: 'workspace-1',
          sessionId: 'conversation-1',
          kind: 'decision',
          sourceMessageIds: ['message-1', 'message-2'],
          title: 'Decision',
          content: 'Use SQLite.'
        },
        context
      })
    )
  })

  it('binds knowledge note edits to generated version IDs and preserves concurrency fields', async () => {
    const dependencies_ = dependencies()
    const adapter = createBuiltinToolAdapter(dependencies_)
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.knowledge.note.edit')
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
        executionId: 'execution-edit-note',
        idempotencyKey: 'request-edit-note',
        attemptId: 'attempt-1',
        attempt: 1,
        requestedBy: { type: 'model', id: 'conversation-1' },
        arguments: {
          noteId: 'note-1',
          expectedRevision: 3,
          title: 'Updated decision',
          content: 'Use SQLite and Qdrant.'
        },
        scopeRoots: [],
        connectorGrants: []
      },
      { emit: vi.fn() },
      new AbortController().signal
    )

    expect(
      dependencies_.application['knowledge.note.edit']
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: {
          noteId: 'note-1',
          expectedRevision: 3,
          versionId: 'knowledge-note-version-f6a4c445a7eafdc0df4d654c',
          title: 'Updated decision',
          content: 'Use SQLite and Qdrant.'
        },
        context
      })
    )
  })

  it('rejects knowledge note creation without a trusted conversation context', async () => {
    const dependencies_ = dependencies()
    const adapter = createBuiltinToolAdapter(dependencies_)
    const catalog = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = catalog
      .flatMap(({ tools }) => tools)
      .find(({ id }) => id === 'builtin.knowledge.note.create')
    if (!definition) throw new Error('Missing fixture definition')
    const binding = await adapter.resolve(definition, {
      owner: { type: 'application' as const, id: 'realmflow' },
      workspaceId: 'workspace-1',
      correlationId: 'correlation-1',
      causationId: 'command-1'
    })

    await expect(
      adapter.execute(
        binding,
        {
          executionId: 'execution-create-note',
          idempotencyKey: 'request-create-note',
          attemptId: 'attempt-1',
          attempt: 1,
          requestedBy: { type: 'model', id: 'conversation-1' },
          arguments: {
            kind: 'decision',
            sourceMessageIds: ['message-1'],
            title: 'Decision',
            content: 'Use SQLite.'
          },
          scopeRoots: [],
          connectorGrants: []
        },
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'failed',
      error: {
        code: 'builtin_execution_failed',
        message: 'Knowledge Note conversation is unavailable',
        retryable: false
      }
    })
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
    files: {
      trashItem: vi.fn().mockResolvedValue(undefined),
      contentExtractor: {
        getCached: vi.fn().mockResolvedValue(undefined),
        extract: vi.fn().mockResolvedValue({
          sourceChecksum: `sha256:${'a'.repeat(64)}`,
          format: 'text',
          extractorVersion: 'text-v1',
          units: []
        })
      }
    },
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
      },
      pdfGeneration: {
        generate: vi.fn().mockResolvedValue({
          artifact: {},
          route: {}
        })
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
        save: vi.fn().mockResolvedValue({}),
        exportRevision: vi.fn().mockResolvedValue({})
      },
      pdfGeneration: {
        generate: vi.fn().mockResolvedValue({
          artifact: {},
          route: {}
        })
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
