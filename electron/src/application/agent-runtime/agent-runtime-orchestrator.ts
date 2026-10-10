import { isDeepStrictEqual } from 'node:util'
import type { AgentRuntimeRun } from '../../../../domain/agent-runtime'
import type { ChatSessionRecord } from '../ports/business-repositories'
import type { AgentRuntimeStatus, RuntimeRunSummary } from '../../../../shared/agent-runtime-state'
import { sanitizeRuntimeText, type RuntimeStateService, type GoalInput, type ProgressInput } from './runtime-state-service'
import { validateRuntimeCommand } from './runtime-command-contract'
import { MAX_DELEGATION_DEPTH, MAX_DELEGATION_CONCURRENCY, type DelegationRequest } from '../../../../domain/subagent'
import type { RuntimeDelegationService } from './runtime-delegation-service'
import type { RuntimeDelegation } from './runtime-delegation'

type Dependencies = {
  runs: {
    get(runId: string): Promise<AgentRuntimeRun | undefined>
    listByRoot(rootRunId: string): Promise<AgentRuntimeRun[]>
  }
  sessions: { get(sessionId: string): Promise<ChatSessionRecord | undefined> }
  state: RuntimeStateService
  delegations?: RuntimeDelegationService
}

export class AgentRuntimeOrchestrator {
  constructor(private readonly dependencies: Dependencies) {}

  async command(
    runId: string, requestId: string, toolId: string, input: Record<string, unknown>, signal?: AbortSignal
  ): Promise<object> {
    const { current, tree } = await this.authorizedTree(runId)
    validateRuntimeCommand(toolId, input)
    const id = current.id
    switch (toolId) {
      case 'session_status': return this.status(id)
      case 'agents_list': return { agents: [{
        id: current.snapshot.agentProfileId, version: current.snapshot.agentProfileVersion,
        mode: 'research', maximumDepth: MAX_DELEGATION_DEPTH, maximumConcurrency: MAX_DELEGATION_CONCURRENCY,
        available: Boolean(this.dependencies.delegations) &&
          ['general', 'space'].includes(current.snapshot.scenarioId) &&
          current.snapshot.delegationDepth < MAX_DELEGATION_DEPTH &&
          current.snapshot.budgets.maxSubagents > 0 &&
          !['completed', 'failed', 'cancelled'].includes(current.status)
      }] }
      case 'sessions_spawn': {
        if (!this.dependencies.delegations || !signal) throw new Error('runtime_run_unavailable')
        return { children: this.dependencies.delegations.spawn(id, requestId, input as DelegationRequest, signal)
          .map(delegationSummary) }
      }
      case 'sessions_yield': {
        if (!this.dependencies.delegations) throw new Error('runtime_run_unavailable')
        if (signal?.aborted) throw new Error('request_cancelled')
        return { children: (await this.dependencies.delegations.wait(id, input.runIds as string[], input.waitMs as number | undefined))
          .map(delegationSummary) }
      }
      case 'sessions_history': return this.history(id, input.sessionId as string | undefined, input.limit as number | undefined)
      case 'sessions': {
        const result = await this.listSessions(id)
        const query = input.action === 'search' ? String(input.query ?? '').toLocaleLowerCase() : ''
        return { sessions: result.sessions.filter((item) => item.title.toLocaleLowerCase().includes(query))
          .slice(0, Number(input.limit ?? 50)) }
      }
      case 'goal': {
        if (input.action === 'get') return { goal: this.dependencies.state.read(id).goal ?? null }
        const { action: _action, ...goal } = input
        return this.dependencies.state.goal(id, requestId, goal as GoalInput)
      }
      case 'progress_card': return this.dependencies.state.progress(id, requestId, input as ProgressInput)
      case 'steer': return this.dependencies.state.steer(id, requestId, {
        sourceRunId: id, message: input.message as string
      })
      case 'sessions_send': {
        const candidates = tree.filter((run) => run.snapshot.conversationId === input.sessionId)
          .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        const target = candidates[0]
        if (!target) throw new Error('runtime_scope_denied')
        return this.dependencies.state.send(id, requestId, {
          targetRunId: target.id, sessionId: input.sessionId as string, message: input.message as string
        })
      }
      default: throw new Error('runtime_command_invalid')
    }
  }

  async listSessions(runId: string): Promise<{ sessions: Array<{ id: string; title: string }> }> {
    const { tree } = await this.authorizedTree(runId)
    const ids = [...new Set(tree.flatMap(({ snapshot }) => snapshot.conversationId ? [snapshot.conversationId] : []))]
    const sessions: Array<{ id: string; title: string }> = []
    for (const id of ids.slice(0, 50)) {
      const session = await this.dependencies.sessions.get(id)
      if (session) sessions.push({ id, title: sanitizeRuntimeText(session.title).slice(0, 240) })
    }
    return { sessions }
  }

  async status(runId: string): Promise<AgentRuntimeStatus> {
    const { current, tree } = await this.authorizedTree(runId)
    return {
      ...runSummary(current),
      budgets: { ...current.snapshot.budgets },
      state: this.dependencies.state.read(current.id),
      delegations: (this.dependencies.delegations?.list(current.id) ?? []).map(delegationSummary),
      children: tree.filter(({ snapshot }) => snapshot.parentRunId === current.id).map(runSummary)
    }
  }

  async history(runId: string, sessionId?: string, limit = 20): Promise<{
    messages: Array<{ id: string; role: string; text: string }>
    truncated: boolean
    trust: string
  }> {
    const { current, tree } = await this.authorizedTree(runId)
    const target = sessionId ?? current.snapshot.conversationId
    if (!target || !tree.some(({ snapshot }) => snapshot.conversationId === target)) {
      throw new Error('runtime_scope_denied')
    }
    const session = await this.dependencies.sessions.get(target)
    if (!session) throw new Error('runtime_scope_denied')
    const visible = session.messages.filter(({ role, status }) =>
      status === 'completed' && (role === 'user' || role === 'assistant'))
    const count = Number.isSafeInteger(limit) ? Math.min(20, Math.max(1, limit)) : 20
    const selected = visible.slice(-count)
    const result = {
      messages: selected.map(({ id, role, content }) => ({
        id, role, text: sanitizeRuntimeText(content).slice(0, 2000)
      })),
      truncated: selected.length < visible.length || selected.some(({ content }) => content.length > 2000),
      trust: 'untrusted_session_content'
    }
    while (result.messages.length > 0 && Buffer.byteLength(JSON.stringify(result)) > 16384) {
      result.messages.shift()
      result.truncated = true
    }
    return result
  }

  private async authorizedTree(runId: string): Promise<{ current: AgentRuntimeRun; tree: AgentRuntimeRun[] }> {
    const current = await this.dependencies.runs.get(runId)
    if (!current) throw new Error('runtime_run_unavailable')
    const all = await this.dependencies.runs.listByRoot(current.snapshot.rootRunId)
    const tree = [current, ...all.filter((run) => run.id !== current.id)].filter(({ snapshot }) =>
      snapshot.rootRunId === current.snapshot.rootRunId && isDeepStrictEqual(snapshot.scope, current.snapshot.scope))
    return { current, tree }
  }
}

function delegationSummary(record: RuntimeDelegation) {
  return {
    runId: record.runId, sessionId: record.sessionId, parentRunId: record.parentRunId,
    status: record.status, objective: sanitizeRuntimeText(record.task.objective).slice(0, 2000),
    ...(record.result ? { result: record.result } : {})
  }
}

function runSummary(run: AgentRuntimeRun): RuntimeRunSummary {
  return {
    runId: run.id, sessionId: run.snapshot.conversationId,
    rootRunId: run.snapshot.rootRunId, parentRunId: run.snapshot.parentRunId,
    status: run.status, createdAt: run.createdAt, updatedAt: run.updatedAt
  }
}
