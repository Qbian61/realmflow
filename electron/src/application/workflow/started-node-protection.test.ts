import { describe, expect, it } from 'vitest'
import type {
  ArtifactMetadataRecord,
  NodeRunRecord,
  Revisioned
} from '../ports/business-repositories'
import { StartedNodeProtection } from './started-node-protection'

function createHarness(input?: {
  run?: Revisioned<NodeRunRecord>
  runs?: Array<Revisioned<NodeRunRecord>>
  artifacts?: Array<Revisioned<ArtifactMetadataRecord>>
}) {
  return new StartedNodeProtection({
    nodeRuns: {
      listByNode: async () => input?.runs ?? (input?.run ? [input.run] : [])
    },
    artifacts: {
      listByRequirement: async () => input?.artifacts ?? []
    }
  })
}

function run(
  status: NodeRunRecord['status'],
  overrides: Partial<Revisioned<NodeRunRecord>> = {}
): Revisioned<NodeRunRecord> {
  return {
    id: 'run-1',
    executionId: 'execution-1',
    nodeId: 'node-1',
    status,
    attempt: 1,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('StartedNodeProtection', () => {
  it.each([
    'running',
    'waiting_user',
    'paused',
    'blocked',
    'completed',
    'failed',
    'skipped',
    'cancelled',
    'interrupted'
  ] satisfies NodeRunRecord['status'][])(
    'protects a node whose latest run is %s',
    async (status) => {
      const protection = createHarness({ run: run(status) })

      await expect(
        protection.assertUnstarted('requirement-1', ['node-1'])
      ).rejects.toThrow(
        'Workflow node has already started and is protected: node-1'
      )
    }
  )

  it.each([
    { attempt: 2 },
    { aiRunId: 'ai-run-1' },
    { checkpoint: { cursor: 3 } },
    { error: 'provider failed' },
    { completedAt: 10 }
  ] satisfies Array<Partial<Revisioned<NodeRunRecord>>>)(
    'protects hidden execution evidence on an editable run: %o',
    async (evidence) => {
      const protection = createHarness({
        run: run('pending', evidence)
      })

      await expect(
        protection.assertUnstarted('requirement-1', ['node-1'])
      ).rejects.toThrow(
        'Workflow node has already started and is protected: node-1'
      )
    }
  )

  it('protects a node referenced by a formal artifact', async () => {
    const protection = createHarness({
      run: run('pending'),
      artifacts: [
        {
          id: 'artifact-1',
          requirementId: 'requirement-1',
          stageId: 'analysis',
          nodeId: 'node-1',
          relativePath: 'artifacts/analysis.md',
          kind: 'markdown',
          checksum: 'checksum',
          version: 1,
          byteSize: 12,
          isPrimary: true,
          revision: 1,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    })

    await expect(
      protection.assertUnstarted('requirement-1', ['node-1'])
    ).rejects.toThrow(
      'Workflow node has already started and is protected: node-1'
    )
  })

  it('protects an older started run even when the latest run looks editable', async () => {
    const protection = createHarness({
      runs: [run('failed'), run('pending', { id: 'run-2' })]
    })

    await expect(
      protection.assertUnstarted('requirement-1', ['node-1'])
    ).rejects.toThrow(
      'Workflow node has already started and is protected: node-1'
    )
  })

  it.each(['pending', 'ready'] satisfies NodeRunRecord['status'][])(
    'allows a clean %s placeholder run',
    async (status) => {
      const protection = createHarness({ run: run(status) })

      await expect(
        protection.assertUnstarted('requirement-1', ['node-1'])
      ).resolves.toBeUndefined()
    }
  )
})
