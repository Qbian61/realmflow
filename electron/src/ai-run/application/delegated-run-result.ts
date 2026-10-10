import type { AiRunEvent } from '../../../../domain/ai-run'
import type { SubagentTaskResult } from '../../../../domain/subagent'

export async function collectDelegatedRunResult(
  taskId: string,
  events: AsyncIterable<AiRunEvent>,
  signal: AbortSignal,
  initialAnswer = '',
): Promise<SubagentTaskResult> {
  let answer = initialAnswer
  let status: SubagentTaskResult['status'] = 'failed'
  let terminal = false
  let failure = 'Subagent task failed'
  let errorCode: string | undefined
  const evidence: SubagentTaskResult['evidence'] = []
  const artifactIds = new Set<string>()
  try {
    for await (const event of events) {
      if (event.type === 'answer.delta') answer = (answer + (event.data.delta ?? '')).slice(0, 12000)
      else if (event.type === 'reference.added' && event.data.reference && evidence.length < 20) {
        evidence.push({
          title: sanitizeSubagentText(event.data.reference.title),
          summary: sanitizeSubagentText(event.data.reference.summary),
          referenceId: event.data.reference.id
        })
      } else if (event.type === 'tool.call.completed' && event.data.toolResult?.status === 'completed') {
        for (const id of event.data.toolResult.artifactIds ?? []) {
          if (artifactIds.size < 50) artifactIds.add(id)
        }
      } else if (event.type === 'run.completed') status = 'completed'
      else if (event.type === 'run.cancelled') status = 'cancelled'
      else if (event.type === 'run.failed') {
        status = 'failed'
        failure = sanitizeSubagentText(event.data.message ?? failure)
        errorCode = event.data.errorCode ?? 'subagent_failed'
      }
      if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) {
        terminal = true
        break
      }
    }
  } catch (error) {
    status = 'failed'
    failure = sanitizeSubagentText(error instanceof Error ? error.message : failure)
    errorCode = 'subagent_failed'
  }
  if (signal.aborted && !terminal) status = 'cancelled'
  if (status === 'cancelled') {
    failure = 'Subagent task was cancelled'
    errorCode = undefined
  }
  return {
    taskId, status, summary: status === 'completed'
      ? sanitizeSubagentText(answer.trim() || 'Research task completed') : failure,
    evidence, unresolved: status === 'failed' ? [failure] : [],
    artifactIds: [...artifactIds], ...(errorCode ? { errorCode } : {})
  }
}

function sanitizeSubagentText(value: string): string {
  return value
    .replace(/(?:\/Users|\/home|\/tmp|[A-Za-z]:\\)[^\s"',}]*/g, '[local path]')
    .replace(/\b(?:authorization|cookie|password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '[redacted]')
    .slice(0, 4000)
}
