import {
  completeOutboundCallRecord,
  createOutboundCallRecord,
  outboundCallErrorSummary
} from './outbound-call'

describe('outbound call audit', () => {
  it('creates a structured started record without accepting request content', () => {
    expect(
      createOutboundCallRecord({
        id: 'call-1',
        idempotencyKey: 'model-run:run-1',
        callType: 'model_completion',
        target: { type: 'model_provider', id: 'provider-1' },
        owner: { type: 'ai_run', id: 'run-1' },
        providerId: 'provider-1',
        modelProfileId: 'profile-1',
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        nodeId: 'node-1',
        nodeRunId: 'node-run-1',
        aiRunId: 'run-1',
        startedAt: 100
      })
    ).toEqual({
      id: 'call-1',
      idempotencyKey: 'model-run:run-1',
      callType: 'model_completion',
      target: { type: 'model_provider', id: 'provider-1' },
      owner: { type: 'ai_run', id: 'run-1' },
      providerId: 'provider-1',
      modelProfileId: 'profile-1',
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeId: 'node-1',
      nodeRunId: 'node-run-1',
      aiRunId: 'run-1',
      status: 'started',
      startedAt: 100,
      retryCount: 0
    })
  })

  it.each([
    ['empty target', { type: 'model_provider', id: ' ' }],
    ['URL target', { type: 'model_provider', id: 'https://secret.example/v1' }],
    ['path target', { type: 'connector', id: '/private/connector' }]
  ])('rejects a %s before persistence', (_name, target) => {
    expect(() =>
      createOutboundCallRecord({
        id: 'call-1',
        idempotencyKey: 'call-key',
        callType: 'connector',
        target: target as { type: 'connector'; id: string },
        owner: { type: 'connector', id: 'connector-1' },
        startedAt: 100
      })
    ).toThrow('Outbound call target ID is invalid')
  })

  it('allows one terminal transition with derived duration and safe summary', () => {
    const started = createOutboundCallRecord({
      id: 'call-1',
      idempotencyKey: 'model-run:run-1',
      callType: 'model_completion',
      target: { type: 'model_provider', id: 'provider-1' },
      owner: { type: 'ai_run', id: 'run-1' },
      startedAt: 100
    })

    expect(
      completeOutboundCallRecord(started, {
        status: 'failed',
        completedAt: 175,
        retryCount: 2,
        errorCode: 'provider_rejected'
      })
    ).toEqual({
      ...started,
      status: 'failed',
      completedAt: 175,
      durationMs: 75,
      retryCount: 2,
      errorCode: 'provider_rejected',
      errorSummary: 'Target service rejected the request'
    })
    expect(() =>
      completeOutboundCallRecord(
        { ...started, status: 'succeeded', completedAt: 150, durationMs: 50 },
        { status: 'cancelled', completedAt: 175, retryCount: 0 }
      )
    ).toThrow('Outbound call is already terminal')
  })

  it('maps only stable error codes to credential-free summaries', () => {
    const serialized = JSON.stringify(
      [
        'provider_unavailable',
        'authentication_error',
        'target_unavailable',
        'request_timeout',
        'response_too_large'
      ].map((code) =>
        outboundCallErrorSummary(
          code as Parameters<typeof outboundCallErrorSummary>[0]
        )
      )
    )

    expect(serialized).toContain('Target service is temporarily unavailable')
    expect(serialized).toContain('Target service authentication failed')
    expect(serialized).toContain('Target response exceeded the size limit')
    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain('https://')
  })
})
