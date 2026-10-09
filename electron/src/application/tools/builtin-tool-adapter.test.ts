import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import {
  BuiltinToolAdapter,
  type BuiltinToolHandler
} from './builtin-tool-adapter'
import type {
  PreparedToolInvocation,
  ToolExecutionContext
} from './tool-adapter'

const context: ToolExecutionContext = {
  owner: { type: 'application', id: 'realmflow' },
  correlationId: 'correlation-1',
  causationId: 'command-1'
}

const invocation: PreparedToolInvocation = {
  executionId: 'execution-1',
  idempotencyKey: 'request-1',
  attemptId: 'attempt-1',
  attempt: 1,
  requestedBy: { type: 'user', id: 'local-user' },
  arguments: { path: 'README.md' },
  scopeRoots: ['/workspace'],
  connectorGrants: []
}

describe('BuiltinToolAdapter', () => {
  it('plans effects from the resolved immutable handler binding', async () => {
    const planEffects = vi.fn().mockResolvedValue({
      outcome: 'planned',
      effects: [{ kind: 'filesystem.read', path: '/workspace/README.md' }]
    })
    const adapter = new BuiltinToolAdapter(
      [handler('files.read', '1.0.0')],
      { planEffects }
    )
    const definition = definitionFor('files.read', '1.0.0')
    const binding = await adapter.resolve(definition, context)

    await expect(adapter.planEffects(binding, invocation)).resolves.toEqual({
      outcome: 'planned',
      effects: [{ kind: 'filesystem.read', path: '/workspace/README.md' }]
    })
    expect(planEffects).toHaveBeenCalledWith({
      handlerName: 'files.read',
      capabilities: definition.capabilities,
      arguments: invocation.arguments,
      scopeRoots: invocation.scopeRoots
    })
  })

  it('resolves and executes an exact handler version', async () => {
    const execute = vi.fn().mockResolvedValue({ content: 'hello' })
    const adapter = new BuiltinToolAdapter([
      handler('files.read', '1.0.0', execute)
    ])
    const definition = definitionFor('files.read', '1.0.0')
    const binding = await adapter.resolve(definition, context)
    const sink = { emit: vi.fn().mockResolvedValue(undefined) }

    await expect(adapter.prepare(binding, invocation)).resolves.toEqual({
      outcome: 'ready'
    })
    await expect(
      adapter.execute(
        binding,
        invocation,
        sink,
        new AbortController().signal
      )
    ).resolves.toEqual({
      outcome: 'succeeded',
      output: { content: 'hello' },
      metrics: {
        durationMs: expect.any(Number),
        outputBytes: 19
      }
    })
    expect(execute).toHaveBeenCalledWith({
      executionId: invocation.executionId,
      idempotencyKey: invocation.idempotencyKey,
      arguments: invocation.arguments,
      requestedBy: invocation.requestedBy,
      context,
      scopeRoots: ['/workspace'],
      connectorGrants: [],
      signal: expect.any(AbortSignal),
      sink
    })
  })

  it('previews and receipts filesystem writes without invoking during prepare', async () => {
    const execute = vi.fn().mockResolvedValue({ updated: true })
    const adapter = new BuiltinToolAdapter([
      handler('document.replace_text', '1.0.0', execute)
    ])
    const definition = {
      ...definitionFor('document.replace_text', '1.0.0'),
      id: 'builtin.document.replace_text',
      capabilities: ['filesystem.write']
    } satisfies ToolDefinition
    const writeInvocation: PreparedToolInvocation = {
      ...invocation,
      arguments: {
        sessionId: 'document-1',
        expectedRevision: 3,
        query: 'old',
        replacement: 'new'
      }
    }
    const binding = await adapter.resolve(definition, context)

    await expect(adapter.prepare(binding, writeInvocation)).resolves.toEqual({
      outcome: 'ready',
      preview: {
        mutationId: 'execution-1',
        idempotencyKey: 'request-1',
        toolId: 'builtin.document.replace_text',
        mode: 'preview',
        preconditions: [
          { kind: 'revision', target: 'document-1', value: 3 }
        ],
        operations: [
          { kind: 'document.replace_text', target: 'document-1' }
        ]
      }
    })
    expect(execute).not.toHaveBeenCalled()

    await expect(
      adapter.execute(
        binding,
        writeInvocation,
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'succeeded',
      output: {
        updated: true,
        mutation: {
          mutationId: 'execution-1',
          idempotencyKey: 'request-1',
          toolId: 'builtin.document.replace_text',
          mode: 'commit'
        }
      }
    })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({
          mutationId: 'execution-1',
          mode: 'commit'
        })
      })
    )
  })

  it('rejects missing, duplicate, and version-mismatched handlers', async () => {
    expect(
      () =>
        new BuiltinToolAdapter([
          handler('files.read', '1.0.0'),
          handler('files.read', '1.0.0')
        ])
    ).toThrow('Builtin Tool handler is already registered: files.read@1.0.0')

    const adapter = new BuiltinToolAdapter([
      handler('files.read', '2.0.0')
    ])
    await expect(
      adapter.resolve(definitionFor('files.read', '1.0.0'), context)
    ).rejects.toThrow('Builtin Tool handler is unavailable: files.read@1.0.0')
  })

  it('fails catalog validation when a builtin definition has no handler', () => {
    const adapter = new BuiltinToolAdapter([
      handler('files.read', '1.0.0')
    ])

    expect(() =>
      adapter.assertDefinitions([
        definitionFor('files.read', '1.0.0'),
        definitionFor('git.status', '1.0.0')
      ])
    ).toThrow('Builtin Tool handler is unavailable: git.status@1.0.0')
  })

  it('rejects forged bindings and already-aborted invocations', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true })
    const adapter = new BuiltinToolAdapter([
      handler('files.read', '1.0.0', execute)
    ])
    const binding = await adapter.resolve(
      definitionFor('files.read', '1.0.0'),
      context
    )
    const forged = { ...binding, definitionDigest: 'b'.repeat(64) }
    const controller = new AbortController()
    controller.abort()

    await expect(adapter.prepare(forged, invocation)).resolves.toMatchObject({
      outcome: 'unavailable',
      error: { code: 'binding_invalid' }
    })
    await expect(
      adapter.execute(
        binding,
        invocation,
        { emit: vi.fn() },
        controller.signal
      )
    ).resolves.toMatchObject({
      outcome: 'cancelled',
      metrics: { outputBytes: 0 }
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('enforces object output and the definition output byte limit', async () => {
    const adapter = new BuiltinToolAdapter([
      handler('files.read', '1.0.0', async () => ({
        content: 'x'.repeat(200)
      }))
    ])
    const binding = await adapter.resolve(
      definitionFor('files.read', '1.0.0', 32),
      context
    )

    await expect(
      adapter.execute(
        binding,
        invocation,
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'tool_output_limit' }
    })
  })

  it('preserves stable sandbox failure classifications from handlers', async () => {
    const failure = Object.assign(
      new Error('Process Tool execution timed out'),
      { code: 'tool_timeout' }
    )
    const adapter = new BuiltinToolAdapter([
      handler('process.run', '1.0.0', async () => {
        throw failure
      })
    ])
    const binding = await adapter.resolve(
      definitionFor('process.run', '1.0.0'),
      context
    )

    await expect(
      adapter.execute(
        binding,
        invocation,
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'failed',
      error: {
        code: 'tool_timeout',
        message: 'Process Tool execution timed out'
      }
    })
  })

  it('preserves stable local file failure classifications from handlers', async () => {
    const failure = Object.assign(new Error('File checksum conflict'), {
      code: 'file_conflict'
    })
    const adapter = new BuiltinToolAdapter([
      handler('files.write', '1.0.0', async () => {
        throw failure
      })
    ])
    const binding = await adapter.resolve(
      definitionFor('files.write', '1.0.0'),
      context
    )

    await expect(
      adapter.execute(
        binding,
        invocation,
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'failed',
      error: {
        code: 'file_conflict',
        message: 'File checksum conflict'
      }
    })
  })

  it.each([
    'archive_expanded_size_exceeded',
    'fixed_layout_ocr_unavailable',
    'office_safe_copy_output_conflict',
    'legacy_office_output_conflict',
    'word_read_only',
    'spreadsheet_revision_conflict',
    'presentation_read_only',
    'pdf_signed_read_only',
    'document_source_conflict',
    'artifact_verification_failed'
  ])('preserves the stable document error code %s', async (code) => {
    const adapter = new BuiltinToolAdapter([
      handler('documents.test', '1.0.0', async () => {
        throw Object.assign(new Error('Document operation failed'), { code })
      })
    ])
    const binding = await adapter.resolve(
      definitionFor('documents.test', '1.0.0'),
      context
    )

    await expect(
      adapter.execute(
        binding,
        invocation,
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'failed',
      error: { code }
    })
  })
})

function handler(
  name: string,
  version: string,
  execute: BuiltinToolHandler['execute'] = async () => ({ ok: true })
): BuiltinToolHandler {
  return { name, version, execute }
}

function definitionFor(
  handlerName: string,
  handlerVersion: string,
  maxOutputBytes = 1_024
): ToolDefinition {
  return {
    schemaVersion: 1,
    id: `builtin.${handlerName}`,
    version: '1.0.0',
    definitionDigest: 'a'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.files',
      packageVersion: '1.0.0',
      packageDigest: 'b'.repeat(64)
    },
    origin: 'builtin',
    name: handlerName,
    description: '',
    tags: [],
    executor: {
      kind: 'builtin',
      handler: handlerName,
      handlerVersion
    },
    inputSchema: {},
    outputSchema: {},
    capabilities: ['filesystem.read'],
    effects: [],
    risk: 'low',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 1_000,
      maxOutputBytes,
      maxAttempts: 1
    },
    discovery: { intents: [], contexts: ['general'] }
  }
}
