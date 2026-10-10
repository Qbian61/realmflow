import type { ToolDefinition, ToolDefinitionReference } from './tool-definition'

export const TOOL_PROFILES = ['full', 'coding', 'workflow', 'messaging', 'minimal'] as const
export type ToolProfileId = typeof TOOL_PROFILES[number]
export const TOOL_GROUPS = [
  'fs', 'runtime', 'web', 'sessions', 'memory', 'realmflow', 'office', 'automation', 'media',
] as const
export type ToolGroupId = typeof TOOL_GROUPS[number]
export type ToolPolicyContext = ToolDefinition['discovery']['contexts'][number]

export type ToolPolicyRules = {
  profile?: ToolProfileId
  /** Omitted means unrestricted by this list; [] explicitly closes the layer. */
  allow?: string[]
  deny?: string[]
  alsoAllow?: string[]
}

export type ToolPolicyLayer = ToolPolicyRules & {
  byProvider?: Record<string, ToolPolicyRules>
  byContext?: Partial<Record<ToolPolicyContext, ToolPolicyRules>>
}

export type ToolPolicyEnvironment = {
  providerId?: string
  context?: ToolPolicyContext
  sandbox?: { available: boolean; networkAllowed: boolean }
  inheritedGrants?: ToolDefinitionReference[]
}

export type ToolPolicyInput = ToolPolicyEnvironment & {
  layers?: ToolPolicyLayer[]
}

export type ToolPolicyReason =
  | 'allowed'
  | 'explicit_deny'
  | 'empty_allowlist'
  | 'not_allowed'
  | 'provider_restricted'
  | 'context_restricted'
  | 'sandbox_unavailable'
  | 'network_restricted'
  | 'explicit_grant_required'
  | 'parent_restricted'

export type ToolPolicyDecision = {
  id: string
  version: string
  digest: string
  allowed: boolean
  reason: ToolPolicyReason
}

export type ToolPolicySnapshot = {
  digest: string
  providerId: string
  context: ToolPolicyContext
  sandbox?: ToolPolicyEnvironment['sandbox']
  inheritedGrants?: ToolDefinitionReference[]
  grants: ToolDefinitionReference[]
  decisions: ToolPolicyDecision[]
}

const contexts = new Set(['general', 'space', 'requirement', 'workflow', 'schedule'])

/** Validates persisted/user supplied policy without evaluating tool adapters. */
export function normalizeToolPolicyLayers(value: unknown): ToolPolicyLayer[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error('Tool policy layers are invalid')
  return value.map((item) => {
    const layer = record(item)
    exactKeys(layer, ['profile', 'allow', 'deny', 'alsoAllow', 'byProvider', 'byContext'])
    const rules = normalizeRules(layer)
    return {
      ...rules,
      ...(layer.byProvider === undefined ? {} : { byProvider: overrides(layer.byProvider, false) }),
      ...(layer.byContext === undefined ? {} : { byContext: overrides(layer.byContext, true) }),
    }
  })
}

function normalizeRules(rules: Record<string, unknown>): ToolPolicyRules {
  if (rules.profile !== undefined && !TOOL_PROFILES.includes(rules.profile as ToolProfileId)) {
    throw new Error('Tool policy profile is invalid')
  }
  return {
    ...(rules.profile === undefined ? {} : { profile: rules.profile as ToolProfileId }),
    ...(rules.allow === undefined ? {} : { allow: selectors(rules.allow) }),
    ...(rules.deny === undefined ? {} : { deny: selectors(rules.deny) }),
    ...(rules.alsoAllow === undefined ? {} : { alsoAllow: selectors(rules.alsoAllow) }),
  }
}

function selectors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 512) throw new Error('Tool policy selectors are invalid')
  const result = value.map((item) => {
    if (typeof item !== 'string' || item.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(item)) {
      throw new Error('Tool policy selector is invalid')
    }
    if (item.startsWith('group:') && !TOOL_GROUPS.includes(item.slice(6) as ToolGroupId)) {
      throw new Error('Tool policy group is invalid')
    }
    return item
  })
  return [...new Set(result)].sort()
}

function overrides(value: unknown, contextual: boolean): Record<string, ToolPolicyRules> {
  const entries = Object.entries(record(value))
  if (entries.length > 128) throw new Error('Tool policy overrides exceed limit')
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => {
    if (!key || key.length > 200 || (contextual && !contexts.has(key))) {
      throw new Error('Tool policy override key is invalid')
    }
    const rules = record(entry)
    exactKeys(rules, ['profile', 'allow', 'deny', 'alsoAllow'])
    return [key, normalizeRules(rules)]
  }))
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tool policy must be an object')
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error('Tool policy field is invalid')
}
