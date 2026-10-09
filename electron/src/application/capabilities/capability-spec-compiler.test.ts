import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { createCapabilitySpec } from '../../../../domain/capability-builder'
import { CapabilityPackageService } from './capability-package-service'
import { CapabilityDraftWorkspace } from './capability-draft-workspace'
import { CapabilitySpecCompiler } from './capability-spec-compiler'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'realmflow-builder-compiler-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('CapabilitySpecCompiler', () => {
  it.each([
    ['connector', connectorSpec(), ['capability.yaml', 'README.md']],
    ['skill', skillSpec(), ['capability.yaml', 'README.md', 'SKILL.md']],
    ['agent', agentSpec(), ['capability.yaml', 'README.md', 'PROMPT.md']]
  ] as const)(
    'compiles a deterministic %s package accepted by the package validator',
    async (_kind, source, expectedFiles) => {
      const spec = createCapabilitySpec(source)
      const compiler = new CapabilitySpecCompiler()

      const first = compiler.compile(spec)
      const replay = compiler.compile(spec)

      expect(first).toEqual(replay)
      expect(Object.keys(first.files).sort()).toEqual(
        [...expectedFiles].sort()
      )
      const manifest = parse(first.files['capability.yaml'])
      expect(manifest).toMatchObject({
        schemaVersion: 1,
        id: spec.id,
        kind: spec.kind,
        version: spec.version,
        testPlan: [
          {
            id: 'contract',
            command: `realmflow:contract:${
              spec.kind === 'connector'
                ? 'http-connector'
                : spec.kind === 'skill'
                  ? 'instruction-skill'
                  : 'agent-profile'
            }`
          }
        ]
      })

      const workspace = new CapabilityDraftWorkspace({
        userDataPath: root,
        createId: () => 'temporary-1'
      })
      const path = await workspace.publish({
        sessionId: 'generation-1',
        revision: 1,
        files: first.files
      })
      const prepared = await new CapabilityPackageService({
        userDataPath: root,
        realmFlowVersion: '0.1.0',
        platform: 'darwin',
        createId: () => 'package-1',
        now: () => 100,
        runTest: async ({ id }) => ({ id, status: 'passed' })
      }).prepare(path)

      expect(prepared.definition).toMatchObject({
        id: spec.id,
        kind: spec.kind,
        source: 'local_upload'
      })
      await prepared.pending.rollback()
    }
  )

  it('keeps credential values out of generated files', () => {
    const compiled = new CapabilitySpecCompiler().compile(
      createCapabilitySpec(connectorSpec())
    )
    const serialized = JSON.stringify(compiled.files)

    expect(serialized).toContain('issue-api-key')
    expect(serialized).not.toContain('top-secret-value')
    expect(
      parse(compiled.files['capability.yaml']).runtime.credentialRefs
    ).toEqual(['issue-api-key'])
  })

  it('rejects unsupported executable generation', () => {
    expect(() =>
      createCapabilitySpec({
        ...skillSpec(),
        runtime: {
          kind: 'skill',
          instructions: 'Execute a command.',
          executable: true
        }
      })
    ).toThrow('Capability Builder only supports instruction Skills')

    expect(() =>
      createCapabilitySpec({
        ...connectorSpec(),
        runtime: {
          ...connectorSpec().runtime,
          connectorKind: 'database'
        }
      })
    ).toThrow('Capability Builder only supports HTTP Connectors')
  })
})

function connectorSpec() {
  return {
    schemaVersion: 1 as const,
    id: 'com.example.issue-lookup',
    kind: 'connector' as const,
    version: '1.0.0',
    name: 'Issue lookup',
    description: 'Reads issue details.',
    scope: { kind: 'workspace' as const, workspaceId: 'workspace-1' },
    runtime: {
      kind: 'connector' as const,
      connectorKind: 'http' as const,
      baseUrl: 'https://api.example.com',
      method: 'GET' as const,
      path: '/issues/{issueId}',
      credentialRefs: ['issue-api-key'],
      externalWrite: false
    },
    permissions: {
      capabilities: ['network.connect' as const, 'credential.use' as const],
      maximumRisk: 'medium' as const,
      pathPrefixes: [],
      networkTargets: ['api.example.com']
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0',
      platforms: ['darwin' as const]
    }
  }
}

function skillSpec() {
  return {
    ...connectorSpec(),
    id: 'com.example.review-skill',
    kind: 'skill' as const,
    name: 'Review skill',
    description: 'Reviews changes.',
    runtime: {
      kind: 'skill' as const,
      instructions: 'Review changes and return prioritized findings.',
      executable: false as const
    },
    permissions: {
      capabilities: [],
      maximumRisk: 'low' as const,
      pathPrefixes: [],
      networkTargets: []
    }
  }
}

function agentSpec() {
  return {
    ...connectorSpec(),
    id: 'com.example.review-agent',
    kind: 'agent' as const,
    name: 'Review agent',
    description: 'Coordinates reviews.',
    runtime: {
      kind: 'agent' as const,
      prompt: 'Review changes and return prioritized findings.',
      modelCapabilities: ['tool_calling'],
      reasoningModes: ['medium' as const],
      delegation: { allowed: false as const, maximumDepth: 0 }
    },
    permissions: {
      capabilities: [],
      maximumRisk: 'low' as const,
      pathPrefixes: [],
      networkTargets: []
    }
  }
}
