import { describe, expect, it, vi } from 'vitest'
import { createApprovalProfileSnapshot } from '../../../../domain/approval-profile'
import type {
  DshInteractionRequestRecord,
  DshInteractionResponseCommand,
  DshPermissionApprovalPayload
} from '../../../../shared/dsh-interaction-contract'
import { DshToolPermissionAdapter } from './dsh-tool-permission-adapter'

describe('DshToolPermissionAdapter', () => {
  it('lists active pending DSH permission approvals as Tool permission prompts', async () => {
    const adapter = new DshToolPermissionAdapter({
      interactions: {
        listPending: vi.fn().mockResolvedValue([
          permissionRecord({
            requestId: 'expired',
            requestedAt: 300,
            expiresAt: 900
          }),
          permissionRecord({
            requestId: 'second',
            requestedAt: 200,
            capabilityId: 'builtin.files.write',
            payload: {
              ...permissionPayload(),
              title: 'Allow write?',
              message: 'Write file under test-space.'
            }
          }),
          permissionRecord({
            requestId: 'first',
            requestedAt: 100,
            capabilityId: 'bash',
            payload: {
              ...permissionPayload(),
              title: 'bash',
              message: 'Run command after review.'
            }
          }),
          askUserRecord({ requestId: 'ask-user' })
        ])
      },
      responder: {
        respond: vi.fn()
      },
      now: () => 1_000
    })

    await expect(adapter.listPendingPermissions()).resolves.toEqual([
      expect.objectContaining({
        id: 'first',
        executionId: 'activity-first',
        runId: 'run-1',
        callId: 'activity-first',
        toolId: 'bash',
        toolName: 'bash',
        status: 'requested',
        reason: 'process',
        risk: 'high',
        effectiveRisk: 'L3',
        approvalProfileId: 'protected',
        approvalProfileDigest:
          createApprovalProfileSnapshot('protected').digest,
        resources: [{ kind: 'process', label: 'Run command after review.' }]
      }),
      expect.objectContaining({
        id: 'second',
        toolId: 'builtin.files.write',
        toolName: 'Allow write?',
        reason: 'write',
        risk: 'medium',
        effectiveRisk: 'L2',
        resources: [{ kind: 'path', label: 'Write file under test-space.' }]
      })
    ])
  })

  it('resolves a Tool permission deny command through the exact DSH interaction binding', async () => {
    const pending = permissionRecord({ requestId: 'request-deny' })
    const respond = vi.fn().mockImplementation(
      async (command: DshInteractionResponseCommand) => ({
        ...command,
        schemaVersion: 1,
        kind: 'permission_approval',
        resolvedAt: 2_000,
        decisionDigest: 'd'.repeat(64),
        decisionSignature: 'e'.repeat(64)
      })
    )
    const adapter = new DshToolPermissionAdapter({
      interactions: {
        listPending: vi.fn(),
        get: vi.fn().mockResolvedValue(pending)
      },
      responder: { respond },
      now: () => 1_000
    })

    await expect(
      adapter.resolve({
        requestId: 'request-deny',
        expectedRevision: 1,
        decision: 'deny'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'request-deny',
        status: 'denied',
        decision: 'deny',
        resolvedAt: 2_000
      })
    )
    expect(respond).toHaveBeenCalledWith({
      runtimeInstanceId: pending.runtimeInstanceId,
      sessionId: pending.sessionId,
      runId: pending.runId,
      requestId: pending.requestId,
      activityId: pending.activityId,
      capabilityId: pending.capabilityId,
      scopeDigest: pending.scopeDigest,
      effectDigest: pending.effectDigest,
      expectedRevision: 1,
      nonce: pending.nonce,
      response: {
        kind: 'permission_approval',
        decision: 'deny'
      }
    })
  })

  it('maps DSH request IDs with separators to IPC-safe prompt IDs before resolving them', async () => {
    const pending = permissionRecord({
      requestId: 'dsh-session-1:call-1'
    })
    const interactions = {
      listPending: vi.fn().mockResolvedValue([pending]),
      get: vi.fn().mockResolvedValue(undefined)
    }
    const respond = vi.fn().mockImplementation(
      async (command: DshInteractionResponseCommand) => ({
        ...command,
        schemaVersion: 1,
        kind: 'permission_approval',
        resolvedAt: 2_000,
        decisionDigest: 'd'.repeat(64),
        decisionSignature: 'e'.repeat(64)
      })
    )
    const adapter = new DshToolPermissionAdapter({
      interactions,
      responder: { respond },
      now: () => 1_000
    })

    const [view] = await adapter.listPendingPermissions()

    expect(view.id).not.toBe(pending.requestId)
    expect(view.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/)
    await adapter.resolve({
      requestId: view.id,
      expectedRevision: view.requestRevision,
      decision: 'deny'
    })
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: pending.requestId,
        nonce: pending.nonce,
        response: {
          kind: 'permission_approval',
          decision: 'deny'
        }
      })
    )
  })
})

type PermissionApprovalRecord = Extract<
  DshInteractionRequestRecord,
  { kind: 'permission_approval' }
>

function permissionRecord(
  overrides: Partial<PermissionApprovalRecord> = {}
): PermissionApprovalRecord {
  const requestId = overrides.requestId ?? 'request-1'
  return {
    schemaVersion: 1,
    kind: 'permission_approval',
    runtimeInstanceId: 'realmflow-dsh-main',
    sessionId: 'dsh-session-1',
    runId: 'run-1',
    requestId,
    activityId: `activity-${requestId}`,
    capabilityId: 'builtin.process.run',
    scopeDigest: 'a'.repeat(64),
    effectDigest: 'b'.repeat(64),
    expiresAt: 10_000,
    payload: permissionPayload(),
    status: 'pending',
    nonce: `nonce-${requestId}`,
    requestedAt: 100,
    requestRevision: 1,
    ...overrides
  }
}

function askUserRecord(
  overrides: Partial<Extract<DshInteractionRequestRecord, { kind: 'ask_user' }>>
): Extract<DshInteractionRequestRecord, { kind: 'ask_user' }> {
  const requestId = overrides.requestId ?? 'ask-user'
  return {
    schemaVersion: 1,
    kind: 'ask_user',
    runtimeInstanceId: 'realmflow-dsh-main',
    sessionId: 'dsh-session-1',
    runId: 'run-1',
    requestId,
    activityId: `activity-${requestId}`,
    capabilityId: 'ask_user',
    scopeDigest: 'a'.repeat(64),
    effectDigest: 'b'.repeat(64),
    expiresAt: 10_000,
    payload: {
      prompt: 'Continue?',
      required: true
    },
    status: 'pending',
    nonce: `nonce-${requestId}`,
    requestedAt: 100,
    requestRevision: 1,
    ...overrides
  }
}

function permissionPayload(): DshPermissionApprovalPayload {
  return {
    title: 'Run shell?',
    message: 'Run command.',
    approvalProfileId: 'protected',
    maxGrant: 'once',
    options: ['deny', 'allow_once']
  }
}
