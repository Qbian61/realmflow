import { createHash } from 'node:crypto'
import { parse } from 'yaml'
import {
  normalizeSkillDefinition,
  type SkillDefinition,
} from '../../../../domain/skill-definition'
import type {
  RegisteredSkillVersion,
  SkillSource,
} from '../../../../domain/skill-registry'
import type { ToolRisk } from '../../../../domain/tool-definition'

const DEFAULT_MAX_BYTES = 1024 * 1024
const RISKS = new Set<ToolRisk>(['low', 'medium', 'high', 'critical'])
const CONTEXTS = new Set<SkillDefinition['activation']['contexts'][number]>([
  'general',
  'space',
  'requirement',
  'workflow',
  'schedule',
])
const FRONTMATTER_KEYS = new Set([
  'id',
  'version',
  'name',
  'description',
  'risk',
  'contexts',
  'intents',
  'tools',
  'limits',
  'boundary',
])

type SkillPackInput = {
  source: SkillSource
  content: string
  discoveredAt: number
  maxBytes?: number
}

export function parseSkillPack(input: SkillPackInput): RegisteredSkillVersion {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
  if (Buffer.byteLength(input.content, 'utf8') > maxBytes) {
    throw new Error('Skill pack size exceeds the allowed limit')
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(
    input.content,
  )
  if (!match) throw new Error('Skill frontmatter is invalid')

  let parsed: unknown
  try {
    parsed = parse(match[1], { uniqueKeys: true })
  } catch {
    throw new Error('Skill frontmatter is invalid')
  }
  const metadata = requireObject(parsed, 'frontmatter')
  requireExactKeys(metadata, FRONTMATTER_KEYS, 'frontmatter')
  const body = match[2]
  if (!body.trim()) throw new Error('Skill instructions are empty')

  const id = requireIdentifier(metadata.id, 'ID')
  const version = requireSemver(metadata.version)
  const name = requireText(metadata.name, 'name')
  const description = requireText(metadata.description, 'description', true)
  const risk = requireRisk(metadata.risk)
  const contexts = requireContexts(metadata.contexts)
  const intents = requireStringArray(metadata.intents, 'intents')
  const dependencies = requireToolDependencies(metadata.tools)
  const limits = requireLimits(metadata.limits)
  const boundaryNotes = requireText(metadata.boundary, 'boundary')
  const instructionsDigest = hash(body)
  const packageDigest = hash({
    sourceId: input.source.id,
    sourceKind: input.source.kind,
    locator: input.source.locator,
  })
  const definitionDigest = hash({
    id,
    version,
    name,
    description,
    risk,
    contexts,
    intents,
    dependencies,
    limits,
    boundaryNotes,
    instructionsDigest,
    sourceId: input.source.id,
  })
  const definition = normalizeSkillDefinition({
    schemaVersion: 1,
    id,
    version,
    definitionDigest,
    package: {
      packageId: sourcePackageId(input.source.id),
      packageVersion: '1.0.0',
      packageDigest,
    },
    origin: input.source.kind === 'builtin' ? 'builtin' : 'local_upload',
    name,
    description,
    instructionsPath: 'SKILL.md',
    runtime: { kind: 'instruction' },
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', additionalProperties: true },
    requiredTools: dependencies,
    activation: { intents, contexts },
    limits,
  })
  return {
    skillId: id,
    version,
    digest: definitionDigest,
    sourceId: input.source.id,
    definition,
    instructionsDigest,
    instructions: body,
    boundaryNotes,
    risk,
    discoveredAt: requireTimestamp(input.discoveredAt),
  }
}

function requireToolDependencies(
  value: unknown,
): SkillDefinition['requiredTools'] {
  const tools = requireObject(value, 'tools')
  requireExactKeys(tools, new Set(['required', 'optional']), 'tools')
  const required = requireDependencyList(tools.required, true)
  const optional = requireDependencyList(tools.optional, false)
  const all = [...required, ...optional]
  if (new Set(all.map(({ toolId }) => toolId)).size !== all.length) {
    throw new Error('Skill tools contain duplicate IDs')
  }
  return all
}

function requireDependencyList(
  value: unknown,
  required: boolean,
): SkillDefinition['requiredTools'] {
  if (!Array.isArray(value)) throw new Error('Skill tools are invalid')
  return value.map((entry) => {
    const dependency = requireObject(entry, 'tool dependency')
    requireExactKeys(
      dependency,
      new Set(['id', 'version']),
      'tool dependency',
    )
    return {
      toolId: requireIdentifier(dependency.id, 'tool ID'),
      versionRange: requireText(dependency.version, 'tool version'),
      required,
    }
  })
}

function requireLimits(value: unknown): SkillDefinition['limits'] {
  const limits = requireObject(value, 'limits')
  requireExactKeys(
    limits,
    new Set(['maxToolCalls', 'timeoutMs']),
    'limits',
  )
  return {
    maxToolCalls: requireInteger(
      limits.maxToolCalls,
      1,
      1_000,
      'Tool call limit',
    ),
    timeoutMs: requireInteger(
      limits.timeoutMs,
      1,
      3_600_000,
      'timeout',
    ),
  }
}

function requireContexts(
  value: unknown,
): SkillDefinition['activation']['contexts'] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Skill context is invalid')
  }
  const contexts = value.map((item) => {
    if (typeof item !== 'string' || !CONTEXTS.has(item as never)) {
      throw new Error('Skill context is invalid')
    }
    return item as SkillDefinition['activation']['contexts'][number]
  })
  if (new Set(contexts).size !== contexts.length) {
    throw new Error('Skill contexts contain duplicates')
  }
  return contexts
}

function requireRisk(value: unknown): ToolRisk {
  if (typeof value !== 'string' || !RISKS.has(value as ToolRisk)) {
    throw new Error('Skill risk is invalid')
  }
  return value as ToolRisk
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Skill ${label} are invalid`)
  const items = value.map((item) => requireText(item, label))
  if (new Set(items).size !== items.length) {
    throw new Error(`Skill ${label} contain duplicates`)
  }
  return items
}

function requireObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Skill ${label} is invalid`)
  }
  return value as Record<string, unknown>
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: Set<string>,
  label: string,
): void {
  const keys = Object.keys(value)
  if (
    keys.length !== expected.size ||
    keys.some((key) => !expected.has(key))
  ) {
    throw new Error(`Skill ${label} keys are invalid`)
  }
}

function requireIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value)
  ) {
    throw new Error(`Skill ${label} is invalid`)
  }
  return value
}

function requireSemver(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  ) {
    throw new Error('Skill version is invalid')
  }
  return value
}

function requireText(
  value: unknown,
  label: string,
  allowEmpty = false,
): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new Error(`Skill ${label} is invalid`)
  }
  return value.trim()
}

function requireInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(`Skill ${label} is invalid`)
  }
  return value as number
}

function requireTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Skill discovery timestamp is invalid')
  }
  return value
}

function sourcePackageId(sourceId: string): string {
  const suffix = sourceId.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 160)
  return `realmflow.skill-source.${suffix}`
}

function hash(value: string | unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')
}
