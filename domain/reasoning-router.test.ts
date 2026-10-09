import {
  resolveProviderReasoning,
  routeConversationReasoning,
  type ReasoningTaskFeatures
} from './reasoning-router'

const simpleQuestion: ReasoningTaskFeatures = {
  messageLength: 18,
  intent: 'read',
  entityKinds: [],
  constraintCount: 0,
  acceptanceCriteriaCount: 0,
  riskLevel: 'low',
  toolRequired: false,
  historicalFailureCount: 0
}

describe('conversation reasoning router', () => {
  it('routes a simple factual question to low reasoning without extra Tool budget', () => {
    expect(routeConversationReasoning(simpleQuestion, 'auto')).toEqual({
      requestedMode: 'auto',
      selectedMode: 'low',
      effectiveMode: 'low',
      confidence: 0.96,
      reasonCodes: ['simple_factual_request'],
      budgets: {
        maxOutputTokens: 2_048,
        maxToolCalls: 2,
        timeoutMs: 90_000
      }
    })
  })

  it('routes a constrained multi-file verification task to high reasoning', () => {
    expect(
      routeConversationReasoning(
        {
          messageLength: 420,
          intent: 'write',
          entityKinds: ['file', 'file', 'workspace'],
          constraintCount: 3,
          acceptanceCriteriaCount: 2,
          riskLevel: 'medium',
          toolRequired: true,
          historicalFailureCount: 0
        },
        'auto'
      )
    ).toMatchObject({
      selectedMode: 'high',
      confidence: 0.94,
      reasonCodes: [
        'multi_file_scope',
        'verification_required',
        'constraint_heavy',
        'tool_execution_required'
      ],
      budgets: {
        maxOutputTokens: 8_192,
        maxToolCalls: 8,
        timeoutMs: 900_000
      }
    })
  })

  it('honors a fixed user level without inspecting or logging message content', () => {
    const decision = routeConversationReasoning(
      {
        ...simpleQuestion,
        messageLength: 8_000,
        riskLevel: 'high'
      },
      'off'
    )

    expect(decision).toMatchObject({
      requestedMode: 'off',
      selectedMode: 'off',
      effectiveMode: 'off',
      reasonCodes: ['user_override']
    })
    expect(JSON.stringify(decision)).not.toContain('content')
  })

  it('degrades to off when the selected model does not support reasoning', () => {
    expect(
      resolveProviderReasoning(
        routeConversationReasoning(
          {
            ...simpleQuestion,
            entityKinds: ['file', 'file'],
            acceptanceCriteriaCount: 2,
            toolRequired: true
          },
          'high'
        ),
        false
      )
    ).toMatchObject({
      requestedMode: 'high',
      selectedMode: 'high',
      effectiveMode: 'off',
      providerAdjustment: {
        from: 'high',
        to: 'off',
        reason: 'provider_unsupported'
      },
      reasonCodes: ['user_override', 'provider_unsupported']
    })
  })

  it('falls back to medium when structured feature classification fails', () => {
    expect(
      routeConversationReasoning(
        {
          ...simpleQuestion,
          entityKinds: undefined as never
        },
        'auto'
      )
    ).toEqual({
      requestedMode: 'auto',
      selectedMode: 'medium',
      effectiveMode: 'medium',
      confidence: 0,
      reasonCodes: ['classifier_fallback'],
      budgets: {
        maxOutputTokens: 4_096,
        maxToolCalls: 4,
        timeoutMs: 300_000
      }
    })
  })
})
