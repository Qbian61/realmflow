import type {
  NodeRunRecord,
  NodeRunRepository,
  Revisioned,
  SaveResult
} from '../ports/business-repositories'
import { RecoverInterruptedNodeRunsUseCase } from './recover-workflows'

class MemoryNodeRunRepository implements NodeRunRepository {
  constructor(readonly records: Array<Revisioned<NodeRunRecord>>) {}

  async get(id: string): Promise<Revisioned<NodeRunRecord> | undefined> {
    return this.records.find((record) => record.id === id)
  }

  async getLatestByNode(
    executionId: string,
    nodeId: string
  ): Promise<Revisioned<NodeRunRecord> | undefined> {
    return this.records
      .filter(
        (record) =>
          record.executionId === executionId && record.nodeId === nodeId
      )
      .sort((left, right) => right.attempt - left.attempt)[0]
  }

  async listInterrupted(): Promise<Array<Revisioned<NodeRunRecord>>> {
    return this.records.filter((record) => record.status === 'interrupted')
  }

  async interruptRunning(updatedAt: number): Promise<number> {
    let changed = 0
    this.records.forEach((record, index) => {
      if (record.status !== 'running') return
      this.records[index] = {
        ...record,
        status: 'interrupted',
        revision: record.revision + 1,
        updatedAt
      }
      changed += 1
    })
    return changed
  }

  async save(
    entity: NodeRunRecord,
    expectedRevision: number
  ): Promise<SaveResult<NodeRunRecord>> {
    const index = this.records.findIndex((record) => record.id === entity.id)
    const current = this.records[index]
    if (!current || current.revision !== expectedRevision) {
      if (!current) throw new Error('Node run not found')
      return { status: 'conflict', entity: current }
    }
    const saved = { ...entity, revision: expectedRevision + 1 }
    this.records[index] = saved
    return { status: 'saved', entity: saved }
  }

  async deleteByNode(executionId: string, nodeId: string): Promise<number> {
    const retained = this.records.filter(
      (record) =>
        record.executionId !== executionId || record.nodeId !== nodeId
    )
    const deleted = this.records.length - retained.length
    this.records.splice(0, this.records.length, ...retained)
    return deleted
  }
}

function run(
  id: string,
  status: NodeRunRecord['status']
): Revisioned<NodeRunRecord> {
  return {
    id,
    executionId: 'execution-1',
    nodeId: `node-${id}`,
    status,
    attempt: 1,
    checkpoint: { content: 'partial' },
    revision: 1,
    createdAt: 1,
    updatedAt: 1
  }
}

describe('RecoverInterruptedNodeRunsUseCase', () => {
  it('automatically resumes interrupted runs and ignores user-paused runs', async () => {
    const repository = new MemoryNodeRunRepository([
      run('interrupted', 'interrupted'),
      run('running', 'running'),
      run('paused', 'paused')
    ])
    const resumed: string[] = []
    const useCase = new RecoverInterruptedNodeRunsUseCase(repository, {
      resume: async (nodeRun) => {
        resumed.push(nodeRun.id)
        const current = await repository.get(nodeRun.id)
        if (!current) throw new Error('Node run not found')
        await repository.save(
          {
            ...current,
            aiRunId: `ai-run-${nodeRun.id}`,
            status: 'running',
            updatedAt: 2
          },
          current.revision
        )
        return { aiRunId: `ai-run-${nodeRun.id}` }
      }
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 2,
      failed: 0
    })
    expect(resumed).toEqual(['interrupted', 'running'])
    expect(repository.records).toEqual([
      expect.objectContaining({
        id: 'interrupted',
        aiRunId: 'ai-run-interrupted',
        status: 'running',
        revision: 2
      }),
      expect.objectContaining({
        id: 'running',
        aiRunId: 'ai-run-running',
        status: 'running',
        revision: 3
      }),
      expect.objectContaining({ id: 'paused', status: 'paused', revision: 1 })
    ])
  })

  it('keeps a failed automatic resume interrupted with an error', async () => {
    const repository = new MemoryNodeRunRepository([
      run('interrupted', 'interrupted')
    ])
    const useCase = new RecoverInterruptedNodeRunsUseCase(repository, {
      resume: async () => {
        throw new Error('provider unavailable')
      }
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 0,
      failed: 1
    })
    expect(repository.records[0]).toMatchObject({
      status: 'interrupted',
      error: 'provider unavailable',
      revision: 2
    })
  })
})
