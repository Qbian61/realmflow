import type {
  Revisioned,
  WorkflowRollbackOperationRecord,
  WorkflowRollbackOperationRepository
} from '../ports/business-repositories'

export type RollbackCoordinationWarning =
  | 'ai_run_cancellation_failed'
  | 'knowledge_sync_failed'
  | 'coordination_persistence_failed'

type Dependencies = {
  workflowRollbacks: Pick<WorkflowRollbackOperationRepository, 'save'>
  cancel: {
    execute: (
      runId: string,
      options?: { forceProvider?: boolean }
    ) => Promise<void>
  }
  knowledgeSync: {
    execute: (requirementId: string) => Promise<{
      synced: number
      skipped: number
      failed: number
    }>
  }
}

export type RollbackCoordinationResult = {
  operation: Revisioned<WorkflowRollbackOperationRecord>
  warnings: RollbackCoordinationWarning[]
}

export class CoordinateWorkflowRollbackUseCase {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {}

  async execute(
    operation: Revisioned<WorkflowRollbackOperationRecord>
  ): Promise<RollbackCoordinationResult> {
    const warnings: RollbackCoordinationWarning[] = []
    const pendingAiRunIds: string[] = []
    for (const runId of operation.pendingAiRunIds) {
      try {
        await this.dependencies.cancel.execute(runId, {
          forceProvider: true
        })
      } catch {
        pendingAiRunIds.push(runId)
      }
    }
    if (pendingAiRunIds.length > 0) {
      warnings.push('ai_run_cancellation_failed')
    }

    let knowledgeSyncPending = false
    if (operation.knowledgeSyncPending) {
      try {
        const result = await this.dependencies.knowledgeSync.execute(
          operation.requirementId
        )
        knowledgeSyncPending = result.failed > 0
      } catch {
        knowledgeSyncPending = true
      }
    }
    if (knowledgeSyncPending) warnings.push('knowledge_sync_failed')

    const timestamp = this.now()
    const operationResult = await this.dependencies.workflowRollbacks
      .save(
        {
          ...operation,
          pendingAiRunIds,
          knowledgeSyncPending,
          status:
            pendingAiRunIds.length > 0 || knowledgeSyncPending
              ? 'coordination_pending'
              : 'completed',
          error: warnings.length > 0 ? warnings.join(',') : undefined,
          updatedAt: timestamp,
          completedAt: warnings.length === 0 ? timestamp : undefined
        },
        operation.revision
      )
      .catch(() => undefined)
    if (!operationResult || operationResult.status === 'conflict') {
      return {
        operation,
        warnings: [...warnings, 'coordination_persistence_failed']
      }
    }
    return {
      operation: operationResult.entity,
      warnings
    }
  }
}
