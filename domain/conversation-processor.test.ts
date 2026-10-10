import { describe, expect, it, vi } from 'vitest'
import {
  ConversationProcessorPipeline,
  createBuiltinConversationProcessors,
  type ConversationProcessingInput,
  type ConversationProcessor
} from './conversation-processor'

const baseInput: ConversationProcessingInput = {
  messageId: 'message-1',
  content: '  只分析 src/main.ts，不要修改文件。确保给出风险清单。  ',
  scenarioId: 'space',
  bindings: {
    workspaceId: 'workspace-1',
    fileReferences: ['src/main.ts']
  },
  createdAt: 100
}

describe('ConversationProcessorPipeline', () => {
  it('keeps raw input immutable and produces deterministic semantic output', async () => {
    const pipeline = new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    )

    const first = await pipeline.run(baseInput)
    const replay = await pipeline.run(baseInput)

    expect(first).toEqual(replay)
    expect(first.rawUserInput.content).toBe(baseInput.content)
    expect(first.normalizedText).toBe(
      '只分析 src/main.ts，不要修改文件。确保给出风险清单。'
    )
    expect(first.semanticUnderstanding).toMatchObject({
      sourceMessageId: 'message-1',
      entities: [
        {
          kind: 'workspace',
          id: 'workspace-1'
        },
        {
          kind: 'file',
          id: 'src/main.ts'
        }
      ],
      riskLevel: 'low',
      ambiguity: []
    })
    expect(first.semanticUnderstanding.constraints).toContain('不要修改文件')
    expect(first.semanticUnderstanding.acceptanceCriteria).toContain(
      '确保给出风险清单'
    )
    expect(first.executionBrief.capabilityRestrictions).toEqual({
      allowWrites: false,
      allowExternalSideEffects: false
    })
    expect(first.gate).toEqual({ status: 'continue' })
  })

  it('adds traceable original, keyword, and semantic retrieval queries', async () => {
    const result = await new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    ).run(baseInput)

    expect(
      result.semanticUnderstanding.retrievalQueries.map((query) => query.kind)
    ).toEqual(['original', 'keyword', 'semantic'])
    expect(
      result.semanticUnderstanding.retrievalQueries.every(
        (query) =>
          query.sourceMessageId === 'message-1' &&
          query.processorVersion === '1.0.0' &&
          query.reason.length > 0
      )
    ).toBe(true)
  })

  it('requires clarification when an ambiguous file request may write', async () => {
    const pipeline = new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    )
    const result = await pipeline.run({
      ...baseInput,
      content: '处理一下这个文件',
      bindings: { fileReferences: ['src/main.ts'] }
    })

    expect(result.gate).toMatchObject({
      status: 'clarification_required',
      understoodObjective: '处理一下这个文件',
      sideEffects: ['可能修改或覆盖文件']
    })
    expect(result.semanticUnderstanding.riskLevel).toBe('high')
    expect(result.semanticUnderstanding.ambiguity).toContain(
      '未明确是只读分析还是修改文件'
    )

    const clarified = await pipeline.run({
      ...baseInput,
      messageId: 'message-2',
      content: '只分析，不修改文件',
      bindings: {},
      previousUnderstanding: result.semanticUnderstanding
    })
    expect(clarified.gate).toEqual({ status: 'continue' })
    expect(clarified.semanticUnderstanding).toMatchObject({
      revision: 2,
      supersedesMessageId: 'message-1',
      objective: '处理一下这个文件',
      entities: [{ kind: 'file', id: 'src/main.ts' }],
      differences: {
        resolvedAmbiguity: ['未明确是只读分析还是修改文件'],
        addedConstraints: expect.arrayContaining([
          '只分析，不修改文件'
        ])
      }
    })
  })

  it('detects slash commands, attachments, and sensitive labels locally', async () => {
    const result = await new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    ).run({
      ...baseInput,
      content: '/review token=secret test@example.com',
      bindings: { attachmentPaths: ['docs/spec.md'] }
    })

    expect(result.slashCommand).toEqual({
      name: 'review',
      arguments: 'token=secret test@example.com'
    })
    expect(result.registeredInputs.attachmentPaths).toEqual([
      'docs/spec.md'
    ])
    expect(result.sensitiveData.labels).toEqual(['credential', 'email'])
  })

  it.each([
    ['创建一个 HTTP 连接器', 'capability_create'],
    ['升级这个技能到新版本', 'capability_upgrade'],
    ['把这个智能体安装到当前空间', 'capability_install'],
    ['回滚这个能力到上一版本', 'capability_rollback']
  ])('classifies "%s" as %s', async (content, intent) => {
    const result = await new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    ).run({
      ...baseInput,
      content,
      bindings: {
        workspaceId: 'workspace-1',
        capabilityReferences: ['com.example.capability']
      }
    })

    expect(result.semanticUnderstanding.intent).toBe(intent)
  })

  it('does not mistake ordinary capability discussion for a Builder request', async () => {
    const result = await new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    ).run({
      ...baseInput,
      content: '这个技能怎么用？',
      bindings: {}
    })

    expect(result.semanticUnderstanding.intent).toBe('answer')
    expect(result.gate).toEqual({ status: 'continue' })
  })

  it.each([
    '请使用 Browser 工具创建浏览器并打开 https://example.com',
    'Use the Browser tool to create a browser and open https://example.com'
  ])('does not mistake Tool invocation for capability creation: %s', async (content) => {
    const result = await new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    ).run({
      ...baseInput,
      content,
      bindings: {}
    })

    expect(result.semanticUnderstanding.intent).not.toBe(
      'capability_create'
    )
    expect(result.semanticUnderstanding.ambiguity).not.toContain(
      '未明确能力安装范围'
    )
    expect(result.gate).toEqual({ status: 'continue' })
  })

  it('routes when-to-run requests to internal Trigger configuration', async () => {
    const result = await new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    ).run({
      ...baseInput,
      content: '让这个连接器每天上午九点运行',
      bindings: {
        workspaceId: 'workspace-1',
        capabilityReferences: ['com.example.connector']
      }
    })

    expect(result.semanticUnderstanding.intent).toBe(
      'configure_capability_trigger'
    )
    expect(result.semanticUnderstanding.intent).not.toBe('capability_create')
  })

  it('requires clarification when a capability creation scope is missing', async () => {
    const result = await new ConversationProcessorPipeline(
      createBuiltinConversationProcessors()
    ).run({
      ...baseInput,
      content: '创建一个查询问题的 HTTP 连接器',
      bindings: {}
    })

    expect(result.semanticUnderstanding).toMatchObject({
      intent: 'capability_create',
      ambiguity: ['未明确能力安装范围'],
      riskLevel: 'high'
    })
    expect(result.gate).toMatchObject({
      status: 'clarification_required',
      sideEffects: ['可能将能力安装到错误范围']
    })
  })

  it('runs processors by stage and order and records optional degradation', async () => {
    const calls: string[] = []
    const processors: ConversationProcessor[] = [
      processor('context-second', 'context', 20, ['locale'], async () => {
        calls.push('context-second')
        return { patch: { locale: 'zh-CN' } }
      }),
      processor('input-first', 'input', 10, ['normalizedText'], async () => {
        calls.push('input-first')
        return { patch: { normalizedText: 'normalized' } }
      }),
      processor(
        'context-optional',
        'context',
        10,
        ['capabilityCatalogDigest'],
        async () => {
          calls.push('context-optional')
          throw new Error('catalog unavailable')
        },
        'optional'
      )
    ]
    const result = await new ConversationProcessorPipeline(processors).run(
      baseInput
    )

    expect(calls).toEqual([
      'input-first',
      'context-optional',
      'context-second'
    ])
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        processorId: 'context-optional',
        level: 'degraded',
        message: 'catalog unavailable'
      })
    )
  })

  it('rejects exclusive patch conflicts before running', () => {
    expect(
      () =>
        new ConversationProcessorPipeline([
          processor('first', 'input', 1, ['normalizedText'], async () => ({
            patch: { normalizedText: 'first' }
          })),
          processor('second', 'input', 2, ['normalizedText'], async () => ({
            patch: { normalizedText: 'second' }
          }))
        ])
    ).toThrow(
      'Conversation processors first and second both write normalizedText'
    )
  })

  it('blocks the pipeline when a required processor fails', async () => {
    const pipeline = new ConversationProcessorPipeline([
      processor('required', 'input', 1, ['normalizedText'], async () => {
        throw new Error('normalization failed')
      })
    ])

    await expect(pipeline.run(baseInput)).rejects.toThrow(
      'Conversation processor required failed: normalization failed'
    )
  })

  it('records an optional processor timeout and continues', async () => {
    const optional = processor(
      'optional-timeout',
      'context',
      1,
      ['locale'],
      () => new Promise(() => {}),
      'optional'
    )
    optional.timeoutMs = 1

    const result = await new ConversationProcessorPipeline([
      optional
    ]).run(baseInput)

    expect(result.diagnostics).toEqual([
      {
        processorId: 'optional-timeout',
        level: 'degraded',
        message: 'timed out after 1ms'
      }
    ])
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        processorId: 'optional-timeout',
        status: 'degraded'
      })
    )
  })
})

function processor(
  id: string,
  stage: ConversationProcessor['stage'],
  order: number,
  writes: ConversationProcessor['writes'],
  process: ConversationProcessor['process'],
  failurePolicy: ConversationProcessor['failurePolicy'] = 'required'
): ConversationProcessor {
  return {
    id,
    version: '1.0.0',
    stage,
    order,
    scenarios: ['space'],
    writes,
    sideEffect: 'none',
    failurePolicy,
    timeoutMs: 100,
    maxOutputBytes: 10_000,
    process: vi.fn(process)
  }
}
