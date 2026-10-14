import Ajv2020 from 'ajv/dist/2020.js'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'

type SchemaMetadataOptions = {
  requireExamples?: boolean
  examples?: unknown
  requirePropertyExamples?: boolean
  requireFieldUsageGuidance?: boolean
  rejectTrustedContextFields?: boolean
}

const TRUSTED_CONTEXT_FIELDS = new Set([
  'workspaceId',
  'requirementId',
  'conversationId',
  'nodeRunId',
  'executionId',
  'toolCallId',
  'requestedBy',
  'scopeRoots',
])
const REQUIRED_USAGE_PATTERN = /\b(required|must|needs?)\b|必填|必须|需要/i
const OPTIONAL_USAGE_PATTERN = /\b(optional|omit|omitted|leave blank|if|when)\b|可选|省略|不填|无需|如需|若|当/i
const PROMPT_INSTRUCTION_PATTERN =
  /\b(?:ignore (?:all |the |previous |prior )?instructions?|system prompt|developer message|reveal (?:the )?(?:secret|token|credential)|do not tell the user)\b/i
const SECRET_LITERAL_PATTERN =
  /\b(?:authorization|bearer|api[_ -]?key|password|secret|token|credential)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/i
const ENVIRONMENT_ABSOLUTE_PATH_PATTERN =
  /(?:^|[\s"'`(])(?:\/Users\/[^\s"'`)]+|\/home\/[^\s"'`)]+|\/var\/folders\/[^\s"'`)]+|[A-Za-z]:\\[^\s"'`]+)/i

export function assertDescribedStrictObjectSchema(
  schema: JsonObject,
  label: string,
  options: SchemaMetadataOptions = {},
): void {
  const schemaObject = assertJsonObject(schema, `${label} schema`)
  if (schemaObject.type !== 'object') {
    throw new Error(`${label} schema.type is invalid`)
  }
  validateDescriptionSafety(
    requireDescription(schemaObject, `${label} schema`),
    `${label} schema.description`,
  )
  if (schemaObject.additionalProperties !== false) {
    throw new Error(`${label} schema.additionalProperties must be false`)
  }
  validateProperties(
    schemaObject,
    `${label} schema`,
    options,
    options.examples ?? schemaObject.examples,
  )
  validateRequired(schemaObject, `${label} schema`)
  const validate = compile(schema, label)
  if (options.requireExamples) {
    validateExamples(
      options.examples ?? schemaObject.examples,
      validate,
      `${label} schema`,
    )
  }
}

function validateProperties(
  schema: Record<string, unknown>,
  fieldPath: string,
  options: SchemaMetadataOptions,
  rootExamples: unknown,
  path: string[] = [],
): void {
  if (schema.properties === undefined) return
  const properties = assertJsonObject(
    schema.properties,
    `${fieldPath}.properties`,
  )
  const required = requiredNames(schema)
  for (const [name, value] of Object.entries(properties)) {
    const propertyPath = `${fieldPath}.properties.${name}`
    const property = assertJsonObject(value, propertyPath)
    if (options.rejectTrustedContextFields && TRUSTED_CONTEXT_FIELDS.has(name)) {
      throw new Error(`${propertyPath} must not expose trusted runtime context`)
    }
    const description = requireDescription(property, propertyPath)
    validateDescriptionSafety(description, `${propertyPath}.description`)
    if (options.requireFieldUsageGuidance) {
      validateFieldUsageGuidance(
        name,
        description,
        required.has(name),
        `${propertyPath}.description`,
      )
    }
    validateEnumDescriptions(property, description, `${propertyPath}.description`)
    if (options.requirePropertyExamples) {
      validatePropertyExamples(
        property,
        rootExamples,
        [...path, name],
        propertyPath,
      )
    }
    if (property.type === 'object') {
      validateProperties(
        property,
        propertyPath,
        options,
        rootExamples,
        [...path, name],
      )
      validateRequired(property, propertyPath)
    }
    if (isJsonObject(property.items)) {
      validateProperties(
        property.items,
        `${propertyPath}.items`,
        options,
        rootExamples,
        [...path, name, '*'],
      )
      validateRequired(property.items, `${propertyPath}.items`)
    }
    for (const key of ['oneOf', 'anyOf', 'allOf']) {
      const composition = property[key]
      if (!Array.isArray(composition)) continue
      composition.forEach((item, index) => {
        if (!isJsonObject(item)) return
        validateProperties(
          item,
          `${propertyPath}.${key}[${index}]`,
          options,
          rootExamples,
          [...path, name],
        )
        validateRequired(item, `${propertyPath}.${key}[${index}]`)
      })
    }
  }
}

function validateRequired(
  schema: Record<string, unknown>,
  fieldPath: string,
): void {
  if (schema.required === undefined) return
  if (
    !Array.isArray(schema.required) ||
    schema.required.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new Error(`${fieldPath}.required is invalid`)
  }
  const properties =
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
      ? schema.properties as Record<string, unknown>
      : {}
  for (const name of schema.required) {
    if (!(name in properties)) {
      throw new Error(`${fieldPath}.required.${name} is invalid`)
    }
  }
}

function validateExamples(
  examples: unknown,
  validate: (value: unknown) => boolean,
  fieldPath: string,
): void {
  if (!Array.isArray(examples) || examples.length === 0) {
    throw new Error(`${fieldPath}.examples are required`)
  }
  for (const [index, example] of examples.entries()) {
    if (!validate(example)) {
      throw new Error(`${fieldPath}.examples[${index}] is invalid`)
    }
    validateExampleSafety(example, `${fieldPath}.examples[${index}]`)
  }
}

function compile(
  schema: JsonObject,
  label: string,
): (value: unknown) => boolean {
  try {
    return new Ajv2020({
      strict: false,
      allErrors: true,
      validateFormats: false,
      loadSchema: undefined,
    }).compile(schema)
  } catch {
    throw new Error(`${label} schema is invalid`)
  }
}

function requireDescription(
  value: Record<string, unknown>,
  fieldPath: string,
): string {
  if (typeof value.description !== 'string' || !value.description.trim()) {
    throw new Error(`${fieldPath}.description is required`)
  }
  return value.description.trim()
}

function assertJsonObject(
  value: unknown,
  fieldPath: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldPath} is invalid`)
  }
  return value as Record<string, unknown>
}

function requiredNames(schema: Record<string, unknown>): Set<string> {
  return new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : [],
  )
}

function validateFieldUsageGuidance(
  name: string,
  description: string,
  required: boolean,
  fieldPath: string,
): void {
  if (required) {
    if (!REQUIRED_USAGE_PATTERN.test(description)) {
      throw new Error(
        `${fieldPath} must explain when the required field is required`,
      )
    }
  } else if (!OPTIONAL_USAGE_PATTERN.test(description)) {
    throw new Error(
      `${fieldPath} must explain when to provide or omit the optional field`,
    )
  }

  if (name === 'scopeRoot') {
    if (
      !/omit|省略/i.test(description) ||
      !description.includes('.') ||
      !/authorized root|current root|授权根|当前根/i.test(description)
    ) {
      throw new Error(
        `${fieldPath} must explain that omitting the field or "." uses the current authorized root`,
      )
    }
  }

  if (isIdentityOrRevisionField(name) && !describesTrustedSource(description)) {
    throw new Error(`${fieldPath} must explain the trusted source of the value`)
  }
}

function validateEnumDescriptions(
  schema: Record<string, unknown>,
  description: string,
  fieldPath: string,
): void {
  for (const value of enumValues(schema)) {
    if (!description.includes(value)) {
      throw new Error(`${fieldPath} must mention enum value "${value}"`)
    }
  }
}

function enumValues(schema: Record<string, unknown>): string[] {
  const direct = Array.isArray(schema.enum) ? schema.enum : []
  const composed = ['oneOf', 'anyOf', 'allOf'].flatMap((key) =>
    Array.isArray(schema[key])
      ? schema[key].flatMap((item) =>
          isJsonObject(item) ? enumValues(item) : [],
        )
      : [],
  )
  return [...direct, ...composed]
    .filter(
      (value): value is string | number | boolean =>
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean',
    )
    .map(String)
}

function validatePropertyExamples(
  schema: Record<string, unknown>,
  rootExamples: unknown,
  path: string[],
  fieldPath: string,
): void {
  const validate = compile(schema as JsonObject, fieldPath)
  const propertyExamples = Array.isArray(schema.examples)
    ? schema.examples
    : []
  if (
    propertyExamples.length > 0 &&
    propertyExamples.some((example) => validate(example))
  ) {
    propertyExamples.forEach((example, index) =>
      validateExampleSafety(example, `${fieldPath}.examples[${index}]`),
    )
    return
  }
  const examples = Array.isArray(rootExamples) ? rootExamples : []
  if (
    examples.some((example) => {
      return valuesAtPath(example, path).some(
        (value) => value !== undefined && validate(value),
      )
    })
  ) {
    return
  }
  throw new Error(`${fieldPath}.examples are required`)
}

function validateDescriptionSafety(
  description: string,
  fieldPath: string,
): void {
  if (PROMPT_INSTRUCTION_PATTERN.test(description)) {
    throw new Error(`${fieldPath} must not contain prompt instructions`)
  }
  if (SECRET_LITERAL_PATTERN.test(description)) {
    throw new Error(`${fieldPath} must not contain secrets`)
  }
  if (ENVIRONMENT_ABSOLUTE_PATH_PATTERN.test(description)) {
    throw new Error(
      `${fieldPath} must not contain environment-specific absolute paths`,
    )
  }
}

function validateExampleSafety(value: unknown, fieldPath: string): void {
  const serialized =
    typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  if (SECRET_LITERAL_PATTERN.test(serialized)) {
    throw new Error(`${fieldPath} must not contain secrets`)
  }
  if (ENVIRONMENT_ABSOLUTE_PATH_PATTERN.test(serialized)) {
    throw new Error(
      `${fieldPath} must not contain environment-specific absolute paths`,
    )
  }
}

function valuesAtPath(value: unknown, path: string[]): unknown[] {
  if (path.length === 0) return [value]
  const [head, ...tail] = path
  if (head === '*') {
    return Array.isArray(value)
      ? value.flatMap((item) => valuesAtPath(item, tail))
      : []
  }
  if (!isJsonObject(value) || !(head in value)) return []
  return valuesAtPath(value[head], tail)
}

function isIdentityOrRevisionField(name: string): boolean {
  return (
    name === 'id' ||
    name.endsWith('Id') ||
    name.endsWith('Ids') ||
    name === 'expectedRevision' ||
    name.endsWith('Revision')
  )
}

function describesTrustedSource(description: string): boolean {
  return /\b(?:returned|selected|existing|current|trusted|source|from)\b|返回|选择|已有|当前|可信|来源/i.test(
    description,
  )
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
