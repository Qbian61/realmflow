import { isAbsolute, relative, win32 } from 'node:path'
import type { ApprovalProfileId, EffectiveRisk } from './approval-profile'
import type {
  BoundScopeAuthorization,
  PermissionContext,
  PermissionGrant,
  PermissionRequest,
  ToolBusinessScope
} from './capability-permission'
import {
  selectCoveringGrant
} from './capability-permission'
import type {
  ToolCapability,
  ToolRisk
} from './tool-definition'

export type { BoundScopeAuthorization } from './capability-permission'

type ApplicationEffectTarget = {
  bundleId: string
  displayName: string
}

type ProcessEffectOwner =
  | { type: 'conversation'; id: string }
  | { type: 'node_run'; id: string }
  | { type: 'requirement'; id: string }
  | { type: 'schedule_run'; id: string }
  | { type: 'application'; id: string }

export type ToolEffect =
  | { kind: 'filesystem.read'; path: string; sensitivity?: 'normal' | 'sensitive' }
  | { kind: 'filesystem.write'; path: string }
  | { kind: 'filesystem.delete'; path: string; permanent: boolean }
  | {
      kind: 'process.execute'
      executableDigest: string
      executableDisplayName: string
      argsFingerprint: string
      workingDirectory: string
      execution?: 'sandboxed' | 'host'
      commandClass?: 'safe' | 'unknown' | 'dangerous'
    }
  | { kind: 'network.public_read'; origin: string; localDataEgress: false; providerId?: string }
  | { kind: 'browser.session.create'; profile: 'isolated' }
  | { kind: 'browser.session.close'; sessionId: string }
  | { kind: 'browser.profile.attach'; profileId: string }
  | { kind: 'browser.page.read'; sessionId: string; origin: string; privateSession: boolean; targetDigest: string }
  | { kind: 'browser.page.control'; sessionId: string; origin: string; semantic: 'control' | 'sensitive' | 'publish'; targetDigest: string }
  | { kind: 'process.inspect'; workingDirectory: string }
  | { kind: 'process.inspect'; owner: ProcessEffectOwner }
  | { kind: 'process.manage'; processId: string; currentRun: boolean; fingerprint: string }
  | { kind: 'repository.local_write'; repositoryRoot: string }
  | {
      kind: 'computer.observe'
      application: ApplicationEffectTarget
    }
  | {
      kind: 'computer.control'
      application: ApplicationEffectTarget
    }
  | { kind: 'repository.publish'; repositoryRoot: string }
  | { kind: 'external.publish'; resourceKey: string }
  | {
      kind: 'external'
      capability: Extract<
        ToolCapability,
        'network.connect' | 'connector.use' | 'credential.use'
      >
      resourceKey: string
    }

export type ToolAuthorizationDecision =
  | {
      outcome: 'authorized'
      source: 'bound_scope'
      authorizationIds: string[]
      effectiveRisk?: EffectiveRisk
    }
  | {
      outcome: 'authorized'
      source: 'explicit_grant'
      grantIds: string[]
      effectiveRisk?: EffectiveRisk
    }
  | {
      outcome: 'ask'
      reason: 'delete' | 'out_of_scope' | 'process' | 'system' | 'external' | 'write'
      requests: PermissionRequest[]
      effectiveRisk: EffectiveRisk
      maxGrant: 'once' | 'session' | 'space' | 'persistent'
    }
  | {
      outcome: 'denied'
      code: 'authorization_revoked'
      message: string
    }

export function authorizeToolEffects(input: {
  effects: readonly ToolEffect[]
  risk: ToolRisk
  context: PermissionContext
  appSessionId: string
  boundScopes: readonly BoundScopeAuthorization[]
  explicitGrants: readonly PermissionGrant[]
  approvalProfile?: ApprovalProfileId
}): ToolAuthorizationDecision {
  const revoked = input.boundScopes.find(
    (authorization) =>
      authorization.status === 'revoked' &&
      input.effects.some((effect) =>
        effectPath(effect)
          ? authorization.roots.some((root) =>
              pathIsWithin(root.canonicalPath, effectPath(effect)!)
            )
          : false
      )
  )
  if (revoked) {
    return {
      outcome: 'denied',
      code: 'authorization_revoked',
      message: 'The bound scope authorization was revoked'
    }
  }

  const authorizationIds = new Set<string>()
  const grantIds = new Set<string>()
  const requests: PermissionRequest[] = []
  let reason: Extract<
    ToolAuthorizationDecision,
    { outcome: 'ask' }
  >['reason'] = 'out_of_scope'
  let effectiveRisk: EffectiveRisk = 'L0'
  let onceOnly = false

  for (const effect of input.effects) {
    const boundAuthorization = matchingBoundAuthorization(
      effect,
      input.boundScopes
    )
    const risk = effectRisk(effect, Boolean(boundAuthorization))
    if (risk > effectiveRisk) effectiveRisk = risk
    const hardGate = effect.kind === 'filesystem.delete' || risk === 'L4'
    onceOnly ||= hardGate
    if (isAutomaticallyAllowed(effect, Boolean(boundAuthorization), input.approvalProfile ?? 'protected')) {
      if (boundAuthorization) authorizationIds.add(boundAuthorization.authorizationId)
      continue
    }

    const request = permissionRequestForEffect(
      effect,
      input.context,
      maximumRisk(input.risk, minimumRisk(effect))
    )
    const grant = hardGate ? undefined : selectCoveringGrant(
      request,
      input.explicitGrants.filter(grant =>
        risk !== 'L3' || grant.mode === 'session'),
      input.appSessionId
    )
    if (grant) {
      grantIds.add(grant.id)
      continue
    }
    requests.push(request)
    reason = higherPriorityReason(reason,
      effect.kind === 'filesystem.write' && boundAuthorization ? 'write' : approvalReason(effect))
  }

  if (requests.length > 0) {
    return {
      outcome: 'ask', reason, requests, effectiveRisk,
      maxGrant: onceOnly ? 'once' : effectiveRisk === 'L3' ? 'session'
        : effectiveRisk === 'L2' ? 'space' : 'persistent',
    }
  }
  if (grantIds.size > 0) {
    return {
      outcome: 'authorized',
      source: 'explicit_grant',
      effectiveRisk,
      grantIds: [...grantIds].sort()
    }
  }
  return {
    outcome: 'authorized',
    source: 'bound_scope',
    effectiveRisk,
    authorizationIds: [...authorizationIds].sort()
  }
}

function matchingBoundAuthorization(
  effect: ToolEffect,
  authorizations: readonly BoundScopeAuthorization[]
): BoundScopeAuthorization | undefined {
  const path = effectPath(effect)
  if (!path) return undefined
  return authorizations.find(
    (authorization) =>
      authorization.status === 'active' &&
      authorization.roots.some((root) =>
        pathIsWithin(root.canonicalPath, path)
      )
  )
}

function isAutomaticallyAllowed(effect: ToolEffect, inScope: boolean, profile: ApprovalProfileId): boolean {
  if (effect.kind === 'network.public_read') return true
  if (effect.kind === 'browser.page.read') return !effect.privateSession
  if (effect.kind === 'process.inspect') return effectPath(effect) ? inScope : true
  if (effect.kind === 'process.manage') return effect.currentRun && profile !== 'cautious'
  if (effect.kind === 'browser.session.create' || effect.kind === 'browser.session.close') {
    return profile !== 'cautious'
  }
  if (!inScope) return false
  if (effect.kind === 'filesystem.read') return effect.sensitivity !== 'sensitive'
  if (effect.kind === 'filesystem.write') return profile !== 'cautious'
  if (effect.kind === 'repository.local_write') return profile !== 'cautious'
  if (effect.kind === 'process.execute') {
    return effect.execution === 'sandboxed' &&
      (effect.commandClass === 'safe' && profile !== 'cautious' ||
       effect.commandClass === 'unknown' && profile === 'trusted')
  }
  return false
}

function effectRisk(effect: ToolEffect, inScope: boolean): EffectiveRisk {
  switch (effect.kind) {
    case 'network.public_read': return 'L0'
    case 'filesystem.read': return effect.sensitivity === 'sensitive' ? 'L3' : inScope ? 'L0' : 'L2'
    case 'filesystem.write': return inScope ? 'L1' : 'L2'
    case 'filesystem.delete': return effect.permanent ? 'L4' : 'L3'
    case 'repository.publish': return 'L4'
    case 'external.publish': return 'L4'
    case 'repository.local_write': return 'L2'
    case 'browser.session.create':
    case 'browser.session.close': return 'L1'
    case 'browser.profile.attach': return 'L3'
    case 'browser.page.read': return effect.privateSession ? 'L2' : 'L0'
    case 'browser.page.control': return effect.semantic === 'publish' ? 'L4' : effect.semantic === 'sensitive' ? 'L3' : 'L2'
    case 'process.inspect': return effectPath(effect) ? inScope ? 'L0' : 'L2' : 'L0'
    case 'process.manage': return effect.currentRun ? 'L2' : 'L3'
    case 'process.execute': return effect.execution !== 'sandboxed' ||
      !effect.commandClass || effect.commandClass === 'dangerous' ? 'L3'
      : inScope && effect.commandClass === 'safe' ? 'L1' : 'L2'
    case 'computer.observe':
    case 'computer.control': return 'L2'
    case 'external': return 'L3'
  }
}

function effectPath(effect: ToolEffect): string | undefined {
  if (
    effect.kind === 'filesystem.read' ||
    effect.kind === 'filesystem.write' ||
    effect.kind === 'filesystem.delete'
  ) {
    return effect.path
  }
  if (effect.kind === 'process.execute') return effect.workingDirectory
  if (effect.kind === 'process.inspect' && 'workingDirectory' in effect) {
    return effect.workingDirectory
  }
  if (effect.kind === 'repository.publish' || effect.kind === 'repository.local_write') return effect.repositoryRoot
  return undefined
}

function permissionRequestForEffect(
  effect: ToolEffect,
  context: PermissionContext,
  risk: ToolRisk
): PermissionRequest {
  switch (effect.kind) {
    case 'filesystem.read':
    case 'filesystem.write':
    case 'filesystem.delete':
      return {
        capability: effect.kind,
        resource: {
          kind: 'path',
          canonicalPath: effect.path,
          access: 'file'
        },
        context: { ...context },
        risk
      }
    case 'process.execute':
      return {
        capability: 'process.execute',
        resource: {
          kind: 'process',
          executableDigest: effect.executableDigest,
          executableDisplayName: effect.executableDisplayName,
          argsFingerprint: effect.argsFingerprint,
          workingDirectoryScope: businessScope(context)
        },
        context: { ...context },
        risk
      }
    case 'process.inspect':
      if (!('workingDirectory' in effect)) {
        return {
          capability: 'process.inspect',
          resource: businessScope(context),
          context: { ...context },
          risk
        }
      }
      return {
        capability: 'process.inspect',
        resource: { kind: 'path', canonicalPath: effect.workingDirectory, access: 'directory' },
        context: { ...context }, risk,
      }
    case 'process.manage':
      return {
        capability: 'process.manage',
        resource: { kind: 'application', bundleId: `realmflow.process.${effect.processId}`, displayName: 'RealmFlow child process' },
        context: { ...context }, risk,
      }
    case 'computer.observe':
    case 'computer.control':
      return {
        capability: effect.kind,
        resource: {
          kind: 'application',
          bundleId: effect.application.bundleId,
          displayName: effect.application.displayName
        },
        context: { ...context },
        risk
      }
    case 'repository.local_write':
    case 'repository.publish':
      return {
        capability: 'repository.modify',
        resource: {
          kind: 'path',
          canonicalPath: effect.repositoryRoot,
          access: 'directory'
        },
        context: { ...context },
        risk
      }
    case 'browser.session.create':
    case 'browser.session.close':
    case 'browser.profile.attach':
      return {
        capability: effect.kind === 'browser.profile.attach' ? 'credential.use' : 'computer.control',
        resource: effect.kind === 'browser.profile.attach'
          ? { kind: 'network', service: `browser-profile:${effect.profileId}` }
          : { kind: 'application', bundleId: 'realmflow.browser', displayName: 'RealmFlow Browser' },
        context: { ...context }, risk,
      }
    case 'browser.page.read':
    case 'browser.page.control':
      return {
        capability: effect.kind === 'browser.page.read' ? 'computer.observe' : 'computer.control',
        resource: { kind: 'application', bundleId: `realmflow.browser.${effect.sessionId}`, displayName: 'RealmFlow Browser' },
        context: { ...context }, risk,
      }
    case 'network.public_read':
      return {
        capability: 'network.connect',
        resource: { kind: 'network', service: effect.origin },
        context: { ...context }, risk,
      }
    case 'external':
    case 'external.publish':
      return {
        capability: effect.kind === 'external.publish' ? 'connector.use' : effect.capability,
        resource: {
          kind: 'network',
          service: effect.resourceKey
        },
        context: { ...context },
        risk
      }
  }
}

function businessScope(context: PermissionContext): ToolBusinessScope {
  if (context.requirementId) {
    return {
      kind: 'requirement',
      requirementId: context.requirementId
    }
  }
  if (context.workspaceId) {
    return { kind: 'workspace', workspaceId: context.workspaceId }
  }
  throw new Error('Process permission requires a bound business scope')
}

function minimumRisk(effect: ToolEffect): ToolRisk {
  if (
    effect.kind === 'filesystem.delete' &&
    effect.permanent
  ) {
    return 'critical'
  }
  if (
    effect.kind === 'filesystem.delete' ||
    effect.kind === 'process.execute' ||
    effect.kind === 'computer.control' ||
    effect.kind === 'repository.publish'
  ) {
    return 'high'
  }
  if (
    effect.kind === 'computer.observe' ||
    effect.kind === 'external'
  ) {
    return 'medium'
  }
  return 'low'
}

function approvalReason(
  effect: ToolEffect
): Extract<ToolAuthorizationDecision, { outcome: 'ask' }>['reason'] {
  if (effect.kind === 'filesystem.delete') return 'delete'
  if (effect.kind === 'process.execute') return 'process'
  if (
    effect.kind === 'computer.observe' ||
    effect.kind === 'computer.control' ||
    effect.kind.startsWith('browser.')
  ) {
    return 'system'
  }
  if (
    effect.kind === 'repository.publish' ||
    effect.kind === 'external.publish' ||
    effect.kind === 'repository.local_write' ||
    effect.kind === 'external'
  ) {
    return 'external'
  }
  return 'out_of_scope'
}

const REASON_PRIORITY = {
  out_of_scope: 0,
  write: 1,
  external: 1,
  process: 2,
  system: 3,
  delete: 4
} as const

function higherPriorityReason(
  left: keyof typeof REASON_PRIORITY,
  right: keyof typeof REASON_PRIORITY
): keyof typeof REASON_PRIORITY {
  return REASON_PRIORITY[right] > REASON_PRIORITY[left] ? right : left
}

const RISK_PRIORITY: Record<ToolRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

function maximumRisk(left: ToolRisk, right: ToolRisk): ToolRisk {
  return RISK_PRIORITY[left] >= RISK_PRIORITY[right] ? left : right
}

function pathIsWithin(root: string, target: string): boolean {
  const windowsPath =
    /^[A-Za-z]:[\\/]/.test(root) || /^[A-Za-z]:[\\/]/.test(target)
  const pathApi = windowsPath ? win32 : { isAbsolute, relative }
  if (!pathApi.isAbsolute(root) || !pathApi.isAbsolute(target)) return false
  const child = pathApi.relative(root, target)
  return child === '' || (!child.startsWith('..') && !pathApi.isAbsolute(child))
}
