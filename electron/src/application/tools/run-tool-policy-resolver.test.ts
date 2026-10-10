import { describe, expect, it, vi } from 'vitest'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { ToolPolicyEngine } from './tool-policy-engine'
import { RunToolPolicyResolver } from './run-tool-policy-resolver'
import type { ToolExecutionCommand } from './tool-execution-application-service'

const policy = new ToolPolicyEngine().resolve([], { providerId: 'provider', layers: [{ allow: [] }] })
const snapshotInput = {
  runId: 'runtime', toolPolicy: policy,
  agentProfileId: 'builtin.general', agentProfileVersion: '1.0.0',
  agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64),
  policyDigest: 'c'.repeat(64), capabilityCatalogDigest: 'd'.repeat(64),
  capabilityBindingDigest: 'e'.repeat(64), permissionSnapshotDigest: 'f'.repeat(64),
}
const command: ToolExecutionCommand = {
  definition: { kind: 'tool', id: 'files.read', version: '1.0.0', digest: 'a'.repeat(64) },
  triggerSource: 'model',
  context: {
    scope: { kind: 'conversation', conversationId: 'conversation' },
    conversationId: 'conversation', parentExecutionId: 'runtime',
    toolPolicyDigest: 'untrusted-digest',
  },
  input: {},
}

describe('Main run tool policy lookup', () => {
  it('uses the active run snapshot and ignores caller supplied digest', async () => {
    const stored = vi.fn()
    const resolver = new RunToolPolicyResolver({ active: () => policy, stored })
    await expect(resolver.resolve(command)).resolves.toBe(policy)
    expect(stored).not.toHaveBeenCalled()
  })

  it('loads the persisted snapshot after restart', async () => {
    const snapshot = createAgentRunSnapshot({ conversationId: 'conversation', messages: [] }, snapshotInput)
    const stored = vi.fn().mockResolvedValue({
      id: 'runtime', status: 'waiting_permission', snapshot, createdAt: 1, updatedAt: 1,
    })
    const resolver = new RunToolPolicyResolver({ active: () => undefined, stored })
    await expect(resolver.resolve(command)).resolves.toEqual(policy)
    expect(stored).toHaveBeenCalledWith('runtime')
  })

  it.each(['missing_run', 'missing_parent', 'completed_run'] as const)(
    'fails closed for %s instead of treating missing policy as unrestricted',
    async (state) => {
      const snapshot = createAgentRunSnapshot({ conversationId: 'conversation', messages: [] }, snapshotInput)
      const resolver = new RunToolPolicyResolver({
        active: () => undefined,
        stored: async () => state === 'completed_run'
          ? { id: 'runtime', status: 'completed', snapshot, createdAt: 1, updatedAt: 1 }
          : undefined,
      })
      const result = await resolver.resolve({
        ...command, context: { ...command.context, parentExecutionId: state === 'missing_parent' ? undefined : 'runtime' },
      })
      expect(result).toBeDefined()
      expect(result?.grants).toEqual([])
      expect(result?.digest).not.toBe(policy.digest)
    },
  )

  it('leaves an independent user command to the existing permission planner', async () => {
    const resolver = new RunToolPolicyResolver({ active: () => undefined, stored: vi.fn() })
    await expect(resolver.resolve({
      ...command, triggerSource: 'user', context: { ...command.context, parentExecutionId: undefined },
    })).resolves.toBeUndefined()
  })
})
