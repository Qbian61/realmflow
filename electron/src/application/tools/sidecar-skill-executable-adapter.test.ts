import { vi } from 'vitest'
import type { SkillDefinition } from '../../../../domain/skill-definition'
import { SidecarSkillExecutableAdapter } from './sidecar-skill-executable-adapter'

const definition: SkillDefinition = {
  schemaVersion: 1,
  id: 'uploaded.skill.report',
  version: '2.1.0',
  definitionDigest: 'a'.repeat(64),
  package: {
    packageId: 'uploaded.reporting',
    packageVersion: '2.1.0',
    packageDigest: 'b'.repeat(64),
  },
  origin: 'local_upload',
  name: 'Report',
  description: 'Create a report.',
  instructionsPath: 'instructions/report.md',
  runtime: {
    kind: 'executable',
    runtime: 'python',
    entryPath: 'runtime/main.py',
    capabilities: ['filesystem.read', 'process.execute'],
    connectorServices: ['issues'],
    resources: { maxMemoryMb: 128, maxOutputBytes: 8192 },
  },
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  requiredTools: [],
  activation: { intents: ['report'], contexts: ['space'] },
  limits: { maxToolCalls: 2, timeoutMs: 30_000 },
}

describe('SidecarSkillExecutableAdapter', () => {
  it('executes only the fixed package entry with resolved scope and grants', async () => {
    const executeSkill = vi.fn().mockResolvedValue({
      output: { report: 'done' },
      metrics: { durationMs: 10, outputBytes: 17 },
    })
    const grant = {
      service: 'issues',
      url: 'http://127.0.0.1:43100/v1/skills/connectors/issues',
      token: 'one-run-token',
    }
    const release = vi.fn()
    const adapter = new SidecarSkillExecutableAdapter({
      packages: {
        resolveRoot: vi.fn().mockResolvedValue('/managed/package'),
      },
      scopes: {
        resolve: vi.fn().mockResolvedValue(['/workspace/project']),
      },
      connectors: {
        resolve: vi.fn().mockResolvedValue([grant]),
        release,
      },
      sidecar: {
        executeSkill,
        cancelSkillExecution: vi.fn(),
      },
    })
    const command = {
      definition,
      executionId: 'skill-execution-1',
      parentRunId: 'run-1',
      callId: 'call-1',
      context: {
        scope: { kind: 'space' as const, workspaceId: 'workspace-1' },
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
      },
      input: { topic: 'quality' },
      connectorBindings: [{ service: 'issues' }],
    }

    await expect(
      adapter.execute(command, new AbortController().signal),
    ).resolves.toEqual({
      output: { report: 'done' },
      metrics: { durationMs: 10, outputBytes: 17 },
    })
    expect(executeSkill).toHaveBeenCalledWith(
      {
        executionId: 'skill-execution-1',
        entryType: 'python',
        packageRoot: '/managed/package',
        entryPath: '/managed/package/runtime/main.py',
        input: { topic: 'quality' },
        capabilities: ['filesystem.read', 'process.execute'],
        scopeRoots: ['/workspace/project'],
        network: [
          grant,
        ],
        timeoutMs: 30_000,
        maxMemoryMb: 128,
        maxOutputBytes: 8192,
      },
      expect.any(AbortSignal),
    )
    expect(release).toHaveBeenCalledWith([grant])
  })

  it('rejects Connector grants not declared by the fixed Skill', async () => {
    const adapter = new SidecarSkillExecutableAdapter({
      packages: {
        resolveRoot: vi.fn().mockResolvedValue('/managed/package'),
      },
      scopes: { resolve: vi.fn().mockResolvedValue([]) },
      connectors: {
        resolve: vi.fn().mockResolvedValue([
          {
            service: 'admin',
            url: 'http://127.0.0.1:43100/v1/skills/connectors/admin',
            token: 'token',
          },
        ]),
        release: vi.fn(),
      },
      sidecar: {
        executeSkill: vi.fn(),
        cancelSkillExecution: vi.fn(),
      },
    })

    await expect(
      adapter.execute(
        {
          definition,
          executionId: 'skill-execution-2',
          parentRunId: 'run-1',
          callId: 'call-1',
          context: {
            scope: {
              kind: 'conversation',
              conversationId: 'conversation-1',
            },
            conversationId: 'conversation-1',
          },
          input: {},
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'skill_connector_unavailable' })
  })

  it('releases Connector grants when Sidecar execution fails', async () => {
    const grant = {
      service: 'issues',
      url: 'http://127.0.0.1:43100/v1/skills/connectors/issues',
      token: 'one-run-token',
    }
    const release = vi.fn()
    const adapter = new SidecarSkillExecutableAdapter({
      packages: {
        resolveRoot: vi.fn().mockResolvedValue('/managed/package'),
      },
      scopes: { resolve: vi.fn().mockResolvedValue([]) },
      connectors: {
        resolve: vi.fn().mockResolvedValue([grant]),
        release,
      },
      sidecar: {
        executeSkill: vi.fn().mockRejectedValue(new Error('Sidecar failed')),
        cancelSkillExecution: vi.fn(),
      },
    })

    await expect(
      adapter.execute(
        {
          definition,
          executionId: 'skill-execution-failed',
          parentRunId: 'run-1',
          callId: 'call-1',
          context: {
            scope: {
              kind: 'conversation',
              conversationId: 'conversation-1',
            },
            conversationId: 'conversation-1',
          },
          input: {},
          connectorBindings: [
            { service: 'issues', connectorId: 'connector-issues' },
          ],
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Sidecar failed')
    expect(release).toHaveBeenCalledWith([grant])
  })

  it('forwards cancellation to the Sidecar execution', async () => {
    const cancelSkillExecution = vi.fn().mockResolvedValue(true)
    const adapter = new SidecarSkillExecutableAdapter({
      packages: { resolveRoot: vi.fn() },
      scopes: { resolve: vi.fn() },
      connectors: { resolve: vi.fn(), release: vi.fn() },
      sidecar: {
        executeSkill: vi.fn(),
        cancelSkillExecution,
      },
    })

    await expect(adapter.cancel('skill-execution-3')).resolves.toBe(true)
    expect(cancelSkillExecution).toHaveBeenCalledWith('skill-execution-3')
  })
})
