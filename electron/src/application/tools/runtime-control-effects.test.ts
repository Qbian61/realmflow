import { expect, it } from 'vitest'
import { projectModelFacingToolCatalog } from './tool-model-facing-projection'
import { runtimeControlEffects } from './runtime-control-effects'

it('does not route a same-name extension through the credential runtime', () => {
  const definition = projectModelFacingToolCatalog({ packages: [], tools: [], skills: [] }, 'facade').tools.find(item => item.id === 'secrets')!.definition
  expect(definition).toBeDefined()
  expect(runtimeControlEffects({ ...definition, executor: { kind: 'builtin', handler: 'extension.secrets', handlerVersion: '1.0.0' } }, {})).toBeUndefined()
})
