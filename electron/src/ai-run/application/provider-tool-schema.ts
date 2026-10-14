import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { compileProviderToolInputSchema } from '../../application/tools/model-tool-contract-compiler'

export function projectProviderToolSchema(
  schema: JsonObject
): JsonObject {
  return compileProviderToolInputSchema(schema)
}
