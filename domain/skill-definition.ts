import type {
  ToolCapability,
  ToolDefinition,
  ToolOrigin,
} from './tool-definition'
import {
  cloneJsonObject,
  normalizeStringArray,
  requireBoolean,
  requireDigest,
  requireEnum,
  requireExactKeys,
  requireIdentifier,
  requireInteger,
  requireObject,
  requireSafeRelativePath,
  requireSemver,
  requireText,
  type JsonObject,
} from './tool-protocol-validation'

export type SkillDefinition = {
  schemaVersion: 1
  id: string
  version: string
  definitionDigest: string
  package: ToolDefinition['package']
  origin: ToolOrigin
  name: string
  description: string
  instructionsPath: string
  runtime:
    | { kind: 'instruction' }
    | {
        kind: 'workflow'
        steps: Array<{
          id: string
          instruction: string
          toolId?: string
        }>
      }
    | {
        kind: 'executable'
        runtime: 'python'
        entryPath: string
        capabilities: SkillExecutableCapability[]
        connectorServices: string[]
        resources: {
          maxMemoryMb: number
          maxOutputBytes: number
        }
      }
  inputSchema: JsonObject
  outputSchema: JsonObject
  requiredTools: Array<{
    toolId: string
    versionRange: string
    required: boolean
  }>
  activation: {
    intents: string[]
    contexts: ToolDefinition['discovery']['contexts']
  }
  limits: {
    maxToolCalls: number
    timeoutMs: number
  }
}

export type SkillExecutableCapability = Extract<
  ToolCapability,
  | 'filesystem.read'
  | 'filesystem.write'
  | 'process.execute'
  | 'repository.modify'
>

const ORIGINS = new Set<ToolOrigin>(['builtin', 'local_upload', 'mcp'])
const CONTEXTS = new Set<SkillDefinition['activation']['contexts'][number]>([
  'general',
  'space',
  'requirement',
  'workflow',
  'schedule',
])
const DEFINITION_KEYS = new Set([
  'schemaVersion',
  'id',
  'version',
  'definitionDigest',
  'package',
  'origin',
  'name',
  'description',
  'instructionsPath',
  'runtime',
  'inputSchema',
  'outputSchema',
  'requiredTools',
  'activation',
  'limits',
])
const EXECUTABLE_CAPABILITIES = new Set<SkillExecutableCapability>([
  'filesystem.read',
  'filesystem.write',
  'process.execute',
  'repository.modify',
])
const SEMVER = String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)`
const VERSION_RANGE_PATTERNS = [
  new RegExp(`^${SEMVER}$`),
  new RegExp(`^[~^]${SEMVER}$`),
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:x|\*)$/,
  new RegExp(`^(?:(?:>=|<=|>|<|=)${SEMVER})(?:\\s+(?:>=|<=|>|<|=)${SEMVER})*$`),
]

export function normalizeSkillDefinition(value: unknown): SkillDefinition {
  try {
    const definition = requireObject(value, 'definition')
    requireExactKeys(definition, DEFINITION_KEYS, 'definition')
    if (definition.schemaVersion !== 1) {
      throw new Error('schema version is invalid')
    }
    const requiredTools = normalizeRequiredTools(definition.requiredTools)
    return {
      schemaVersion: 1,
      id: requireIdentifier(definition.id, 'ID'),
      version: requireSemver(definition.version, 'version'),
      definitionDigest: requireDigest(
        definition.definitionDigest,
        'definition digest',
      ),
      package: normalizePackage(definition.package),
      origin: requireEnum(definition.origin, ORIGINS, 'origin'),
      name: requireText(definition.name, 'name'),
      description: requireText(definition.description, 'description', true),
      instructionsPath: requireSafeRelativePath(
        definition.instructionsPath,
        'instructions path',
      ),
      runtime: normalizeRuntime(definition.runtime, requiredTools),
      inputSchema: cloneJsonObject(definition.inputSchema, 'input schema'),
      outputSchema: cloneJsonObject(definition.outputSchema, 'output schema'),
      requiredTools,
      activation: normalizeActivation(definition.activation),
      limits: normalizeLimits(definition.limits),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'is invalid'
    if (message.startsWith('Skill definition')) throw error
    throw new Error(`Skill definition ${message}`)
  }
}

function normalizeRuntime(
  value: unknown,
  requiredTools: SkillDefinition['requiredTools'],
): SkillDefinition['runtime'] {
  const runtime = requireObject(value, 'runtime')
  if (runtime.kind === 'instruction') {
    requireExactKeys(runtime, new Set(['kind']), 'runtime')
    return { kind: 'instruction' }
  }
  if (runtime.kind === 'workflow') {
    requireExactKeys(runtime, new Set(['kind', 'steps']), 'runtime')
    if (!Array.isArray(runtime.steps) || runtime.steps.length === 0) {
      throw new Error('workflow steps are invalid')
    }
    const declaredTools = new Set(requiredTools.map(({ toolId }) => toolId))
    const steps = runtime.steps.map((value) => {
      const step = requireObject(value, 'workflow step')
      requireExactKeys(
        step,
        new Set(['id', 'instruction', 'toolId']),
        'workflow step',
        new Set(['toolId']),
      )
      const toolId =
        step.toolId === undefined
          ? undefined
          : requireIdentifier(step.toolId, 'workflow Tool ID')
      if (toolId && !declaredTools.has(toolId)) {
        throw new Error('workflow step Tool is not declared')
      }
      return {
        id: requireIdentifier(step.id, 'workflow step ID'),
        instruction: requireText(step.instruction, 'workflow step instruction'),
        ...(toolId ? { toolId } : {}),
      }
    })
    if (new Set(steps.map(({ id }) => id)).size !== steps.length) {
      throw new Error('workflow steps are duplicated')
    }
    return { kind: 'workflow', steps }
  }
  if (runtime.kind === 'executable') {
    requireExactKeys(
      runtime,
      new Set([
        'kind',
        'runtime',
        'entryPath',
        'capabilities',
        'connectorServices',
        'resources',
      ]),
      'runtime',
    )
    if (runtime.runtime !== 'python') {
      throw new Error('executable runtime is invalid')
    }
    if (!Array.isArray(runtime.capabilities)) {
      throw new Error('executable capabilities are invalid')
    }
    const capabilities = runtime.capabilities.map((capability) =>
      requireEnum(capability, EXECUTABLE_CAPABILITIES, 'executable capability'),
    )
    if (new Set(capabilities).size !== capabilities.length) {
      throw new Error('executable capabilities are duplicated')
    }
    const resources = requireObject(runtime.resources, 'runtime resources')
    requireExactKeys(
      resources,
      new Set(['maxMemoryMb', 'maxOutputBytes']),
      'runtime resources',
    )
    return {
      kind: 'executable',
      runtime: 'python',
      entryPath: requireSafeRelativePath(
        runtime.entryPath,
        'executable entry path',
      ),
      capabilities: capabilities.sort(),
      connectorServices: normalizeStringArray(
        runtime.connectorServices,
        'executable Connector services',
      ),
      resources: {
        maxMemoryMb: requireInteger(
          resources.maxMemoryMb,
          'executable memory limit',
          16,
          4_096,
        ),
        maxOutputBytes: requireInteger(
          resources.maxOutputBytes,
          'executable output limit',
          1,
          16_777_216,
        ),
      },
    }
  }
  throw new Error('runtime kind is invalid')
}

export function isToolVersionInRange(version: string, range: string): boolean {
  const current = semverParts(requireSemver(version, 'Tool version'))
  requireVersionRange(range)
  if (range.startsWith('^')) {
    const minimum = semverParts(range.slice(1))
    const maximum =
      minimum[0] > 0
        ? [minimum[0] + 1, 0, 0]
        : minimum[1] > 0
          ? [0, minimum[1] + 1, 0]
          : [0, 0, minimum[2] + 1]
    return (
      compareSemver(current, minimum) >= 0 &&
      compareSemver(current, maximum) < 0
    )
  }
  if (range.startsWith('~')) {
    const minimum = semverParts(range.slice(1))
    return (
      compareSemver(current, minimum) >= 0 &&
      compareSemver(current, [minimum[0], minimum[1] + 1, 0]) < 0
    )
  }
  if (range.endsWith('.x') || range.endsWith('.*')) {
    const [major, minor] = range.split('.').map(Number)
    return current[0] === major && current[1] === minor
  }
  if (/^\d+\.\d+\.\d+$/.test(range)) {
    return compareSemver(current, semverParts(range)) === 0
  }
  return range.split(/\s+/).every((clause) => {
    const match = /^(>=|<=|>|<|=)(\d+\.\d+\.\d+)$/.exec(clause)
    if (!match) return false
    const comparison = compareSemver(current, semverParts(match[2]))
    if (match[1] === '>=') return comparison >= 0
    if (match[1] === '<=') return comparison <= 0
    if (match[1] === '>') return comparison > 0
    if (match[1] === '<') return comparison < 0
    return comparison === 0
  })
}

function normalizePackage(value: unknown): SkillDefinition['package'] {
  const packageReference = requireObject(value, 'package')
  requireExactKeys(
    packageReference,
    new Set(['packageId', 'packageVersion', 'packageDigest']),
    'package',
  )
  return {
    packageId: requireIdentifier(packageReference.packageId, 'package ID'),
    packageVersion: requireSemver(
      packageReference.packageVersion,
      'package version',
    ),
    packageDigest: requireDigest(
      packageReference.packageDigest,
      'package digest',
    ),
  }
}

function normalizeRequiredTools(
  value: unknown,
): SkillDefinition['requiredTools'] {
  if (!Array.isArray(value)) {
    throw new Error('required Tools are invalid')
  }
  const requirements = value.map((item) => {
    const requirement = requireObject(item, 'required Tool')
    requireExactKeys(
      requirement,
      new Set(['toolId', 'versionRange', 'required']),
      'required Tool',
    )
    return {
      toolId: requireIdentifier(requirement.toolId, 'Tool ID'),
      versionRange: requireVersionRange(requirement.versionRange),
      required: requireBoolean(requirement.required, 'required Tool flag'),
    }
  })
  const toolIds = requirements.map(({ toolId }) => toolId)
  if (new Set(toolIds).size !== toolIds.length) {
    throw new Error('required Tools are duplicated')
  }
  return requirements.sort(
    (left, right) =>
      left.toolId.localeCompare(right.toolId) ||
      left.versionRange.localeCompare(right.versionRange),
  )
}

function normalizeActivation(value: unknown): SkillDefinition['activation'] {
  const activation = requireObject(value, 'activation')
  requireExactKeys(activation, new Set(['intents', 'contexts']), 'activation')
  if (!Array.isArray(activation.contexts)) {
    throw new Error('activation contexts are invalid')
  }
  const contexts = activation.contexts.map((context) =>
    requireEnum(context, CONTEXTS, 'activation context'),
  )
  if (new Set(contexts).size !== contexts.length) {
    throw new Error('activation contexts are duplicated')
  }
  return {
    intents: normalizeStringArray(activation.intents, 'activation intents'),
    contexts: contexts.sort(),
  }
}

function normalizeLimits(value: unknown): SkillDefinition['limits'] {
  const limits = requireObject(value, 'limits')
  requireExactKeys(limits, new Set(['maxToolCalls', 'timeoutMs']), 'limits')
  return {
    maxToolCalls: requireInteger(
      limits.maxToolCalls,
      'Tool call limit',
      1,
      1_000,
    ),
    timeoutMs: requireInteger(limits.timeoutMs, 'timeout', 1, 3_600_000),
  }
}

function requireVersionRange(value: unknown): string {
  const versionRange = requireText(value, 'Tool version range')
  if (!VERSION_RANGE_PATTERNS.some((pattern) => pattern.test(versionRange))) {
    throw new Error('Tool version range is invalid')
  }
  return versionRange
}

function semverParts(value: string): [number, number, number] {
  const parts = value.split('.').map(Number)
  return [parts[0], parts[1], parts[2]]
}

function compareSemver(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index] - right[index]
    if (difference !== 0) return difference
  }
  return 0
}
