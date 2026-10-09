import { randomUUID } from 'node:crypto'
import Ajv2020 from 'ajv/dist/2020.js'
import type {
  SkillDefinition,
  SkillExecutableCapability,
} from '../../../../domain/skill-definition'
import type {
  SkillExecutionErrorCode,
  SkillExecutionMetrics,
} from '../../../../domain/skill-execution'
import type { ToolExecutionCommand } from './tool-execution-application-service'

export type SkillPermissionDecisionInput = {
  capability: SkillExecutableCapability | 'connector.use'
  service?: string
  allowed: boolean
}

export type SkillRuntimeCommand = {
  definition: SkillDefinition
  parentRunId: string
  callId: string
  context: ToolExecutionCommand['context']
  input: Record<string, unknown>
  connectorBindings?: unknown[]
  permissionDecisions?: SkillPermissionDecisionInput[]
}

export type SkillRuntimeExecution = {
  id: string
  skillId: string
  skillVersion: string
  skillDigest: string
  status: 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  output?: Record<string, unknown>
  metrics?: SkillExecutionMetrics
  error?: { code: SkillExecutionErrorCode; message: string }
}

export type SkillRuntimeResult =
  | {
      outcome: 'permission_required'
      permissionRequests: Array<{
        capability: SkillExecutableCapability | 'connector.use'
        risk: 'high'
        service?: string
      }>
    }
  | {
      outcome: 'permission_denied'
      permissionRequests: Array<{
        capability: SkillExecutableCapability | 'connector.use'
        risk: 'high'
        service?: string
      }>
    }
  | { outcome: 'executed'; execution: SkillRuntimeExecution }

type ExecutableResult = {
  output: Record<string, unknown>
  metrics: SkillExecutionMetrics
}

type Dependencies = {
  instructions: {
    readInstructions(definition: SkillDefinition): Promise<string>
  }
  executable: {
    execute(
      command: SkillRuntimeCommand & { executionId: string },
      signal: AbortSignal,
    ): Promise<ExecutableResult>
    cancel(executionId: string): Promise<boolean>
  }
  createId?: () => string
}

export class SkillRuntimeApplicationService {
  private readonly createId: () => string
  private readonly active = new Map<
    string,
    { executionId: string; controller: AbortController }
  >()

  constructor(private readonly dependencies: Dependencies) {
    this.createId = dependencies.createId ?? randomUUID
  }

  async execute(command: SkillRuntimeCommand): Promise<SkillRuntimeResult> {
    const executionId = this.createId()
    if (!matchesSchema(command.definition.inputSchema, command.input)) {
      return this.failure(
        command.definition,
        executionId,
        'skill_input_invalid',
        'Skill input does not match the input schema',
      )
    }
    const permission = evaluatePermission(command)
    if (permission) return permission

    try {
      if (command.definition.runtime.kind === 'instruction') {
        const instructions =
          await this.dependencies.instructions.readInstructions(
            command.definition,
          )
        return this.success(command.definition, executionId, {
          kind: 'instruction',
          skillId: command.definition.id,
          skillName: command.definition.name,
          instructions,
          input: structuredClone(command.input),
        })
      }
      if (command.definition.runtime.kind === 'workflow') {
        return this.success(command.definition, executionId, {
          kind: 'workflow',
          skillId: command.definition.id,
          skillName: command.definition.name,
          steps: structuredClone(command.definition.runtime.steps),
        })
      }
      return await this.executeExecutable(command, executionId)
    } catch (error) {
      return this.failure(
        command.definition,
        executionId,
        skillErrorCode(error),
        skillErrorMessage(error),
      )
    }
  }

  async cancelByParent(parentRunId: string): Promise<number> {
    const active = this.active.get(parentRunId)
    if (!active) return 0
    try {
      return (await this.dependencies.executable.cancel(active.executionId))
        ? 1
        : 0
    } finally {
      active.controller.abort()
    }
  }

  private async executeExecutable(
    command: SkillRuntimeCommand,
    executionId: string,
  ): Promise<SkillRuntimeResult> {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      command.definition.limits.timeoutMs,
    )
    this.active.set(command.parentRunId, { executionId, controller })
    try {
      const result = await this.dependencies.executable.execute(
        { ...command, executionId },
        controller.signal,
      )
      if (!matchesSchema(command.definition.outputSchema, result.output)) {
        return this.failure(
          command.definition,
          executionId,
          'skill_output_invalid',
          'Skill output does not match the output schema',
          result.metrics,
        )
      }
      return this.success(
        command.definition,
        executionId,
        result.output,
        result.metrics,
      )
    } catch (error) {
      if (controller.signal.aborted) {
        return this.failure(
          command.definition,
          executionId,
          'skill_timeout',
          'Skill execution timed out',
        )
      }
      throw error
    } finally {
      clearTimeout(timeout)
      this.active.delete(command.parentRunId)
    }
  }

  private success(
    definition: SkillDefinition,
    executionId: string,
    output: Record<string, unknown>,
    metrics?: SkillExecutionMetrics,
  ): SkillRuntimeResult {
    if (!matchesSchema(definition.outputSchema, output)) {
      return this.failure(
        definition,
        executionId,
        'skill_output_invalid',
        'Skill output does not match the output schema',
        metrics,
      )
    }
    return {
      outcome: 'executed',
      execution: {
        ...executionIdentity(definition, executionId),
        status: 'succeeded',
        output,
        ...(metrics ? { metrics } : {}),
      },
    }
  }

  private failure(
    definition: SkillDefinition,
    executionId: string,
    code: SkillExecutionErrorCode,
    message: string,
    metrics?: SkillExecutionMetrics,
  ): SkillRuntimeResult {
    return {
      outcome: 'executed',
      execution: {
        ...executionIdentity(definition, executionId),
        status: 'failed',
        error: { code, message },
        ...(metrics ? { metrics } : {}),
      },
    }
  }
}

function evaluatePermission(
  command: SkillRuntimeCommand,
): Exclude<SkillRuntimeResult, { outcome: 'executed' }> | undefined {
  if (command.definition.runtime.kind !== 'executable') return undefined
  const permissionRequests = [
    ...command.definition.runtime.capabilities.map((capability) => ({
      capability,
      risk: 'high' as const,
    })),
    ...command.definition.runtime.connectorServices.map((service) => ({
      capability: 'connector.use' as const,
      risk: 'high' as const,
      service,
    })),
  ]
  if (permissionRequests.length === 0) return undefined
  if (!command.permissionDecisions) {
    return { outcome: 'permission_required', permissionRequests }
  }
  const denied = permissionRequests.some(
    (request) =>
      !command.permissionDecisions?.some(
        (decision) =>
          decision.capability === request.capability &&
          decision.service ===
            ('service' in request ? request.service : undefined) &&
          decision.allowed,
      ),
  )
  return denied
    ? { outcome: 'permission_denied', permissionRequests }
    : undefined
}

function executionIdentity(definition: SkillDefinition, executionId: string) {
  return {
    id: executionId,
    skillId: definition.id,
    skillVersion: definition.version,
    skillDigest: definition.definitionDigest,
  }
}

function matchesSchema(
  schema: Record<string, unknown>,
  value: Record<string, unknown>,
): boolean {
  return Boolean(
    new Ajv2020({ strict: true, allErrors: true }).compile(schema)(value),
  )
}

function skillErrorCode(error: unknown): SkillExecutionErrorCode {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('skill_')
  ) {
    return error.code as SkillExecutionErrorCode
  }
  return 'skill_execution_failed'
}

function skillErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    !/[\\/](?:Users|home|private|var|tmp)[\\/]/.test(error.message)
  ) {
    return error.message
  }
  return 'Skill execution failed'
}
