import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCapabilitySpec,
  type CapabilitySpecSource
} from '../../../../domain/capability-builder'
import { CapabilityDraftWorkspace } from './capability-draft-workspace'
import { CapabilitySpecCompiler } from './capability-spec-compiler'
import { DeterministicCapabilityContractTestRunner } from './deterministic-capability-contract-test-runner'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  )
})

describe('DeterministicCapabilityContractTestRunner', () => {
  it.each([
    ['http-connector', connectorSpec()],
    ['instruction-skill', skillSpec()],
    ['agent-profile', agentSpec()]
  ] as const)('validates the generated %s contract', async (kind, source) => {
    const path = await publish(source)
    const result = await new DeterministicCapabilityContractTestRunner().run(
      { id: 'contract', command: `realmflow:contract:${kind}` },
      path
    )

    expect(result).toEqual({
      id: 'contract',
      status: 'passed',
      detail: 'Deterministic package contract passed'
    })
  })

  it('fails closed for unknown commands and invalid package resources', async () => {
    const path = await publish(skillSpec())
    await writeFile(join(path, 'SKILL.md'), ' \n', 'utf8')
    const runner = new DeterministicCapabilityContractTestRunner()

    await expect(
      runner.run(
        {
          id: 'unknown',
          command: 'shell:run-arbitrary-user-command'
        },
        path
      )
    ).resolves.toMatchObject({
      id: 'unknown',
      status: 'failed',
      detail: 'Capability contract command is unsupported'
    })
    await expect(
      runner.run(
        {
          id: 'contract',
          command: 'realmflow:contract:instruction-skill'
        },
        path
      )
    ).resolves.toMatchObject({
      id: 'contract',
      status: 'failed',
      detail: 'Capability contract resource is empty'
    })
  })
})

async function publish(source: CapabilitySpecSource) {
  const root = await mkdtemp(join(tmpdir(), 'realmflow-contract-'))
  roots.push(root)
  const workspace = new CapabilityDraftWorkspace({
    userDataPath: root,
    createId: () => 'temporary-1'
  })
  const compiled = new CapabilitySpecCompiler().compile(
    createCapabilitySpec(source)
  )
  return workspace.publish({
    sessionId: 'generation-1',
    revision: 1,
    files: compiled.files
  })
}

function connectorSpec() {
  return {
    schemaVersion: 1 as const,
    id: 'com.example.issue-lookup',
    kind: 'connector' as const,
    version: '1.0.0',
    name: 'Issue lookup',
    description: 'Reads issue details.',
    scope: { kind: 'global' as const },
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
