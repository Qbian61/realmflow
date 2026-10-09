import { useEffect } from 'react'
import type { RequirementWorkflow } from '../../../domain/workflow'
import type { WorkflowNodeExecutionDto } from '../../../shared/business'
import type { AiRunController } from './use-ai-run-controller'

export function useNodeRunSynchronization(input: {
  requirementId?: string
  nodeExecution?: WorkflowNodeExecutionDto
  activeNodeIds?: string[]
  selectedNodeId?: string
  aiRuns: AiRunController
  setWorkflow: (workflow: RequirementWorkflow) => void
  setNodeExecution: (execution?: WorkflowNodeExecutionDto) => void
  refreshExecutionView?: (nodeId?: string) => Promise<void>
}): void {
  const aiRunId = input.nodeExecution?.nodeRun.aiRunId
  const nodeId = input.nodeExecution?.nodeRun.nodeId
  const runStatus = aiRunId ? input.aiRuns.runs[aiRunId]?.status : undefined
  const activeRunSignature = (input.activeNodeIds ?? [])
    .filter((activeNodeId) => activeNodeId !== nodeId)
    .map((activeNodeId) => {
      const run = input.requirementId
        ? input.aiRuns.findRun(input.requirementId, activeNodeId)
        : undefined
      return `${activeNodeId}:${run?.status ?? 'unknown'}`
    })
    .join('|')

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
    if (
      input.refreshExecutionView &&
      typeof business.getRequirementExecutionView === 'function'
    ) {
      void input.refreshExecutionView(nodeId)
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
  }, [input.requirementId, input.refreshExecutionView, nodeId, runStatus])

  useEffect(() => {
    if (!input.refreshExecutionView || !activeRunSignature) return
    const hasTerminalRun = activeRunSignature
      .split('|')
      .some((entry) =>
        ['completed', 'failed', 'cancelled'].some((status) =>
          entry.endsWith(`:${status}`)
        )
      )
    if (!hasTerminalRun) return
    void input.refreshExecutionView(input.selectedNodeId)
  }, [
    activeRunSignature,
    input.refreshExecutionView,
    input.selectedNodeId
  ])
}
