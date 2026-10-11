import { describe, expect, it } from 'vitest'
import type { SemanticUnderstanding } from '../../../../domain/conversation-processor'
import { TurnContextRouter } from './turn-context-router'

describe('TurnContextRouter', () => {
  const router = new TurnContextRouter()

  it('defaults an unrelated latest message to a fresh turn', () => {
    const route = router.route({
      sourceMessageId: 'message-new',
      content: '开发者客栈是做什么的',
      semanticUnderstanding: understanding('message-new', '了解开发者客栈'),
      history: [
        turn(
          'message-old',
          'assistant-old',
          '把这个能力安装到哪里',
          understanding('message-old', '安装能力', ['未明确能力安装范围'])
        )
      ],
      createdAt: 100
    })

    expect(route).toMatchObject({
      schemaVersion: 1,
      relation: 'fresh',
      sourceMessageId: 'message-new',
      selectedMessageIds: [],
      excludedMessageIds: ['message-old', 'assistant-old'],
      reasons: ['topic_changed']
    })
  })

  it('continues when the latest message resolves the prior ambiguity', () => {
    const route = router.route({
      sourceMessageId: 'message-answer',
      content: '安装到全局',
      semanticUnderstanding: understanding('message-answer', '安装到全局'),
      history: [
        turn(
          'message-question',
          'assistant-question',
          '安装这个能力',
          understanding(
            'message-question',
            '安装能力',
            ['未明确能力安装范围']
          )
        )
      ],
      createdAt: 101
    })

    expect(route.relation).toBe('continuation')
    expect(route.predecessorMessageId).toBe('message-question')
    expect(route.selectedMessageIds).toEqual([
      'message-question',
      'assistant-question'
    ])
    expect(route.reasons).toContain('clarification_response')
  })

  it('selects an explicitly referenced turn without loading the transcript', () => {
    const route = router.route({
      sourceMessageId: 'message-reference',
      content: '根据刚才第二条结论继续',
      semanticUnderstanding: understanding(
        'message-reference',
        '继续第二条结论'
      ),
      referencedMessageIds: ['message-two'],
      history: [
        turn(
          'message-one',
          'assistant-one',
          '第一个主题',
          understanding('message-one', '第一个主题')
        ),
        turn(
          'message-two',
          'assistant-two',
          '第二个主题',
          understanding('message-two', '第二个主题')
        )
      ],
      createdAt: 102
    })

    expect(route.relation).toBe('reference')
    expect(route.selectedMessageIds).toEqual([
      'message-two',
      'assistant-two'
    ])
    expect(route.excludedMessageIds).toEqual([
      'message-one',
      'assistant-one'
    ])
    expect(route.reasons).toContain('explicit_reference')
  })

  it('does not treat a historical browser session id as continuity evidence', () => {
    const route = router.route({
      sourceMessageId: 'message-new',
      content: 'browser-dead-session',
      semanticUnderstanding: understanding(
        'message-new',
        '检查 browser-dead-session'
      ),
      history: [
        turn(
          'message-old',
          'assistant-old',
          'browser-dead-session',
          understanding('message-old', '浏览网页')
        )
      ],
      createdAt: 103
    })

    expect(route.relation).toBe('fresh')
    expect(route.selectedMessageIds).toEqual([])
    expect(route.reasons).toContain('runtime_only')
  })

  it('references the latest high-confidence entity match without inheriting all history', () => {
    const prior = understanding('message-login', '修复登录页面')
    prior.entities = [{ kind: 'requirement', id: 'requirement-login' }]
    const current = understanding('message-current', '验证登录页面')
    current.entities = [{ kind: 'requirement', id: 'requirement-login' }]

    const route = router.route({
      sourceMessageId: 'message-current',
      content: '验证登录页面',
      semanticUnderstanding: current,
      history: [
        turn(
          'message-other',
          'assistant-other',
          '别的主题',
          understanding('message-other', '别的主题')
        ),
        turn(
          'message-login',
          'assistant-login',
          '修复登录页面',
          prior
        )
      ],
      createdAt: 104
    })

    expect(route).toMatchObject({
      relation: 'reference',
      selectedMessageIds: ['message-login', 'assistant-login'],
      reasons: ['entity_overlap', 'semantic_match']
    })
    expect(route.excludedMessageIds).toEqual([
      'message-other',
      'assistant-other'
    ])
  })

  it('honors a one-turn manual fresh or continuation override', () => {
    const history = [
      turn(
        'message-old',
        'assistant-old',
        'old topic',
        understanding('message-old', 'old topic')
      )
    ]
    const base = {
      sourceMessageId: 'message-new',
      content: 'next',
      semanticUnderstanding: understanding('message-new', 'next'),
      history,
      createdAt: 105
    }

    expect(router.route({ ...base, override: 'fresh' })).toMatchObject({
      relation: 'fresh',
      selectedMessageIds: [],
      reasons: ['manual_fresh']
    })
    expect(
      router.route({ ...base, override: 'continuation' })
    ).toMatchObject({
      relation: 'continuation',
      selectedMessageIds: ['message-old', 'assistant-old'],
      reasons: ['manual_continuation']
    })
  })
})

function turn(
  userMessageId: string,
  assistantMessageId: string,
  content: string,
  semanticUnderstanding: SemanticUnderstanding
) {
  return {
    userMessageId,
    assistantMessageId,
    userContent: content,
    assistantContent: 'answer',
    semanticUnderstanding
  }
}

function understanding(
  sourceMessageId: string,
  objective: string,
  ambiguity: string[] = []
): SemanticUnderstanding {
  return {
    sourceMessageId,
    sourceDigest: `digest-${sourceMessageId}`,
    processorVersion: 'test',
    generatedBy: 'deterministic',
    revision: 1,
    intent: 'general',
    objective,
    entities: [],
    constraints: [],
    acceptanceCriteria: [],
    ambiguity,
    riskLevel: 'low',
    retrievalQueries: [],
    confidence: 0.9
  }
}
