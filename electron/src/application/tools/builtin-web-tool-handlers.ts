import { createHash } from 'node:crypto'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION } from '../../../../shared/web-provider'
import type { BrowserRuntimeService } from '../browser/browser-runtime-service'
import { WebProviderRuntime } from '../web/web-provider-runtime'
import { WebAccessCoordinator } from '../web/web-access-coordinator'
import type { BuiltinToolHandler } from './builtin-tool-adapter'

export function createWebToolHandlers(
  runtime = new WebProviderRuntime(),
  browser?: Pick<
    BrowserRuntimeService,
    'ensureCurrentSession' | 'executeCurrent'
  >
): BuiltinToolHandler[] {
  const coordinator = new WebAccessCoordinator({
    provider: runtime,
    ...(browser ? { browser } : {})
  })
  return [
    {
      name: 'web.fetch',
      version: '1.0.0',
      execute: (input) => coordinator.fetch(
        input.arguments,
        input.webConfiguration ?? DEFAULT_WEB_PROVIDER_CONFIGURATION,
        input.signal,
        browserContext(input)
      )
    },
    {
      name: 'web.search',
      version: '1.0.0',
      execute: (input) => coordinator.search(
        input.arguments,
        input.webConfiguration ?? DEFAULT_WEB_PROVIDER_CONFIGURATION,
        input.signal,
        browserContext(input)
      )
    }
  ]
}

function browserContext(
  input: Parameters<BuiltinToolHandler['execute']>[0]
) {
  const ownerKey = JSON.stringify([
    input.context.owner.type,
    input.context.owner.id,
    input.context.workspaceId ?? null
  ])
  const runId = input.context.parentExecutionId
  return {
    ownerKey,
    executionId: input.executionId ?? 'web-access',
    ...(runId
      ? {
          runId,
          authorityDigest: createHash('sha256')
            .update(JSON.stringify({ ownerKey, runId }))
            .digest('hex')
        }
      : {}),
    ...(input.context.conversationId
      ? { conversationId: input.context.conversationId }
      : {}),
    scopeRoots: [...input.scopeRoots],
    signal: input.signal
  }
}
