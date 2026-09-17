import type { AiRunStatus } from '../../../domain/ai-run'
import type {
  RequirementNode,
  RequirementWorkflow
} from '../../../domain/workflow'
import type { RequirementStageId } from '../../domain/requirement'
import { isRequirementStageId } from '../../domain/requirement'

export function selectedWorkflowNodeId(
  workflow: RequirementWorkflow | undefined,
  activeStage: string
): string | undefined {
  return workflow?.nodes.find((node) => node.id === activeStage)?.id
}

export function runStatusLabel(status: AiRunStatus): string {
  const labels: Record<AiRunStatus, string> = {
    created: '正在创建',
    running: '生成中',
    cancelling: '正在取消',
    completed: '已完成并提交',
    failed: '生成失败',
    cancelled: '已取消',
    interrupted: '已中断，可重试'
  }
  return labels[status]
}

export function legacyStageFromNodeId(
  nodeId: string
): RequirementStageId | undefined {
  const candidate = nodeId.slice(nodeId.lastIndexOf(':') + 1)
  return isRequirementStageId(candidate) ? candidate : undefined
}

export function nodeStatusLabel(status: RequirementNode['status']): string {
  const labels: Record<RequirementNode['status'], string> = {
    pending: '待开始',
    ready: '可执行',
    running: '执行中',
    waiting_user: '等待输入',
    paused: '已暂停',
    blocked: '已阻塞',
    completed: '已完成',
    failed: '失败',
    skipped: '已跳过',
    cancelled: '已取消',
    interrupted: '已中断'
  }
  return labels[status]
}
