import { describe, expect, it } from 'vitest'
import {
  isToolVersionInRange,
  normalizeSkillDefinition,
} from './skill-definition'

const definition = {
  schemaVersion: 1 as const,
  id: 'realmflow.skill.plan',
  version: '1.0.0',
  definitionDigest: 'a'.repeat(64),
  package: {
    packageId: 'realmflow.builtin.core-skills',
    packageVersion: '1.0.0',
    packageDigest: 'b'.repeat(64),
  },
  origin: 'builtin' as const,
  name: ' Plan requirement ',
  description: ' Create an implementation plan. ',
  instructionsPath: ' skills/plan/SKILL.md ',
  runtime: { kind: 'instruction' as const },
  inputSchema: {
    type: 'object',
    required: ['requirement'],
    properties: { requirement: { type: 'string' } },
  },
  outputSchema: {
    type: 'object',
    required: ['plan'],
    properties: { plan: { type: 'string' } },
  },
  requiredTools: [
    {
      toolId: 'builtin.files.read',
      versionRange: '^1.0.0',
      required: true,
    },
    {
      toolId: 'builtin.repository.search',
      versionRange: '>=1.0.0 <2.0.0',
      required: false,
    },
  ],
  activation: {
    intents: [' create plan ', 'plan requirement'],
    contexts: ['requirement', 'workflow'],
  },
  limits: {
    maxToolCalls: 32,
    timeoutMs: 300_000,
  },
}

describe('SkillDefinition', () => {
  it('normalizes a complete immutable definition without permissions', () => {
    expect(normalizeSkillDefinition(definition)).toEqual({
      ...definition,
      name: 'Plan requirement',
      description: 'Create an implementation plan.',
      instructionsPath: 'skills/plan/SKILL.md',
      requiredTools: definition.requiredTools,
      activation: {
        intents: ['create plan', 'plan requirement'],
        contexts: ['requirement', 'workflow'],
      },
    })
  })

  it('normalizes workflow and executable runtime declarations', () => {
    expect(
      normalizeSkillDefinition({
        ...definition,
        runtime: {
          kind: 'workflow',
          steps: [
            {
              id: 'inspect',
              instruction: ' Inspect the requested files. ',
              toolId: 'builtin.files.read',
            },
            {
              id: 'summarize',
              instruction: 'Summarize the findings.',
            },
          ],
        },
      }).runtime,
    ).toEqual({
      kind: 'workflow',
      steps: [
        {
          id: 'inspect',
          instruction: 'Inspect the requested files.',
          toolId: 'builtin.files.read',
        },
        {
          id: 'summarize',
          instruction: 'Summarize the findings.',
        },
      ],
    })

    expect(
      normalizeSkillDefinition({
        ...definition,
        runtime: {
          kind: 'executable',
          runtime: 'python',
          entryPath: 'runtime/main.py',
          capabilities: ['filesystem.read', 'process.execute'],
          connectorServices: ['issues'],
          resources: {
            maxMemoryMb: 128,
            maxOutputBytes: 65_536,
          },
        },
      }).runtime,
    ).toEqual({
      kind: 'executable',
      runtime: 'python',
      entryPath: 'runtime/main.py',
      capabilities: ['filesystem.read', 'process.execute'],
      connectorServices: ['issues'],
      resources: {
        maxMemoryMb: 128,
        maxOutputBytes: 65_536,
      },
    })
  })

  it.each([
    { label: 'schema version', changes: { schemaVersion: 2 } },
    { label: 'ID', changes: { id: '../plan' } },
    { label: 'semantic version', changes: { version: '1.0' } },
    { label: 'definition digest', changes: { definitionDigest: 'bad' } },
    {
      label: 'package digest',
      changes: {
        package: { ...definition.package, packageDigest: 'bad' },
      },
    },
    { label: 'origin', changes: { origin: 'remote' } },
    {
      label: 'instructions path',
      changes: { instructionsPath: '../SKILL.md' },
    },
    { label: 'runtime kind', changes: { runtime: { kind: 'prompt' } } },
    {
      label: 'workflow undeclared tool',
      changes: {
        runtime: {
          kind: 'workflow',
          steps: [
            {
              id: 'delete',
              instruction: 'Delete a file.',
              toolId: 'builtin.files.delete',
            },
          ],
        },
      },
    },
    {
      label: 'executable entry path',
      changes: {
        runtime: {
          kind: 'executable',
          runtime: 'python',
          entryPath: '../main.py',
          capabilities: ['process.execute'],
          connectorServices: [],
          resources: { maxMemoryMb: 128, maxOutputBytes: 1024 },
        },
      },
    },
    {
      label: 'executable capability',
      changes: {
        runtime: {
          kind: 'executable',
          runtime: 'python',
          entryPath: 'main.py',
          capabilities: ['computer.control'],
          connectorServices: [],
          resources: { maxMemoryMb: 128, maxOutputBytes: 1024 },
        },
      },
    },
    { label: 'input schema', changes: { inputSchema: [] } },
    {
      label: 'tool version range',
      changes: {
        requiredTools: [
          {
            toolId: 'builtin.files.read',
            versionRange: 'latest',
            required: true,
          },
        ],
      },
    },
    {
      label: 'duplicate tool requirement',
      changes: {
        requiredTools: [
          definition.requiredTools[0],
          definition.requiredTools[0],
        ],
      },
    },
    {
      label: 'activation context',
      changes: {
        activation: { ...definition.activation, contexts: ['admin'] },
      },
    },
    {
      label: 'tool call limit',
      changes: { limits: { ...definition.limits, maxToolCalls: 0 } },
    },
    {
      label: 'timeout',
      changes: { limits: { ...definition.limits, timeoutMs: 0 } },
    },
    {
      label: 'permission field',
      changes: { permissions: ['filesystem.read'] },
    },
  ])('rejects an invalid $label', ({ changes }) => {
    expect(() =>
      normalizeSkillDefinition({ ...definition, ...changes }),
    ).toThrow(/Skill definition/)
  })

  it('accepts exact, caret, tilde, wildcard, and comparator ranges', () => {
    for (const versionRange of [
      '1.2.3',
      '^1.2.3',
      '~1.2.3',
      '1.2.x',
      '>=1.0.0 <2.0.0',
    ]) {
      expect(
        normalizeSkillDefinition({
          ...definition,
          requiredTools: [
            {
              toolId: 'builtin.files.read',
              versionRange,
              required: true,
            },
          ],
        }).requiredTools[0].versionRange,
      ).toBe(versionRange)
    }
  })

  it('matches concrete Tool versions against every supported range form', () => {
    expect(isToolVersionInRange('1.2.3', '1.2.3')).toBe(true)
    expect(isToolVersionInRange('1.9.0', '^1.2.3')).toBe(true)
    expect(isToolVersionInRange('2.0.0', '^1.2.3')).toBe(false)
    expect(isToolVersionInRange('1.2.9', '~1.2.3')).toBe(true)
    expect(isToolVersionInRange('1.3.0', '~1.2.3')).toBe(false)
    expect(isToolVersionInRange('1.2.8', '1.2.x')).toBe(true)
    expect(isToolVersionInRange('1.8.0', '>=1.0.0 <2.0.0')).toBe(true)
    expect(isToolVersionInRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false)
  })
})
