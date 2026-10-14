import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export type ModelFacingFacadeActionContract = {
  action: string
  inputSchema: JsonObject
}

export function compileProviderToolInputSchema(schema: JsonObject): JsonObject {
  return normalizeToolSchema(schema, { summarizeObjectAlternatives: true })
}

export function compileRuntimeToolInputSchema(schema: JsonObject): JsonObject {
  return normalizeToolSchema(schema)
}

export function compileModelFacingFacadeInputSchema(
  actions: ModelFacingFacadeActionContract[]
): JsonObject {
  const actionNames = actions.map(({ action }) => action)
  return {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'arguments'],
    properties: {
      action: {
        type: 'string',
        ...(actionNames.length > 0
          ? { enum: actionNames }
          : { minLength: 1 })
      },
      arguments: mergeObjectSchemasForProvider(actions.map(({ inputSchema }) => inputSchema))
    },
    ...(actions.length > 0
      ? {
          oneOf: actions.map(({ action, inputSchema }) => ({
            type: 'object',
            additionalProperties: false,
            required: ['action', 'arguments'],
            properties: {
              action: { const: action },
              arguments: compileRuntimeToolInputSchema(inputSchema)
            }
          }))
        }
      : {})
  }
}

function mergeObjectSchemasForProvider(schemas: JsonObject[]): JsonObject {
  if (schemas.length === 0) {
    return {
      type: 'object',
      additionalProperties: true
    }
  }

  const properties = mergeProperties(schemas)
  const required = intersectRequired(schemas)
  return {
    type: 'object',
    ...(schemas.every(({ additionalProperties }) => additionalProperties === false)
      ? { additionalProperties: false }
      : {}),
    ...(required.length > 0 ? { required } : {}),
    ...(Object.keys(properties).length > 0 ? { properties } : {})
  }
}

function mergeProperties(schemas: JsonObject[]): JsonObject {
  const names = new Set(
    schemas.flatMap(({ properties }) =>
      isJsonObject(properties) ? Object.keys(properties) : []
    )
  )
  const merged: JsonObject = {}
  for (const name of [...names].sort()) {
    const candidates = schemas.flatMap(({ properties }) => {
      const property = isJsonObject(properties) ? properties[name] : undefined
      return isJsonObject(property) ? [normalizeToolSchema(property)] : []
    })
    if (candidates.length > 0) {
      merged[name] = mergePropertySchemas(candidates)
    }
  }
  return merged
}

function mergePropertySchemas(candidates: JsonObject[]): JsonObject {
  const serialized = candidates.map(stableJson)
  if (serialized.every((value) => value === serialized[0])) {
    return cloneJson(candidates[0])
  }

  const enums = candidates.map(({ enum: value }) =>
    Array.isArray(value) ? value : undefined
  )
  if (enums.every((value) => value !== undefined)) {
    return {
      enum: uniqueValues(enums.flatMap((value) => value ?? []))
    }
  }

  if (candidates.every(({ type }) => type === 'object')) {
    return mergeObjectSchemasForProvider(candidates)
  }

  const types = candidates
    .map(({ type }) => type)
    .filter((type): type is string => typeof type === 'string')
  if (types.length === candidates.length && types.every((type) => type === types[0])) {
    return { type: types[0] }
  }

  return {}
}

function intersectRequired(schemas: JsonObject[]): string[] {
  const lists = schemas.map(({ required }) =>
    Array.isArray(required)
      ? required.filter((item): item is string => typeof item === 'string')
      : []
  )
  return (lists[0] ?? [])
    .filter((name) => lists.every((items) => items.includes(name)))
    .sort()
}

function normalizeToolSchema(
  schema: JsonObject,
  options: { summarizeObjectAlternatives?: boolean } = {}
): JsonObject {
  const normalized: JsonObject = {}
  const unionTypes = Array.isArray(schema.type)
    ? schema.type.filter((item): item is string => typeof item === 'string')
    : []
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && Array.isArray(value)) continue
    if (key === 'const') {
      normalized.enum = [cloneJson(value)]
      continue
    }
    normalized[key] = normalizeValue(value)
  }
  if (unionTypes.length > 0) {
    normalized.anyOf = [
      ...(Array.isArray(normalized.anyOf)
        ? normalized.anyOf.filter(isJsonObject)
        : []),
      ...unionTypes.map((type) => ({ type }))
    ]
  }
  const summary = options.summarizeObjectAlternatives
    ? objectAlternativeSummary(normalized)
    : undefined
  const enriched =
    summary && !isEmptyObject(summary)
      ? {
          ...summary,
          ...normalized,
          ...(isJsonObject(summary.properties) || isJsonObject(normalized.properties)
            ? {
                properties: {
                  ...(isJsonObject(summary.properties) ? summary.properties : {}),
                  ...(isJsonObject(normalized.properties) ? normalized.properties : {})
                }
              }
            : {})
        }
      : normalized
  return withStrictRequiredProperties(enriched)
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue)
  return isJsonObject(value) ? normalizeToolSchema(value) : value
}

function withStrictRequiredProperties(schema: JsonObject): JsonObject {
  if (!Array.isArray(schema.required)) return schema
  const required = schema.required.filter(
    (item): item is string => typeof item === 'string'
  )
  if (required.length === 0) return schema
  const properties = isJsonObject(schema.properties)
    ? { ...schema.properties }
    : {}
  let changed = !isJsonObject(schema.properties)
  for (const name of required) {
    if (!Object.hasOwn(properties, name)) {
      properties[name] = {}
      changed = true
    }
  }
  return changed ? { ...schema, properties } : schema
}

function objectAlternativeSummary(schema: JsonObject): JsonObject | undefined {
  const alternatives = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : undefined
  if (!alternatives) return undefined
  const objectAlternatives = alternatives.filter(isJsonObject)
  if (
    objectAlternatives.length !== alternatives.length ||
    !objectAlternatives.every(({ type }) => type === 'object')
  ) {
    return undefined
  }
  return mergeObjectSchemasForProvider(objectAlternatives)
}

function isEmptyObject(value: JsonObject): boolean {
  return Object.keys(value).length === 0
}

function uniqueValues(values: unknown[]): unknown[] {
  const unique = new Map(values.map((value) => [stableJson(value), value]))
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => cloneJson(value))
}

function cloneJson<T>(value: T): T {
  return structuredClone(value)
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
