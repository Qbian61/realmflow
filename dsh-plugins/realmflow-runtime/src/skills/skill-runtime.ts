import { createHash } from 'node:crypto'
import type {
  DshRunManifest,
  ExecutableSkillManifest
} from '../../../../domain/dsh-run-manifest'
import {
  DshRuntimeAuthorityDeniedError,
  buildDshRuntimeAuthority,
  type DshRuntimeAuthority
} from '../runtime-authority'
import type { DshToolRuntime } from '../tools/tool-runtime'

export type DshSkillHandlerSource =
  | 'instruction'
  | 'workflow'
  | 'executable'

export type DshSkillHandler = {
  skillId: string
  source: DshSkillHandlerSource
  execute(input: unknown, context: DshSkillExecutionContext): Promise<unknown> | unknown
}

export type DshSkillExecutionContext = {
  manifest: DshRunManifest
  skill: ExecutableSkillManifest
  instructions: string
  signal: AbortSignal
  tools: {
    execute(toolId: string, input: unknown): Promise<unknown>
  }
}

export type DshSkillRuntimeOptions = {
  manifest: DshRunManifest
  authority?: DshRuntimeAuthority
  toolRuntime: DshToolRuntime
  handlers: DshSkillHandler[]
  instructionLoader?: {
    load(skill: ExecutableSkillManifest): Promise<string>
  }
  emitEvent?: (event: DshSkillRuntimeEvent) => void
  now?: () => number
}

export type DshSkillExecutionRequest = {
  skillId: string
  callId: string
  idempotencyKey: string
  input: unknown
  signal?: AbortSignal
}

export type DshSkillExecutionResult = {
  callId: string
  skillId: string
  output: unknown
  replayed: boolean
}

export type DshSkillRuntimeEvent =
  | DshSkillRuntimeBaseEvent & { kind: 'skill.started' }
  | DshSkillRuntimeBaseEvent & { kind: 'skill.succeeded'; outputDigest: string }
  | DshSkillRuntimeBaseEvent & { kind: 'skill.failed'; reason: string }
  | DshSkillRuntimeBaseEvent & { kind: 'skill.denied'; reason: string }
  | DshSkillRuntimeBaseEvent & { kind: 'skill.replayed'; originalCallId: string }

export type DshSkillRuntimeBaseEvent = {
  at: number
  manifestDigest: string
  runId: string
  sessionId: string
  skillId: string
  callId: string
}

type CompletedSkillCall = {
  inputDigest: string
  result: DshSkillExecutionResult
}

export class DshSkillRuntime {
  private readonly authority: DshRuntimeAuthority
  private readonly handlers: Map<string, DshSkillHandler>
  private readonly emitEvent: (event: DshSkillRuntimeEvent) => void
  private readonly now: () => number
  private readonly completed = new Map<string, CompletedSkillCall>()

  constructor(private readonly options: DshSkillRuntimeOptions) {
    this.authority =
      options.authority ?? buildDshRuntimeAuthority(options.manifest)
    this.handlers = new Map(options.handlers.map((handler) => [
      handler.skillId,
      handler
    ]))
    this.emitEvent = options.emitEvent ?? (() => {})
    this.now = options.now ?? Date.now
  }

  async execute(
    request: DshSkillExecutionRequest
  ): Promise<DshSkillExecutionResult> {
    const inputDigest = digestJson(request.input)
    const cached = this.completed.get(request.idempotencyKey)
    if (cached !== undefined) {
      if (cached.inputDigest !== inputDigest) {
        throw new Error('Skill idempotency key was reused with different input')
      }
      const replayed = {
        ...cached.result,
        callId: request.callId,
        replayed: true
      }
      this.emit('skill.replayed', request, {
        originalCallId: cached.result.callId
      })
      return replayed
    }

    try {
      request.signal?.throwIfAborted()
      const skill = this.authority.requireSkill({ id: request.skillId })
      this.assertRequiredTools(skill)
      const handler = this.requireHandler(skill.id, skill.entrypoint.kind)
      const instructions = await this.loadInstructions(skill)
      let nestedToolCalls = 0
      this.emit('skill.started', request)
      const output = await handler.execute(request.input, {
        manifest: this.options.manifest,
        skill,
        instructions,
        signal: request.signal ?? new AbortController().signal,
        tools: {
          execute: async (toolId, input) => {
            nestedToolCalls += 1
            if (nestedToolCalls > this.options.manifest.budget.maxToolCalls) {
              throw new DshSkillRuntimeDeniedError(
                'nested Tool budget exceeded'
              )
            }
            return (
              await this.options.toolRuntime.execute({
                toolId,
                callId: `${request.callId}:tool:${nestedToolCalls}`,
                idempotencyKey: `${request.idempotencyKey}:tool:${nestedToolCalls}`,
                input,
                signal: request.signal
              })
            ).output
          }
        }
      })
      const result: DshSkillExecutionResult = {
        callId: request.callId,
        skillId: request.skillId,
        output,
        replayed: false
      }
      this.completed.set(request.idempotencyKey, {
        inputDigest,
        result
      })
      this.emit('skill.succeeded', request, {
        outputDigest: digestJson(output)
      })
      return result
    } catch (error) {
      if (isDenied(error)) {
        this.emit('skill.denied', request, {
          reason: deniedReason(error)
        })
      } else {
        this.emit('skill.failed', request, {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
  }

  private assertRequiredTools(skill: ExecutableSkillManifest): void {
    for (const reference of skill.requiredToolRefs) {
      this.authority.requireTool({
        id: reference.id,
        version: reference.version,
        definitionDigest: reference.digest
      })
    }
  }

  private requireHandler(
    skillId: string,
    source: DshSkillHandlerSource
  ): DshSkillHandler {
    const handler = this.handlers.get(skillId)
    if (handler === undefined) {
      throw new DshSkillRuntimeDeniedError('skill handler is not registered')
    }
    if (handler.source !== source) {
      throw new DshSkillRuntimeDeniedError(
        'skill handler source does not match manifest entrypoint'
      )
    }
    return handler
  }

  private async loadInstructions(skill: ExecutableSkillManifest): Promise<string> {
    if (skill.entrypoint.kind !== 'instruction') return ''
    if (this.options.instructionLoader === undefined) {
      throw new DshSkillRuntimeDeniedError('skill instruction loader is required')
    }
    return this.options.instructionLoader.load(skill)
  }

  private emit(
    kind: DshSkillRuntimeEvent['kind'],
    request: DshSkillExecutionRequest,
    extra: Partial<DshSkillRuntimeEvent> = {}
  ): void {
    this.emitEvent({
      kind,
      at: this.now(),
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      skillId: request.skillId,
      callId: request.callId,
      ...extra
    } as DshSkillRuntimeEvent)
  }
}

export class DshSkillRuntimeDeniedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshSkillRuntimeDeniedError'
  }
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof DshRuntimeAuthorityDeniedError
    || error instanceof DshSkillRuntimeDeniedError
  )
}

function deniedReason(error: unknown): string {
  if (error instanceof DshRuntimeAuthorityDeniedError) {
    return error.event.reason
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Skill payload number is invalid')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`
}
