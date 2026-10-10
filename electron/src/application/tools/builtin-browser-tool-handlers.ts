import type { BrowserRuntimeService } from '../browser/browser-runtime-service'
import { browserError } from '../browser/browser-runtime-service'
import type { BrowserAction, BrowserCallContext, BrowserSession } from '../browser/browser-runtime-port'
import type { BuiltinToolHandler, BuiltinToolHandlerInput } from './builtin-tool-adapter'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'

const ACTIONS: BrowserAction[] = [
  'navigate', 'snapshot', 'click', 'fill', 'select', 'press', 'evaluate',
  'wait_for', 'screenshot', 'upload', 'download'
]
const SAFE_ERRORS: Record<string, string> = {
  browser_owner: 'Browser session or profile belongs to another context',
  browser_profile_active: 'Browser profile is already active',
  browser_session_inactive: 'Browser session is inactive; attach its profile to resume',
  browser_context_invalid: 'Browser execution context is unavailable',
  browser_unavailable: 'Browser runtime is unavailable',
  browser_arguments_invalid: 'Browser arguments are invalid'
}

export function createBrowserToolHandlers(
  service?: Pick<BrowserRuntimeService, 'createSession' | 'attachSession' | 'closeSession' | 'execute'>
): BuiltinToolHandler[] {
  return ['create', 'attach', 'close', ...ACTIONS].map((action) => ({
    name: `browser.${action}`, version: '1.0.0',
    execute: async (input) => {
      try {
        if (!service) throw browserError('unavailable', SAFE_ERRORS.browser_unavailable)
        const call = context(input)
        if (action === 'create') return publicSession(await service.createSession(call))
        if (action === 'attach') return publicSession(await service.attachSession(identifier(input.arguments, 'profileId'), call))
        const sessionId = identifier(input.arguments, 'sessionId')
        if (action === 'close') {
          await service.closeSession(sessionId, call)
          return { sessionId, status: 'closed' }
        }
        return await service.execute(sessionId, action as BrowserAction, input.arguments, call)
      } catch (error) {
        if (input.signal.aborted) throw input.signal.reason
        const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined
        if (code && Object.hasOwn(SAFE_ERRORS, code)) {
          throw Object.assign(new Error(SAFE_ERRORS[code]), { code })
        }
        throw browserError('operation_failed', 'Browser operation failed; inspect the visible browser and create or attach a session to continue')
      }
    }
  }))
}

function context(input: BuiltinToolHandlerInput): BrowserCallContext {
  if (!input.executionId || !input.context.owner.id) throw browserError('context_invalid', SAFE_ERRORS.browser_context_invalid)
  return {
    ownerKey: JSON.stringify([input.context.owner.type, input.context.owner.id, input.context.workspaceId ?? null]),
    executionId: input.executionId,
    ...(input.context.parentExecutionId
      ? { runId: input.context.parentExecutionId }
      : {}),
    scopeRoots: [...input.scopeRoots],
    signal: input.signal
  }
}

function identifier(args: JsonObject, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length > 120 || !/^browser-[A-Za-z0-9-]+$/.test(value)) {
    throw browserError('arguments_invalid', SAFE_ERRORS.browser_arguments_invalid)
  }
  return value
}

function publicSession(session: BrowserSession): JsonObject {
  return { sessionId: session.id, profileId: session.profileId, status: session.status, revision: session.revision }
}
