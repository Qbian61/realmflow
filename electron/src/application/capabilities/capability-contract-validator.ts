import Ajv2020 from 'ajv/dist/2020.js'
import type {
  CapabilityDefinition,
  CapabilityRuntime
} from '../../../../domain/capability'
import type { CapabilityContractValidationReport } from '../../../../domain/capability-builder'
import {
  cliArgumentFlag,
  mapCliConnectorArgument,
  normalizeConnectorAction,
  type ConnectorAction
} from '../../../../domain/connector-runtime'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { assertDescribedStrictObjectSchema } from '../tools/tool-contract-schema-metadata'

export type { CapabilityContractValidationReport }

export class CapabilityContractValidator {
  assert(definition: CapabilityDefinition): CapabilityContractValidationReport {
    const runtime = definition.runtime
    if (runtime.kind === 'connector') {
      this.assertConnector(definition, runtime)
    }
    return { status: 'passed', diagnostics: [] }
  }

  private assertConnector(
    definition: CapabilityDefinition,
    runtime: Extract<CapabilityRuntime, { kind: 'connector' }>
  ): void {
    if (runtime.actions.length === 0) {
      throw new Error('Connector capability package requires at least one action')
    }
    assertStrictDescribedObjectSchema(
      runtime.configurationSchema,
      `${definition.id}.configurationSchema`,
      { requireExamples: true }
    )
    for (const action of runtime.actions) {
      if (action.protocol.kind !== runtime.connectorKind) {
        throw new Error(
          `${definition.id}.actions.${action.id}.protocol.kind does not match connectorKind`
        )
      }
      const normalizedAction = normalizeConnectorAction(action)
      assertDescribedStrictObjectSchema(
        action.inputSchema,
        `${definition.id}.actions.${action.id}.inputSchema`,
        {
          requireExamples: true,
          requirePropertyExamples: true,
          requireFieldUsageGuidance: true,
          rejectTrustedContextFields: true
        }
      )
      assertCliArgumentDocumentation(
        normalizedAction,
        `${definition.id}.actions.${action.id}.inputSchema`
      )
      assertDescribedCompilableObjectSchema(
        action.outputSchema,
        `${definition.id}.actions.${action.id}.outputSchema`
      )
    }
  }
}

function assertStrictDescribedObjectSchema(
  schema: JsonObject,
  path: string,
  options: { requireExamples?: boolean } = {}
): void {
  const object = assertJsonObject(schema, path)
  if (object.type !== 'object') {
    throw new Error(`${path}.type must be object`)
  }
  requireDescription(object, path)
  if (object.additionalProperties !== false) {
    throw new Error(`${path}.additionalProperties must be false`)
  }
  validateRequired(object, path)
  validateProperties(object, path)
  const validate = compile(schema, path)
  if (options.requireExamples) validateExamples(object, validate, path)
}

function assertDescribedCompilableObjectSchema(
  schema: JsonObject,
  path: string
): void {
  const object = assertJsonObject(schema, path)
  if (object.type !== 'object') {
    throw new Error(`${path}.type must be object`)
  }
  requireDescription(object, path)
  compile(schema, path)
}

function validateProperties(
  schema: Record<string, unknown>,
  path: string
): void {
  if (schema.properties === undefined) return
  const properties = assertJsonObject(schema.properties, `${path}.properties`)
  for (const [name, value] of Object.entries(properties)) {
    const property = assertJsonObject(
      value,
      `${path}.properties.${name}`
    )
    requireDescription(property, `${path}.properties.${name}`)
    if (property.type === 'object') {
      validateRequired(property, `${path}.properties.${name}`)
      validateProperties(property, `${path}.properties.${name}`)
    }
  }
}

function validateRequired(
  schema: Record<string, unknown>,
  path: string
): void {
  if (schema.required === undefined) return
  if (
    !Array.isArray(schema.required) ||
    schema.required.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new Error(`${path}.required is invalid`)
  }
  const properties =
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {}
  for (const name of schema.required) {
    if (!(name in properties)) {
      throw new Error(`${path}.required.${name} is invalid`)
    }
  }
}

function validateExamples(
  schema: Record<string, unknown>,
  validate: (value: unknown) => boolean,
  path: string
): void {
  if (!Array.isArray(schema.examples) || schema.examples.length === 0) {
    throw new Error(`${path}.examples are required`)
  }
  for (const [index, example] of schema.examples.entries()) {
    if (!validate(example)) {
      throw new Error(`${path}.examples[${index}] is invalid`)
    }
  }
}

function assertCliArgumentDocumentation(
  action: ConnectorAction,
  path: string
): void {
  if (action.protocol.kind !== 'cli') return
  const schema = assertJsonObject(action.inputSchema, path)
  const properties = assertJsonObject(schema.properties, `${path}.properties`)
  for (const name of action.protocol.argumentNames) {
    const property = assertJsonObject(
      properties[name],
      `${path}.properties.${name}`
    )
    const flag = cliArgumentFlag(name)
    if (
      typeof property.description !== 'string' ||
      !property.description.includes(flag)
    ) {
      throw new Error(
        'Connector CLI argument description must document flag mapping'
      )
    }
    if (!cliExamplesCoverArgument(schema.examples, name)) {
      throw new Error(
        'Connector CLI argument examples must cover every declared argument'
      )
    }
  }
}

function cliExamplesCoverArgument(
  examples: unknown,
  name: string
): boolean {
  return (
    Array.isArray(examples) &&
    examples.some((example) => {
      if (!example || typeof example !== 'object' || Array.isArray(example)) {
        return false
      }
      if (!Object.prototype.hasOwnProperty.call(example, name)) return false
      try {
        return (
          mapCliConnectorArgument(
            name,
            (example as Record<string, unknown>)[name]
          ).length > 0
        )
      } catch {
        return false
      }
    })
  )
}

function compile(
  schema: JsonObject,
  path: string
): (value: unknown) => boolean {
  try {
    return new Ajv2020({
      strict: false,
      allErrors: true,
      validateFormats: false
    }).compile(schema)
  } catch {
    throw new Error(`${path} is invalid`)
  }
}

function requireDescription(
  value: Record<string, unknown>,
  path: string
): void {
  if (typeof value.description !== 'string' || !value.description.trim()) {
    throw new Error(`${path}.description is required`)
  }
}

function assertJsonObject(
  value: unknown,
  path: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}
