import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'

describe('builtin tool contract metadata', () => {
  it('describes every model-visible top-level input property', async () => {
    const definitions = await builtinToolDefinitions()

    const missing = definitions.flatMap((definition) =>
      topLevelInputProperties(definition)
        .filter(({ schema }) => !descriptionOf(schema))
        .map(({ name }) => `${definition.id}.${name}`)
    )

    expect(missing).toEqual([])
  })

  it('documents enum values and contextual scope fields', async () => {
    const definitions = await builtinToolDefinitions()
    const issues: string[] = []

    for (const definition of definitions) {
      for (const { name, schema } of topLevelInputProperties(definition)) {
        const description = descriptionOf(schema)
        if (!description) continue
        const enumValues = Array.isArray(schema.enum)
          ? schema.enum.filter((value): value is string => typeof value === 'string')
          : []
        for (const value of enumValues) {
          if (!description.includes(value)) {
            issues.push(`${definition.id}.${name} does not mention enum value ${value}`)
          }
        }
        if (name === 'scopeRoot' && !/authorized root|current root|\./i.test(description)) {
          issues.push(`${definition.id}.${name} does not explain current authorized root usage`)
        }
        if (
          name === 'sourceKinds' &&
          (!description.includes('repository') || !/code/i.test(description))
        ) {
          issues.push(`${definition.id}.${name} does not explain repository/code terminology`)
        }
      }
    }

    expect(issues).toEqual([])
  })
})

async function builtinToolDefinitions(): Promise<ToolDefinition[]> {
  const packages = await new BuiltinCatalogLoader(
    join(process.cwd(), 'resources', 'extensions', 'builtin')
  ).load()
  return packages.flatMap(({ tools }) => tools)
}

function topLevelInputProperties(
  definition: ToolDefinition
): Array<{ name: string; schema: JsonObject }> {
  const properties = definition.inputSchema.properties
  if (!isJsonObject(properties)) return []
  return Object.entries(properties).flatMap(([name, schema]) =>
    isJsonObject(schema) ? [{ name, schema }] : []
  )
}

function descriptionOf(schema: JsonObject): string {
  return typeof schema.description === 'string'
    ? schema.description.trim()
    : ''
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
