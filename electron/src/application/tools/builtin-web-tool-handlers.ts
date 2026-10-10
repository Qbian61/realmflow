import { DEFAULT_WEB_PROVIDER_CONFIGURATION } from '../../../../shared/web-provider'
import { WebProviderRuntime } from '../web/web-provider-runtime'
import type { BuiltinToolHandler } from './builtin-tool-adapter'

export function createWebToolHandlers(runtime = new WebProviderRuntime()): BuiltinToolHandler[] {
  return [
    {
      name: 'web.fetch',
      version: '1.0.0',
      execute: (input) => runtime.fetch(
        input.arguments, input.webConfiguration ?? DEFAULT_WEB_PROVIDER_CONFIGURATION, input.signal
      )
    },
    {
      name: 'web.search',
      version: '1.0.0',
      execute: (input) => runtime.search(
        input.arguments, input.webConfiguration ?? DEFAULT_WEB_PROVIDER_CONFIGURATION, input.signal
      )
    }
  ]
}
