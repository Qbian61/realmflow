import { createHash } from 'node:crypto'
import type { ToolDefinition, ToolDefinitionReference } from '../../../../domain/tool-definition'
import {
  normalizeToolPolicyLayers,
  type ToolGroupId,
  type ToolPolicyDecision,
  type ToolPolicyInput,
  type ToolPolicyReason,
  type ToolPolicyRules,
  type ToolPolicySnapshot,
  type ToolProfileId,
} from '../../../../domain/tool-policy'

const PROFILES: Record<ToolProfileId, readonly string[] | null> = {
  full: null,
  coding: ['group:fs', 'group:runtime', 'group:web', 'group:memory', 'ask_user', 'progress_card'],
  workflow: ['group:realmflow', 'group:office', 'group:memory', 'group:automation', 'ask_user'],
  messaging: ['group:sessions', 'group:web', 'ask_user', 'progress_card'],
  minimal: ['ask_user', 'progress_card', 'session_status'],
}
const GROUP_PREFIXES: Record<ToolGroupId, readonly string[]> = {
  fs: ['builtin.files.', 'builtin.git.', 'filesystem_', 'git_'],
  runtime: ['builtin.process.', 'builtin.code.', 'builtin.runtime.', 'process_', 'code_'],
  web: ['builtin.web.', 'builtin.browser.', 'web_', 'browser'],
  sessions: ['sessions', 'session_status', 'subagents', 'agents_list', 'goal', 'steer'],
  memory: ['builtin.knowledge.', 'knowledge_', 'memory_'],
  realmflow: ['builtin.realmflow.', 'realmflow_'],
  office: ['builtin.document.', 'builtin.documents.', 'builtin.spreadsheet.', 'builtin.presentation.', 'builtin.pdf.',
    'builtin.image.', 'builtin.archive.', 'document', 'spreadsheet', 'presentation', 'pdf', 'image', 'archive'],
  automation: ['builtin.schedule.', 'schedule', 'cron', 'heartbeat', 'progress_card', 'gateway'],
  media: ['image_generate', 'video_generate', 'music_generate', 'tts'],
}

/** Pure evaluation; permission planning still controls concrete side effects. */
export class ToolPolicyEngine {
  resolve(tools: readonly ToolDefinition[], input: ToolPolicyInput = {}): ToolPolicySnapshot {
    const layers = normalizeToolPolicyLayers(input.layers ?? [])
    const providerId = input.providerId ?? ''
    const context = input.context ?? 'general'
    const sandbox = input.sandbox ? Object.freeze({
      available: input.sandbox.available, networkAllowed: input.sandbox.networkAllowed,
    }) : undefined
    const rules = layers.flatMap((layer) => [
      { rules: layer, source: 'base' as const },
      ...(Object.hasOwn(layer.byProvider ?? {}, providerId)
        ? [{ rules: layer.byProvider![providerId], source: 'provider' as const }] : []),
      ...(Object.hasOwn(layer.byContext ?? {}, context)
        ? [{ rules: layer.byContext![context]!, source: 'context' as const }] : []),
    ])
    const inherited = input.inheritedGrants
      ? new Set(input.inheritedGrants.map(referenceKey)) : undefined
    const definitions = [...new Map(tools.map((tool) => [referenceKey(reference(tool)), tool])).values()]
      .sort((left, right) => referenceKey(reference(left)).localeCompare(referenceKey(reference(right))))
    const decisions: ToolPolicyDecision[] = definitions.map((tool) => {
      let reason: ToolPolicyReason = 'allowed'
      // Check every deny first so UI reports the strongest applicable constraint.
      if (rules.some((layer) => layer.rules.deny?.some((selector) => matches(tool, selector)))) {
        reason = 'explicit_deny'
      } else if (inherited && !inherited.has(referenceKey(reference(tool)))) {
        reason = 'parent_restricted'
      } else if (tool.executor.kind === 'sandbox' && input.sandbox?.available === false) {
        reason = 'sandbox_unavailable'
      } else if (tool.capabilities.includes('network.connect') && input.sandbox?.networkAllowed === false) {
        reason = 'network_restricted'
      } else {
        for (const layer of rules) {
          const rejection = rejectedByRules(tool, layer.rules)
          if (!rejection) continue
          reason = layer.source === 'provider' ? 'provider_restricted'
            : layer.source === 'context' ? 'context_restricted' : rejection
          break
        }
        if (reason === 'allowed' && ['high', 'critical'].includes(tool.risk) &&
          !rules.some(({ rules: rule }) => [...(rule.allow ?? []), ...(rule.alsoAllow ?? [])].includes(tool.id))) {
          reason = 'explicit_grant_required'
        }
      }
      return {
        id: tool.id, version: tool.version, digest: tool.definitionDigest,
        allowed: reason === 'allowed', reason,
      }
    })
    const grants = decisions.filter(({ allowed }) => allowed).map(({ id, version, digest }) => ({
      kind: 'tool' as const, id, version, digest,
    }))
    const digest = createHash('sha256').update(JSON.stringify({
      layers, providerId, context, sandbox: sandbox ?? null,
      inherited: inherited ? [...inherited].sort() : null, decisions,
    })).digest('hex')
    return Object.freeze({
      digest, providerId, context,
      ...(sandbox ? { sandbox } : {}),
      ...(input.inheritedGrants ? {
        inheritedGrants: Object.freeze([...input.inheritedGrants]
          .sort((a, b) => referenceKey(a).localeCompare(referenceKey(b)))
          .map((grant) => Object.freeze({ ...grant }))) as unknown as ToolDefinitionReference[],
      } : {}),
      grants: Object.freeze(grants.map(Object.freeze)) as unknown as ToolDefinitionReference[],
      decisions: Object.freeze(decisions.map(Object.freeze)) as unknown as ToolPolicyDecision[],
    })
  }
}

function rejectedByRules(tool: ToolDefinition, rules: ToolPolicyRules): ToolPolicyReason | undefined {
  if (rules.allow?.length === 0) return 'empty_allowlist'
  const base = rules.allow ?? (rules.profile ? PROFILES[rules.profile] : null)
  if (base === null || base.some((selector) => matches(tool, selector)) ||
    rules.alsoAllow?.some((selector) => matches(tool, selector))) return undefined
  return 'not_allowed'
}

function matches(tool: ToolDefinition, selector: string): boolean {
  if (!selector.startsWith('group:')) return tool.id === selector
  const group = selector.slice(6) as ToolGroupId
  if (group === 'runtime' && tool.executor.kind === 'sandbox') return true
  return GROUP_PREFIXES[group].some((prefix) =>
    prefix.endsWith('.') || prefix.endsWith('_')
      ? tool.id.startsWith(prefix)
      : tool.id === prefix || tool.id.startsWith(`${prefix}_`),
  )
}

function reference(tool: ToolDefinition): ToolDefinitionReference {
  return { kind: 'tool', id: tool.id, version: tool.version, digest: tool.definitionDigest }
}

function referenceKey(value: ToolDefinitionReference): string {
  return `${value.kind}:${value.id}@${value.version}:${value.digest}`
}
