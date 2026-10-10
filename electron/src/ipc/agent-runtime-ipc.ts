import type { IpcMain } from 'electron'
import { requireExactKeys, requireIdentifier, requireObject } from '../../../domain/tool-protocol-validation'
import { IPC_COMMAND_CHANNELS, IPC_QUERY_CHANNELS } from '../../../shared/ipc-contract'
import type { AgentRuntimeOrchestrator } from '../application/agent-runtime/agent-runtime-orchestrator'
import type { AgentRuntimeRun } from '../../../domain/agent-runtime'
import { validateRuntimeCommand } from '../application/agent-runtime/runtime-command-contract'

export function registerAgentRuntimeIpc({ orchestrator, resolveRunId, resolveRun, cancel, ipcMain }: {
  orchestrator: Pick<AgentRuntimeOrchestrator, 'status' | 'command'>
  resolveRunId(id: string): Promise<string | undefined>
  resolveRun(id: string): Promise<AgentRuntimeRun | undefined>
  cancel(runId: string): Promise<void>
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  const routes = [
    [IPC_QUERY_CHANNELS.agentRuntimeGet, undefined, ['runId']],
    [IPC_COMMAND_CHANNELS.agentRuntimeUpdateGoal, 'goal', ['runId', 'requestId', 'objective', 'status', 'expectedRevision']],
    [IPC_COMMAND_CHANNELS.agentRuntimeSteer, 'steer', ['runId', 'requestId', 'message']]
  ] as const
  for (const [channel, tool, keys] of routes) {
    ipcMain.handle(channel, async (_event, ...values) => {
      if (values.length !== 1) throw new Error('runtime_command_invalid')
      const value = requireObject(values[0], 'Runtime command')
      requireExactKeys(value, new Set<string>(keys), 'Runtime command')
      const requestedId = requireIdentifier(value.runId, 'Run ID')
      const { runId: _runId, requestId, ...fields } = value
      const input = tool === 'goal' ? { action: 'update', ...fields } : fields
      if (tool) validateRuntimeCommand(tool, input)
      const commandId = tool ? requireIdentifier(requestId, 'Request ID') : undefined
      const runId = await resolveRunId(requestedId)
      if (!runId) throw new Error('runtime_run_unavailable')
      if (tool) await orchestrator.command(runId, commandId!, tool, input)
      return orchestrator.status(runId)
    })
  }
  ipcMain.handle(IPC_COMMAND_CHANNELS.agentRuntimeCancel, async (_event, ...values) => {
    if (values.length !== 1) throw new Error('runtime_command_invalid')
    const value = requireObject(values[0], 'Runtime cancel command')
    requireExactKeys(value, new Set(['runId', 'sessionId']), 'Runtime cancel command')
    const requestedId = requireIdentifier(value.runId, 'Run ID')
    const sessionId = requireIdentifier(value.sessionId, 'Session ID')
    const runId = await resolveRunId(requestedId)
    if (!runId) throw new Error('runtime_run_unavailable')
    const run = await resolveRun(runId)
    if (!run) throw new Error('runtime_run_unavailable')
    if (run.snapshot.conversationId !== sessionId) throw new Error('runtime_scope_denied')
    await cancel(runId)
  })
}
