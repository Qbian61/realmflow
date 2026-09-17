import { useEffect } from 'react'
import type { RequirementWorkflow } from '../../../domain/workflow'
import type { WorkflowNodeExecutionDto } from '../../../shared/business'
import type { AiRunController } from './use-ai-run-controller'

export function useNodeRunSynchronization(input: {
  requirementId?: string
  nodeExecution?: WorkflowNodeExecutionDto
  aiRuns: AiRunController
  setWorkflow: (workflow: RequirementWorkflow) => void
  setNodeExecution: (execution?: WorkflowNodeExecutionDto) => void
}): void {
  const aiRunId = input.nodeExecution?.nodeRun.aiRunId
  const nodeId = input.nodeExecution?.nodeRun.nodeId
  const runStatus = aiRunId ? input.aiRuns.runs[aiRunId]?.status : undefined

  useEffect(() => {
    if (!aiRunId || input.aiRuns.runs[aiRunId]) return
    void input.aiRuns.attach(aiRunId)
  }, [aiRunId, input.aiRuns.attach])

  useEffect(() => {
    const business = window.realmflow?.business
    if (
      !business ||
      !input.requirementId ||
      !nodeId ||
      !runStatus ||
      !['completed', 'failed', 'cancelled'].includes(runStatus)
    ) {
      return
    }
    void Promise.all([
      business.getRequirementWorkflow({
        requirementId: input.requirementId
      }),
      business.getWorkflowNodeExecution({
        requirementId: input.requirementId,
        nodeId
      })
    ]).then(([workflow, execution]) => {
      if (workflow) input.setWorkflow(workflow)
      input.setNodeExecution(execution)
    })
  }, [input.requirementId, nodeId, runStatus])
}
