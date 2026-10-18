import { describe, expect, it, vi } from 'vitest'
import type {
  DshInteractionDecision,
  DshInteractionRequest,
  DshInteractionRequestRecord
} from '../../../../shared/dsh-interaction-contract'
import {
  DshInteractionService,
  verifyDshInteractionDecisionSignature
} from './dsh-interaction-service'

describe('DshInteractionService', () => {
  it('persists a typed request before projecting it to the existing UI host', async () => {
    const harness = createHarness()

    const record = await harness.service.requestInteraction(
      interactionRequest()
    )

    expect(harness.order).toEqual(['persist', 'project'])
    expect(record).toMatchObject({
      status: 'pending',
      requestRevision: 1,
      nonce: 'nonce-1',
      requestedAt: 1_000,
      kind: 'permission_approval'
    })
    expect(harness.repository.getSync('request-1')).toBe(record)
    expect(Object.isFrozen(record)).toBe(true)
  })

  it('rejects interaction kinds outside the DSH contract before persistence or UI projection', async () => {
    const harness = createHarness()

    await expect(
      harness.service.requestInteraction({
        ...interactionRequest(),
        kind: 'free_form_popup' as never
      })
    ).rejects.toThrow(/interaction kind/i)

    expect(harness.order).toEqual([])
    expect(harness.presenter.project).not.toHaveBeenCalled()
  })

  it('accepts every typed interaction kind from the DSH contract', async () => {
    const cases: Array<Pick<DshInteractionRequest, 'kind' | 'payload'>> = [
      {
        kind: 'permission_approval',
        payload: {
          title: 'Allow file write?',
          message: 'DSH requested permission to write a file.',
          approvalProfileId: 'protected',
          maxGrant: 'once',
          options: ['deny', 'allow_once']
        }
      },
      {
        kind: 'ask_user',
        payload: {
          prompt: 'Which workspace should be used?',
          required: true
        }
      },
      {
        kind: 'elicitation',
        payload: {
          prompt: 'Collect deployment fields.',
          schema: {
            type: 'object',
            properties: {
              environment: { type: 'string' }
            }
          }
        }
      },
      {
        kind: 'choice',
        payload: {
          prompt: 'Choose an environment.',
          multiSelect: false,
          options: [{ id: 'staging', label: 'Staging' }]
        }
      },
      {
        kind: 'confirmation',
        payload: {
          prompt: 'Continue?',
          destructive: false
        }
      },
      {
        kind: 'credential_consent',
        payload: {
          credentialRef: 'credential-openai',
          providerLabel: 'OpenAI',
          operation: 'model-call',
          reason: 'DSH needs a call-scoped model token.'
        }
      }
    ]

    for (const [index, item] of cases.entries()) {
      const harness = createHarness({ nonce: `nonce-${index}` })
      await expect(
        harness.service.requestInteraction(
          interactionRequest({
            kind: item.kind,
            requestId: `request-${index}`,
            payload: item.payload
          } as Partial<DshInteractionRequest>)
        )
      ).resolves.toMatchObject({ kind: item.kind, status: 'pending' })
    }
  })

  it('binds one response to the exact active request and resumes only that DSH activity', async () => {
    const harness = createHarness()
    await harness.service.requestInteraction(interactionRequest())

    const decision = await harness.service.respond({
      ...responseBinding(),
      expectedRevision: 1,
      nonce: 'nonce-1',
      response: {
        kind: 'permission_approval',
        decision: 'allow_once'
      }
    })

    expect(decision).toMatchObject({
      requestId: 'request-1',
      activityId: 'activity-1',
      capabilityId: 'builtin.files.write',
      scopeDigest: '2'.repeat(64),
      effectDigest: '3'.repeat(64),
      response: {
        kind: 'permission_approval',
        decision: 'allow_once'
      },
      resolvedAt: 1_000
    })
    expect(decision.decisionDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(decision.decisionSignature).toMatch(/^[a-f0-9]{64}$/)
    expect(
      verifyDshInteractionDecisionSignature(decision, 'test-signing-key')
    ).toBe(true)
    expect(
      verifyDshInteractionDecisionSignature(
        { ...decision, effectDigest: '4'.repeat(64) },
        'test-signing-key'
      )
    ).toBe(false)
    expect(harness.runtime.resumeInteraction).toHaveBeenCalledWith(decision)
    expect(harness.repository.getSync('request-1')).toMatchObject({
      status: 'resolved',
      requestRevision: 2,
      response: decision.response,
      decisionDigest: decision.decisionDigest,
      decisionSignature: decision.decisionSignature
    })
  })

  it('rejects forged, expired, repeated, cross-run, and cross-scope responses', async () => {
    const harness = createHarness()
    await harness.service.requestInteraction(interactionRequest())

    await expect(
      harness.service.respond({
        ...responseBinding(),
        runId: 'run-other',
        expectedRevision: 1,
        nonce: 'nonce-1',
        response: { kind: 'permission_approval', decision: 'allow_once' }
      })
    ).rejects.toThrow(/does not match/)
    await expect(
      harness.service.respond({
        ...responseBinding(),
        scopeDigest: '4'.repeat(64),
        expectedRevision: 1,
        nonce: 'nonce-1',
        response: { kind: 'permission_approval', decision: 'allow_once' }
      })
    ).rejects.toThrow(/does not match/)
    await expect(
      harness.service.respond({
        ...responseBinding(),
        expectedRevision: 1,
        nonce: 'forged-nonce',
        response: { kind: 'permission_approval', decision: 'allow_once' }
      })
    ).rejects.toThrow(/nonce/i)

    await harness.service.respond({
      ...responseBinding(),
      expectedRevision: 1,
      nonce: 'nonce-1',
      response: { kind: 'permission_approval', decision: 'deny' }
    })
    await expect(
      harness.service.respond({
        ...responseBinding(),
        expectedRevision: 2,
        nonce: 'nonce-1',
        response: { kind: 'permission_approval', decision: 'deny' }
      })
    ).rejects.toThrow(/already resolved/i)

    const expired = createHarness({ nonce: 'nonce-expired' })
    await expired.service.requestInteraction(
      interactionRequest({ requestId: 'request-expired', expiresAt: 2_000 })
    )
    expired.setNow(2_001)
    await expect(
      expired.service.respond({
        ...responseBinding({ requestId: 'request-expired' }),
        expectedRevision: 1,
        nonce: 'nonce-expired',
        response: { kind: 'permission_approval', decision: 'allow_once' }
      })
    ).rejects.toThrow(/expired/i)
    expect(expired.runtime.resumeInteraction).not.toHaveBeenCalled()
  })

  it('does not issue approval side effects when the user denies the request', async () => {
    const harness = createHarness()
    await harness.service.requestInteraction(interactionRequest())

    await harness.service.respond({
      ...responseBinding(),
      expectedRevision: 1,
      nonce: 'nonce-1',
      response: {
        kind: 'permission_approval',
        decision: 'deny'
      }
    })

    expect(harness.decisionEffects.apply).not.toHaveBeenCalled()
    expect(harness.runtime.resumeInteraction).toHaveBeenCalledTimes(1)
  })
})

function createHarness(options: { now?: number; nonce?: string } = {}) {
  const order: string[] = []
  let currentNow = options.now ?? 1_000
  const repository = new InMemoryInteractionRepository(order)
  const presenter = {
    project: vi.fn(async (record: DshInteractionRequestRecord) => {
      expect(repository.getSync(record.requestId)).toBe(record)
      order.push('project')
    })
  }
  const runtime = {
    resumeInteraction: vi.fn(async (_decision: DshInteractionDecision) => {})
  }
  const decisionEffects = {
    apply: vi.fn(async (_decision: DshInteractionDecision) => {})
  }
  const service = new DshInteractionService({
    repository,
    presenter,
    runtime,
    decisionEffects,
    now: () => currentNow,
    createNonce: () => options.nonce ?? 'nonce-1',
    signingKey: 'test-signing-key'
  })
  return {
    decisionEffects,
    order,
    presenter,
    repository,
    runtime,
    service,
    setNow: (value: number) => {
      currentNow = value
    }
  }
}

function interactionRequest(
  overrides: Partial<DshInteractionRequest> = {}
): DshInteractionRequest {
  const base: DshInteractionRequest = {
    schemaVersion: 1,
    kind: 'permission_approval',
    runtimeInstanceId: 'runtime-1',
    sessionId: 'session-1',
    runId: 'run-1',
    requestId: 'request-1',
    activityId: 'activity-1',
    capabilityId: 'builtin.files.write',
    scopeDigest: '2'.repeat(64),
    effectDigest: '3'.repeat(64),
    expiresAt: 2_000,
    payload: {
      title: 'Allow file write?',
      message: 'DSH requested permission to write a file.',
      approvalProfileId: 'protected',
      maxGrant: 'once',
      options: ['deny', 'allow_once']
    }
  }
  return { ...base, ...overrides } as DshInteractionRequest
}

type ResponseBinding = {
  runtimeInstanceId: string
  sessionId: string
  runId: string
  requestId: string
  activityId: string
  capabilityId: string
  scopeDigest: string
  effectDigest: string
}

function responseBinding(overrides: Partial<ResponseBinding> = {}) {
  return {
    runtimeInstanceId: 'runtime-1',
    sessionId: 'session-1',
    runId: 'run-1',
    requestId: 'request-1',
    activityId: 'activity-1',
    capabilityId: 'builtin.files.write',
    scopeDigest: '2'.repeat(64),
    effectDigest: '3'.repeat(64),
    ...overrides
  }
}

class InMemoryInteractionRepository {
  private readonly records = new Map<string, DshInteractionRequestRecord>()

  constructor(private readonly order: string[]) {}

  async get(requestId: string): Promise<DshInteractionRequestRecord | undefined> {
    return this.records.get(requestId)
  }

  getSync(requestId: string): DshInteractionRequestRecord | undefined {
    return this.records.get(requestId)
  }

  async savePending(record: DshInteractionRequestRecord): Promise<void> {
    if (this.records.has(record.requestId)) {
      throw new Error('interaction_request_conflict')
    }
    this.records.set(record.requestId, record)
    this.order.push('persist')
  }

  async saveResolved(
    record: DshInteractionRequestRecord,
    expectedRevision: number
  ): Promise<void> {
    const current = this.records.get(record.requestId)
    if (!current || current.requestRevision !== expectedRevision) {
      throw new Error('interaction_revision_conflict')
    }
    this.records.set(record.requestId, record)
  }
}
