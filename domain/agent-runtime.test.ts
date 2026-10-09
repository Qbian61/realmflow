import {
  DEFAULT_AGENT_EXECUTION_POLICY,
  AGENT_RUN_HARD_LIMITS,
  AGENT_RUN_SCENARIO_IDS,
  createAgentRunSnapshot,
  resolveAgentRunScenario,
  transitionAgentRunLifecycle,
  type AgentRunLifecycleStatus
} from './agent-runtime'

describe('Agent runtime', () => {
  it('registers every built-in AI execution scenario', () => {
    expect(AGENT_RUN_SCENARIO_IDS).toEqual([
      'general',
      'folder',
      'space',
      'requirement-node',
      'workflow-node',
      'scheduled',
      'sensitive',
      'management'
    ])
  })

  it.each([
    [
      { conversationId: 'conversation-1', messages: [] },
      'general'
    ],
    [
      {
        conversationId: 'conversation-1',
        folderPath: '/workspace/project',
        messages: []
      },
      'folder'
    ],
    [
      {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1',
        messages: []
      },
      'space'
    ],
    [
      {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        nodeId: 'node-1',
        nodeRunId: 'node-run-1',
        messages: []
      },
      'requirement-node'
    ],
    [
      {
        requirementId: 'requirement-1',
        requirementTitle: 'Checkout',
        nodeId: 'node-1',
        nodeRunId: 'node-run-1',
        workspaceId: 'workspace-1',
        workspaceName: 'shop',
        prompt: 'Implement',
        artifactPath: 'artifacts/implementation.md',
        existingArtifacts: []
      },
      'workflow-node'
    ],
    [
      {
        conversationId: 'conversation-1',
        scheduleRunId: 'schedule-run-1',
        messages: []
      },
      'scheduled'
    ],
    [
      {
        conversationId: 'conversation-1',
        requestedScenarioId: 'sensitive',
        messages: []
      },
      'sensitive'
    ],
    [
      {
        conversationId: 'conversation-1',
        requestedScenarioId: 'management',
        messages: []
      },
      'management'
    ]
  ] as const)('resolves one scenario for a supported run context', (context, id) => {
    expect(resolveAgentRunScenario(context)).toMatchObject({
      id,
      executionPolicy: DEFAULT_AGENT_EXECUTION_POLICY
    })
  })

  it('creates a deeply immutable snapshot with bounded budgets and stable scope', () => {
    const snapshot = createAgentRunSnapshot(
      {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1',
        contextSnapshotId: 'context-snapshot-1',
        triggerBindingId: 'trigger-binding-1',
        triggerEventId: 'trigger-event-1',
        messages: []
      },
      {
        runId: 'agent-run-1',
        agentProfileId: 'workspace.space',
        agentProfileVersion: '2.0.0',
        agentProfileDigest: 'f'.repeat(64),
        promptDigest: 'd'.repeat(64),
        policyDigest: 'e'.repeat(64),
        capabilityCatalogDigest: 'a'.repeat(64),
        capabilityBindingDigest: 'b'.repeat(64),
        permissionSnapshotDigest: 'c'.repeat(64),
        maxToolCalls: 12,
        createdAt: 100
      }
    )

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      runId: 'agent-run-1',
      contextSnapshotId: 'context-snapshot-1',
      triggerBindingId: 'trigger-binding-1',
      triggerEventId: 'trigger-event-1',
      scenarioId: 'space',
      pipelineVersion: 'builtin.space.v1',
      agentProfileId: 'workspace.space',
      agentProfileVersion: '2.0.0',
      agentProfileDigest: 'f'.repeat(64),
      promptDigest: 'd'.repeat(64),
      policyDigest: 'e'.repeat(64),
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      executionPolicy: {
        policyVersion: 1,
        maxTurnsPerSegment: 180,
        maxContinuationAttempts: 2,
        maxParallelToolsPerTurn: 16,
        maxActiveRuntimeMs: 8 * 60 * 60_000,
        providerRequestTimeoutMs: 30 * 60_000,
        contextCompactionThreshold: 0.75,
        maxOutputTokens: 32_000,
        maxFileReadTokens: 25_000,
        maxRepeatedEquivalentCalls: 3,
        maxConsecutiveFailures: 5
      },
      budgetLedger: {
        segmentIndex: 0,
        agentTurns: 0,
        toolRequests: 0,
        toolExecutions: 0,
        permissionWaits: 0,
        sideEffects: 0,
        consecutiveFailures: 0,
        repeatedCallFingerprints: {},
        activeRuntimeMs: 0,
        remainingContinuationAttempts: 2
      },
      budgets: {
        maxToolCalls: 12,
        maxSubagents: 0
      },
      createdAt: 100
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.scope)).toBe(true)
    expect(Object.isFrozen(snapshot.budgets)).toBe(true)
    expect(Object.isFrozen(snapshot.executionPolicy)).toBe(true)
    expect(Object.isFrozen(snapshot.budgetLedger)).toBe(true)
    expect(
      Object.isFrozen(snapshot.budgetLedger.repeatedCallFingerprints)
    ).toBe(true)
  })

  it('fixes root and child delegation lineage in immutable snapshots', () => {
    const root = createAgentRunSnapshot(
      { conversationId: 'conversation-1', messages: [] },
      snapshotInput('root-run')
    )
    const child = createAgentRunSnapshot(
      { conversationId: 'conversation-1', messages: [] },
      {
        ...snapshotInput('child-run'),
        lineage: {
          rootRunId: root.runId,
          parentRunId: root.runId,
          delegationDepth: 1,
          delegationOrdinal: 2
        }
      }
    )

    expect(root).toMatchObject({
      rootRunId: 'root-run',
      delegationDepth: 0,
      delegationOrdinal: 0
    })
    expect(root).not.toHaveProperty('parentRunId')
    expect(child).toMatchObject({
      rootRunId: 'root-run',
      parentRunId: 'root-run',
      delegationDepth: 1,
      delegationOrdinal: 2
    })
    expect(() =>
      createAgentRunSnapshot(
        { conversationId: 'conversation-1', messages: [] },
        {
          ...snapshotInput('invalid-child'),
          lineage: {
            rootRunId: 'root-run',
            parentRunId: 'root-run',
            delegationDepth: 0,
            delegationOrdinal: 1
          }
        }
      )
    ).toThrow('Invalid Agent Run delegation lineage')
  })

  it.each([
    { maxToolCalls: 0 },
    { timeoutMs: 0 },
    { maxSubagents: -1 },
    { maxRetries: -1 },
    { maxToolCalls: 257 },
    { maxSubagents: 17 },
    { timeoutMs: 24 * 60 * 60_000 + 1 },
    { maxRetries: 9 }
  ])('rejects invalid budget overrides', (override) => {
    expect(() =>
      createAgentRunSnapshot(
        { conversationId: 'conversation-1', messages: [] },
        {
          runId: 'agent-run-1',
          agentProfileId: 'builtin.general',
          agentProfileVersion: '1.0.0',
          agentProfileDigest: 'f'.repeat(64),
          promptDigest: 'd'.repeat(64),
          policyDigest: 'e'.repeat(64),
          capabilityCatalogDigest: 'a'.repeat(64),
          capabilityBindingDigest: 'b'.repeat(64),
          permissionSnapshotDigest: 'c'.repeat(64),
          ...override
        }
      )
    ).toThrow('Invalid Agent Run budget')
  })

  it('publishes fixed system hard limits for long-running runs', () => {
    expect(AGENT_RUN_HARD_LIMITS).toEqual({
      maxToolCalls: 256,
      maxSubagents: 16,
      timeoutMs: 24 * 60 * 60_000,
      maxRetries: 8
    })
  })

  it.each<[AgentRunLifecycleStatus, AgentRunLifecycleStatus]>([
    ['preparing', 'running'],
    ['running', 'waiting_permission'],
    ['waiting_permission', 'running'],
    ['running', 'waiting_input'],
    ['waiting_input', 'running'],
    ['running', 'retrying'],
    ['retrying', 'running'],
    ['running', 'paused'],
    ['paused', 'running'],
    ['running', 'recovery_blocked'],
    ['retrying', 'recovery_blocked'],
    ['waiting_permission', 'recovery_blocked'],
    ['recovery_blocked', 'running'],
    ['running', 'completed'],
    ['running', 'failed'],
    ['running', 'cancelled']
  ])('allows lifecycle transition %s -> %s', (from, to) => {
    expect(transitionAgentRunLifecycle(from, to)).toBe(to)
  })

  it.each<AgentRunLifecycleStatus>(['completed', 'failed', 'cancelled'])(
    'keeps terminal lifecycle status %s irreversible',
    (status) => {
      expect(() => transitionAgentRunLifecycle(status, 'running')).toThrow(
        `Invalid Agent Run lifecycle transition: ${status} -> running`
      )
    }
  )
})

function snapshotInput(runId: string) {
  return {
    runId,
    agentProfileId: 'builtin.general',
    agentProfileVersion: '1.0.0',
    agentProfileDigest: 'f'.repeat(64),
    promptDigest: 'd'.repeat(64),
    policyDigest: 'e'.repeat(64),
    capabilityCatalogDigest: 'a'.repeat(64),
    capabilityBindingDigest: 'b'.repeat(64),
    permissionSnapshotDigest: 'c'.repeat(64),
    createdAt: 100
  }
}
