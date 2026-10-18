import {
  mapDshSessionLifecycleToAgentRunLifecycle,
  type AgentRunLifecycleStatus
} from '../../../../domain/agent-runtime'
import type {
  DshSessionBinding,
  DshSessionBindingLifecycleStatus
} from '../../../../domain/dsh-session-binding'
import type { DshRunOwner } from '../../../../domain/dsh-run-manifest'
import type {
  DshAcpMcpServer,
  DshAcpPromptBlock,
  DshAcpRuntimePort
} from '../../ai-run/application/ports'

export type DshSessionLifecycleProjectionWait = {
  sessionId: string
  kind: 'session.closed' | 'session.resumed'
  afterSequence: number
}

export type DshSessionLifecycleProjectionPort = {
  waitForDurableSessionEvent(
    input: DshSessionLifecycleProjectionWait
  ): Promise<{ sequence: number }> | { sequence: number }
}

export type DshSessionLifecycleSessionStore = {
  getByOwner(
    owner: DshRunOwner
  ): Promise<DshSessionBinding | undefined> | DshSessionBinding | undefined
  transition(
    dshSessionId: string,
    lifecycleStatus: DshSessionBindingLifecycleStatus,
    updatedAt: number
  ): Promise<DshSessionBinding> | DshSessionBinding
}

export type DshSessionLifecycleServiceDependencies = {
  runtime: Pick<
    DshAcpRuntimePort,
    'start' | 'cancel' | 'closeSession' | 'resumeSession' | 'prompt'
  >
  sessions: DshSessionLifecycleSessionStore
  projection: DshSessionLifecycleProjectionPort
  now?: () => number
}

export class DshSessionLifecycleService {
  private readonly now: () => number

  constructor(
    private readonly dependencies: DshSessionLifecycleServiceDependencies
  ) {
    this.now = dependencies.now ?? Date.now
  }

  async assertNewWorkAllowed(input: {
    owner: DshRunOwner
  }): Promise<{ status: 'allowed' }> {
    const binding = await this.dependencies.sessions.getByOwner(input.owner)
    if (binding?.lifecycleStatus === 'closing') {
      throw new Error('DSH session is closing')
    }
    return { status: 'allowed' }
  }

  async cancel(input: {
    owner: DshRunOwner
  }): Promise<{
    status: AgentRunLifecycleStatus
    dshSessionId: string
  }> {
    const binding = await this.requireBinding(input.owner)
    this.assertCancellable(binding)
    await this.dependencies.runtime.start()
    await this.dependencies.runtime.cancel({ sessionId: binding.dshSessionId })
    await this.dependencies.sessions.transition(
      binding.dshSessionId,
      'cancelled',
      this.now()
    )
    return {
      status: 'cancelled',
      dshSessionId: binding.dshSessionId
    }
  }

  async pause(input: {
    owner: DshRunOwner
    reason?: string
  }): Promise<{
    status: AgentRunLifecycleStatus
    dshSessionId: string
    projectedSequence: number
  }> {
    const binding = await this.requireBinding(input.owner)
    this.assertPausable(binding)
    await this.dependencies.sessions.transition(
      binding.dshSessionId,
      'closing',
      this.now()
    )
    await this.dependencies.runtime.start()
    await this.dependencies.runtime.closeSession({
      sessionId: binding.dshSessionId
    })
    const projected = await this.dependencies.projection.waitForDurableSessionEvent({
      sessionId: binding.dshSessionId,
      kind: 'session.closed',
      afterSequence: binding.lastProjectedSequence
    })
    await this.dependencies.sessions.transition(
      binding.dshSessionId,
      'paused',
      this.now()
    )
    return {
      status: 'paused',
      dshSessionId: binding.dshSessionId,
      projectedSequence: projected.sequence
    }
  }

  async resume(input: {
    owner: DshRunOwner
    cwd: string
    mcpServers?: DshAcpMcpServer[]
    continuationPrompt: DshAcpPromptBlock[]
  }): Promise<{
    status: AgentRunLifecycleStatus
    dshSessionId: string
    projectedSequence: number
  }> {
    const binding = await this.requireBinding(input.owner)
    this.assertResumable(binding)
    await this.dependencies.runtime.start()
    await this.dependencies.runtime.resumeSession({
      sessionId: binding.dshSessionId,
      cwd: input.cwd,
      ...(input.mcpServers ? { mcpServers: input.mcpServers } : {})
    })
    const projected = await this.dependencies.projection.waitForDurableSessionEvent({
      sessionId: binding.dshSessionId,
      kind: 'session.resumed',
      afterSequence: binding.lastProjectedSequence
    })
    await this.dependencies.sessions.transition(
      binding.dshSessionId,
      'active',
      this.now()
    )
    await this.dependencies.runtime.prompt({
      sessionId: binding.dshSessionId,
      prompt: input.continuationPrompt
    })
    return {
      status: 'running',
      dshSessionId: binding.dshSessionId,
      projectedSequence: projected.sequence
    }
  }

  private async requireBinding(owner: DshRunOwner): Promise<DshSessionBinding> {
    const binding = await this.dependencies.sessions.getByOwner(owner)
    if (binding === undefined) {
      throw new Error('DSH session binding is missing')
    }
    return binding
  }

  private assertCancellable(binding: DshSessionBinding): void {
    if (binding.lifecycleStatus === 'closing') {
      throw new Error('DSH session is closing')
    }
    if (isTerminalBinding(binding)) {
      throw new Error(
        `DSH session cannot be cancelled from ${binding.lifecycleStatus}`
      )
    }
  }

  private assertPausable(binding: DshSessionBinding): void {
    if (binding.lifecycleStatus === 'closing') {
      throw new Error('DSH session is already closing')
    }
    if (binding.lifecycleStatus !== 'active') {
      throw new Error(
        `DSH session cannot be paused from ${binding.lifecycleStatus}`
      )
    }
  }

  private assertResumable(binding: DshSessionBinding): void {
    if (binding.lifecycleStatus === 'closing') {
      throw new Error('DSH session is closing')
    }
    const productStatus = mapDshSessionLifecycleToAgentRunLifecycle(
      binding.lifecycleStatus
    )
    if (productStatus !== 'paused') {
      throw new Error(
        `DSH session cannot be resumed from ${binding.lifecycleStatus}`
      )
    }
  }
}

function isTerminalBinding(binding: DshSessionBinding): boolean {
  return (
    binding.lifecycleStatus === 'cancelled' ||
    binding.lifecycleStatus === 'failed' ||
    binding.lifecycleStatus === 'reset'
  )
}
