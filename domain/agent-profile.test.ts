import {
  createAgentProfile,
  getBuiltinAgentProfile,
  renderAgentPrompt,
  resolveEffectiveAgentProfile,
  type AgentProfile,
  type CapabilityDescriptor
} from './agent-profile'

const readCapability: CapabilityDescriptor = {
  kind: 'tool',
  id: 'files.read',
  version: '1.0.0',
  digest: 'a'.repeat(64),
  risk: 'low'
}

const deleteCapability: CapabilityDescriptor = {
  kind: 'tool',
  id: 'files.delete',
  version: '1.0.0',
  digest: 'b'.repeat(64),
  risk: 'critical'
}

function profile(
  input: Partial<Parameters<typeof createAgentProfile>[0]> = {}
): AgentProfile {
  return createAgentProfile({
    id: 'builtin.general',
    version: '1.0.0',
    source: 'system',
    role: 'General assistant',
    prompt: {
      systemInvariants: ['Preserve local data ownership.'],
      scenarioResponsibilities: ['Complete the requested task.'],
      capabilityRules: ['Use only exposed capabilities.'],
      outputContract: ['Return a concise final answer.']
    },
    modelRequirement: {
      capabilities: ['text', 'toolCalling'],
      reasoningModes: ['off', 'low', 'medium', 'high']
    },
    capabilityPolicy: {
      defaultEffect: 'allow',
      maximumRisk: 'high',
      rules: [],
      scope: { pathPrefixes: ['/workspace'] },
      perRunLimits: { tool: 8, skill: 8, agent: 0, connector: 4 }
    },
    budgets: {
      maxToolCalls: 8,
      maxSubagents: 0,
      timeoutMs: 900_000,
      maxRetries: 2
    },
    publishedAt: 100,
    ...input
  })
}

describe('Agent Profile', () => {
  it.each([
    ['general', 'builtin.general'],
    ['folder', 'builtin.general'],
    ['space', 'builtin.space'],
    ['requirement-node', 'builtin.requirement-executor'],
    ['workflow-node', 'builtin.workflow-executor'],
    ['scheduled', 'builtin.workflow-executor'],
    ['sensitive', 'builtin.sensitive'],
    ['management', 'builtin.management']
  ] as const)('maps Scenario %s to built-in Profile %s', (scenario, id) => {
    const builtin = getBuiltinAgentProfile(scenario)

    expect(builtin.id).toBe(id)
    expect(builtin.source).toBe('system')
    expect(builtin.version).toBe('1.0.0')
    expect(builtin.budgets.maxToolCalls).toBe(256)
    expect(builtin.capabilityPolicy.perRunLimits.tool).toBe(256)
    expect(builtin.prompt.systemInvariants).toEqual(
      expect.arrayContaining([
        expect.stringContaining('local'),
        expect.stringContaining('permission')
      ])
    )
  })

  it('grants bounded delegation only to conversational research profiles', () => {
    expect(getBuiltinAgentProfile('general')).toMatchObject({
      budgets: { maxSubagents: 8 },
      capabilityPolicy: {
        perRunLimits: { agent: 8 }
      }
    })
    expect(getBuiltinAgentProfile('space')).toMatchObject({
      budgets: { maxSubagents: 8 },
      capabilityPolicy: {
        perRunLimits: { agent: 8 }
      }
    })
    expect(getBuiltinAgentProfile('requirement-node')).toMatchObject({
      budgets: { maxSubagents: 0 },
      capabilityPolicy: {
        perRunLimits: { agent: 0 }
      }
    })
  })

  it('renders stable structured Prompt sections and immutable publication digests', () => {
    const published = profile()
    const rendered = renderAgentPrompt(published, {
      businessContext: 'Workspace: RealmFlow'
    })

    expect(rendered.content).toBe(
      [
        '## System invariants',
        '- Preserve local data ownership.',
        '',
        '## Scenario responsibilities',
        '- Complete the requested task.',
        '',
        '## Business context',
        'Workspace: RealmFlow',
        '',
        '## Capability rules',
        '- Use only exposed capabilities.',
        '',
        '## Output contract',
        '- Return a concise final answer.'
      ].join('\n')
    )
    expect(published.profileDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(rendered.promptDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(published)).toBe(true)
    expect(Object.isFrozen(published.capabilityPolicy)).toBe(true)
  })

  it('applies deny rules and prevents higher layers from expanding risk or path scope', () => {
    const user = profile({
      id: 'user.general',
      source: 'user',
      capabilityPolicy: {
        defaultEffect: 'allow',
        maximumRisk: 'critical',
        rules: [
          {
            kind: 'tool',
            id: 'files.read',
            effect: 'deny'
          }
        ],
        scope: { pathPrefixes: ['/workspace', '/private'] },
        perRunLimits: { tool: 20, skill: 20, agent: 4, connector: 10 }
      }
    })

    const effective = resolveEffectiveAgentProfile({
      layers: [profile(), user],
      scope: { kind: 'folder', folderPath: '/workspace/project' },
      capabilities: [readCapability, deleteCapability],
      businessContext: 'Folder: /workspace/project'
    })

    expect(effective.capabilities).toEqual([])
    expect(effective.policy.maximumRisk).toBe('high')
    expect(effective.policy.scope.pathPrefixes).toEqual(['/workspace'])
    expect(effective.policy.perRunLimits).toEqual({
      tool: 8,
      skill: 8,
      agent: 0,
      connector: 4
    })
    expect(effective.rejectedOverrides).toEqual(
      expect.arrayContaining([
        expect.stringContaining('maximumRisk'),
        expect.stringContaining('/private'),
        expect.stringContaining('perRunLimits.tool')
      ])
    )
  })

  it('rejects startup when a required capability version is unavailable', () => {
    const required = profile({
      capabilityPolicy: {
        defaultEffect: 'deny',
        maximumRisk: 'high',
        rules: [
          {
            kind: 'tool',
            id: 'files.read',
            effect: 'require',
            versionRange: '^2.0.0'
          }
        ],
        scope: { pathPrefixes: ['/workspace'] },
        perRunLimits: { tool: 8, skill: 8, agent: 0, connector: 4 }
      }
    })

    expect(() =>
      resolveEffectiveAgentProfile({
        layers: [required],
        scope: { kind: 'folder', folderPath: '/workspace/project' },
        capabilities: [readCapability]
      })
    ).toThrow('Required capability is unavailable: tool files.read ^2.0.0')
  })

  it('rejects startup when a required capability digest has drifted', () => {
    const required = profile({
      capabilityPolicy: {
        defaultEffect: 'deny',
        maximumRisk: 'high',
        rules: [
          {
            kind: 'tool',
            id: 'files.read',
            effect: 'require',
            versionRange: '^1.0.0',
            digest: 'f'.repeat(64)
          }
        ],
        scope: { pathPrefixes: ['/workspace'] },
        perRunLimits: { tool: 8, skill: 8, agent: 0, connector: 4 }
      }
    })

    expect(() =>
      resolveEffectiveAgentProfile({
        layers: [required],
        scope: { kind: 'folder', folderPath: '/workspace/project' },
        capabilities: [readCapability]
      })
    ).toThrow('Required capability digest mismatch: tool files.read')
  })

  it('keeps an effective snapshot fixed when a later Profile version is published', () => {
    const v1 = profile()
    const running = resolveEffectiveAgentProfile({
      layers: [v1],
      scope: { kind: 'global' },
      capabilities: [readCapability]
    })
    const v2 = profile({
      version: '1.1.0',
      prompt: {
        ...v1.prompt,
        scenarioResponsibilities: ['Use the revised behavior.']
      },
      publishedAt: 200
    })

    expect(v2.profileDigest).not.toBe(v1.profileDigest)
    expect(running.profileVersion).toBe('1.0.0')
    expect(running.profileDigest).toBe(v1.profileDigest)
    expect(running.prompt).toContain('Complete the requested task.')
    expect(running.prompt).not.toContain('revised behavior')
    expect(Object.isFrozen(running)).toBe(true)
  })
})
