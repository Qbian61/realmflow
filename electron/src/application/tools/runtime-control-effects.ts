import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { ToolEffect } from '../../../../domain/tool-authorization'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'

/** Only exact Main catalog definitions can reach this classifier. */
export function runtimeControlEffects(definition: ToolDefinition, input: JsonObject): ToolEffect[] | undefined {
  if (definition.executor.kind !== 'builtin') return undefined
  if (definition.executor.handler === 'media-provider-runtime') {
    return [{ kind: 'external.publish', resourceKey: `media:${definition.id}:${definition.definitionDigest}` }]
  }
  if (definition.executor.handler !== `runtime.${definition.id}`) return undefined
  if (definition.id === 'secrets') {
    return [{ kind: 'external', capability: 'credential.use', resourceKey: `credential:${String(input.service ?? 'model')}:${String(input.name)}` }]
  }
  if (definition.id === 'capabilities' && !['search', 'inspect'].includes(String(input.action))
    || definition.id === 'automation' && String(input.action).endsWith('_proposal')
    || definition.id === 'gateway' && ['config_patch_proposal', 'restart_proposal'].includes(String(input.action))) {
    return [{ kind: 'external', capability: 'connector.use', resourceKey: `runtime:${definition.id}:${String(input.action)}` }]
  }
  return undefined
}
