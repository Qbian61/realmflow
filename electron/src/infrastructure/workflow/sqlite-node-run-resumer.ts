import type Database from 'better-sqlite3'
import type { InterruptedNodeRunResumer } from '../../application/workflow/recover-workflows'
import type { ExecuteWorkflowNodeUseCase } from '../../application/workflow/execute-workflow-node'

export class SqliteNodeRunResumer implements InterruptedNodeRunResumer {
  constructor(
    private readonly database: Database.Database,
    private readonly executeNode: Pick<ExecuteWorkflowNodeUseCase, 'execute'>
  ) {}

  async resume(
    nodeRun: Parameters<InterruptedNodeRunResumer['resume']>[0]
  ): Promise<{ aiRunId: string }> {
    const execution = this.database
      .prepare(
        `SELECT requirement_id FROM workflow_executions
         WHERE id = ?`
      )
      .get(nodeRun.executionId) as { requirement_id: string } | undefined
    if (!execution) {
      throw new Error(`Workflow execution not found: ${nodeRun.executionId}`)
    }
    const modelProfileId =
      typeof nodeRun.checkpoint?.modelProfileId === 'string'
        ? nodeRun.checkpoint.modelProfileId
        : undefined
    const handle = await this.executeNode.execute({
      requirementId: execution.requirement_id,
      nodeId: nodeRun.nodeId,
      nodeRunId: nodeRun.id,
      ...(modelProfileId ? { modelProfileId } : {})
    })
    return { aiRunId: handle.runId }
  }
}
