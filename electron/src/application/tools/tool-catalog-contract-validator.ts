import type {
  ExtensionPackageCatalogItem,
  SkillCatalogItem,
  ToolCatalogItem,
  ToolCatalogState,
} from '../../../../domain/tool-catalog'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { normalizeSkillDefinition } from '../../../../domain/skill-definition'
import { normalizeToolDefinition } from '../../../../domain/tool-definition'
import Ajv2020 from 'ajv/dist/2020.js'
import { assertDescribedStrictObjectSchema } from './tool-contract-schema-metadata'

const CONTRACT_ISSUE = 'contract_invalid'

type CatalogTargetType = 'package' | 'tool' | 'skill'

export function assertToolCatalogTargetContract(
  catalog: ToolCatalogState,
  targetType: CatalogTargetType,
  targetId: string,
): void {
  if (targetType === 'package') {
    const packages = catalog.packages.filter(
      (item) => item.packageId === targetId,
    )
    if (packages.length === 0) {
      throw new Error('Tool Catalog target not found')
    }
    for (const item of packages) {
      assertPackageContract(catalog, item)
    }
    return
  }

  const items =
    targetType === 'tool'
      ? catalog.tools.filter(({ id }) => id === targetId)
      : catalog.skills.filter(({ id }) => id === targetId)
  if (items.length === 0) {
    throw new Error('Tool Catalog target not found')
  }
  for (const item of items) {
    assertCatalogItemContract(item)
  }
}

export function assertToolCatalogPackageVersionContract(
  catalog: ToolCatalogState,
  packageId: string,
  version: string,
  digest: string,
): void {
  const item = catalog.packages.find(
    (candidate) =>
      candidate.packageId === packageId &&
      candidate.version === version &&
      candidate.packageDigest === digest,
  )
  if (!item) {
    throw new Error('Tool Catalog package version is unavailable')
  }
  assertPackageContract(catalog, item)
}

export function filterContractValidCatalog(
  catalog: ToolCatalogState,
): ToolCatalogState {
  const invalidPackageKeys = new Set<string>()
  const tools = catalog.tools.filter((item) => {
    if (isCatalogItemContractValid(item)) return true
    invalidPackageKeys.add(packageKey(item.definition.package))
    return false
  })
  const skills = catalog.skills.filter((item) => {
    if (isCatalogItemContractValid(item)) return true
    invalidPackageKeys.add(packageKey(item.definition.package))
    return false
  })
  const packages = catalog.packages.map((item) =>
    invalidPackageKeys.has(packageKey(item))
      ? {
          ...item,
          status: 'corrupted' as const,
          dependencyIssues: [...item.dependencyIssues, CONTRACT_ISSUE]
            .filter((value, index, values) => values.indexOf(value) === index)
            .sort(),
        }
      : item,
  )
  return { packages, tools, skills }
}

function assertPackageContract(
  catalog: ToolCatalogState,
  item: ExtensionPackageCatalogItem,
): void {
  if (item.status === 'corrupted') {
    throw new Error(
      `Tool Catalog contract failed: Package ${item.packageId}@${item.version} is corrupted`,
    )
  }
  const definitions = [
    ...catalog.tools.filter((tool) =>
      isDefinitionInPackage(tool, item),
    ),
    ...catalog.skills.filter((skill) =>
      isDefinitionInPackage(skill, item),
    ),
  ]
  for (const definition of definitions) {
    assertCatalogItemContract(definition)
  }
}

function assertCatalogItemContract(
  item: ToolCatalogItem | SkillCatalogItem,
): void {
  try {
    if (item.kind === 'tool') {
      const definition = normalizeToolDefinition(item.definition)
      if (definition.origin === 'local_upload') {
        assertDescribedStrictObjectSchema(
          definition.inputSchema,
          `Tool ${definition.id} input`,
          {
            requirePropertyExamples: true,
            requireFieldUsageGuidance: true,
            rejectTrustedContextFields: true,
          },
        )
      } else {
        assertStrictDescribedPropertiesInputSchema(
          definition.inputSchema,
          `Tool ${definition.id} input`,
        )
      }
      return
    }
    const definition = normalizeSkillDefinition(item.definition)
    if (definition.origin === 'local_upload') {
      assertDescribedStrictObjectSchema(
        definition.inputSchema,
        `Skill ${definition.id} input`,
        {
          requireExamples: true,
          examples: definition.examples,
          requirePropertyExamples: true,
          requireFieldUsageGuidance: true,
          rejectTrustedContextFields: true,
        },
      )
    }
  } catch (error) {
    throw new Error(
      `Tool Catalog contract failed: ${stableError(error)}`,
    )
  }
}

function isCatalogItemContractValid(
  item: ToolCatalogItem | SkillCatalogItem,
): boolean {
  try {
    assertCatalogItemContract(item)
    return true
  } catch {
    return false
  }
}

function isDefinitionInPackage(
  item: ToolCatalogItem | SkillCatalogItem,
  packageItem: ExtensionPackageCatalogItem,
): boolean {
  const packageReference = item.definition.package
  return (
    packageReference.packageId === packageItem.packageId &&
    packageReference.packageVersion === packageItem.version &&
    packageReference.packageDigest === packageItem.packageDigest
  )
}

function packageKey(
  item:
    | Pick<ExtensionPackageCatalogItem, 'packageId' | 'version' | 'packageDigest'>
    | ToolCatalogItem['definition']['package'],
): string {
  if ('packageVersion' in item) {
    return `${item.packageId}@${item.packageVersion}:${item.packageDigest}`
  }
  return `${item.packageId}@${item.version}:${item.packageDigest}`
}

function stableError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : 'Tool Catalog contract is invalid'
}

function assertStrictDescribedPropertiesInputSchema(
  schema: JsonObject,
  label: string,
): void {
  const schemaObject = assertJsonObject(schema, `${label} schema`)
  if (schemaObject.type !== 'object') {
    throw new Error(`${label} schema.type is invalid`)
  }
  if (schemaObject.additionalProperties !== false) {
    throw new Error(`${label} schema.additionalProperties must be false`)
  }
  validateRequired(schemaObject, `${label} schema`)
  validatePropertyDescriptions(schemaObject, `${label} schema`)
  compile(schema, label)
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

function validatePropertyDescriptions(
  schema: Record<string, unknown>,
  fieldPath: string,
): void {
  if (isJsonObject(schema.properties)) {
    for (const [name, value] of Object.entries(schema.properties)) {
      const propertyPath = `${fieldPath}.properties.${name}`
      const property = assertJsonObject(value, propertyPath)
      requireDescription(property, propertyPath)
      validateRequired(property, propertyPath)
      validatePropertyDescriptions(property, propertyPath)
    }
  }
  if (isJsonObject(schema.items)) {
    validatePropertyDescriptions(schema.items, `${fieldPath}.items`)
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    const value = schema[key]
    if (!Array.isArray(value)) continue
    value.forEach((item, index) => {
      if (isJsonObject(item)) {
        validatePropertyDescriptions(item, `${fieldPath}.${key}[${index}]`)
      }
    })
  }
}

function compile(schema: JsonObject, label: string): void {
  try {
    new Ajv2020({
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
): void {
  if (typeof value.description !== 'string' || !value.description.trim()) {
    throw new Error(`${fieldPath}.description is required`)
  }
}

function assertJsonObject(
  value: unknown,
  fieldPath: string,
): Record<string, unknown> {
  if (!isJsonObject(value)) {
    throw new Error(`${fieldPath} is invalid`)
  }
  return value
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
