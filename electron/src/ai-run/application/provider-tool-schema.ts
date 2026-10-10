import type { JsonObject } from '../../../../domain/tool-protocol-validation'

const UNSUPPORTED_COMPOSITION_KEYS = new Set([
  'allOf',
  'anyOf',
  'oneOf',
  'if',
  'then',
  'else',
  'not'
])

export function projectProviderToolSchema(
  schema: JsonObject
): JsonObject {
  return sanitizeObject(schema)
}

function sanitizeObject(value: JsonObject): JsonObject {
  const alternatives = Array.isArray(value.oneOf)
    ? value.oneOf
    : Array.isArray(value.anyOf)
      ? value.anyOf
      : undefined
  const sanitized: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (UNSUPPORTED_COMPOSITION_KEYS.has(key)) continue
    if (key === 'const') {
      sanitized.enum = [structuredClone(child)]
      continue
    }
    sanitized[key] = sanitizeValue(child)
  }
  if (!alternatives) return sanitized
  return {
    ...mergeAlternatives(
      alternatives
        .filter(isJsonObject)
        .map(sanitizeObject)
    ),
    ...sanitized
  }
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue)
  return isJsonObject(value) ? sanitizeObject(value) : value
}

function mergeAlternatives(alternatives: JsonObject[]): JsonObject {
  if (
    alternatives.length === 0 ||
    !alternatives.every(({ type }) => type === 'object')
  ) {
    return {}
  }
  const propertyNames = new Set(
    alternatives.flatMap(({ properties }) =>
      isJsonObject(properties) ? Object.keys(properties) : []
    )
  )
  const properties: JsonObject = {}
  for (const name of [...propertyNames].sort()) {
    const candidates = alternatives.flatMap(({ properties: value }) => {
      const child = isJsonObject(value) ? value[name] : undefined
      return isJsonObject(child) ? [child] : []
    })
    if (candidates.length > 0) {
      properties[name] = mergePropertySchemas(candidates)
    }
  }
  const requiredLists = alternatives.map(({ required }) =>
    Array.isArray(required)
      ? required.filter((item): item is string => typeof item === 'string')
      : []
  )
  const required = requiredLists[0]?.filter((name) =>
    requiredLists.every((items) => items.includes(name))
  ) ?? []
  return {
    type: 'object',
    ...(alternatives.every(
      ({ additionalProperties }) => additionalProperties === false
    )
      ? { additionalProperties: false }
      : {}),
    ...(required.length > 0 ? { required } : {}),
    ...(Object.keys(properties).length > 0 ? { properties } : {})
  }
}

function mergePropertySchemas(candidates: JsonObject[]): JsonObject {
  const serialized = candidates.map(stableJson)
  if (serialized.every((value) => value === serialized[0])) {
    return structuredClone(candidates[0])
  }
  const enums = candidates.map(({ enum: value }) =>
    Array.isArray(value) ? value : undefined
  )
  if (enums.every((value) => value !== undefined)) {
    return {
      enum: uniqueValues(enums.flatMap((value) => value ?? []))
    }
  }
  return {}
}

function uniqueValues(values: unknown[]): unknown[] {
  const unique = new Map(values.map((value) => [stableJson(value), value]))
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => structuredClone(value))
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
