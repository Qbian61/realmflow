import { isAbsolute, relative, win32 } from 'node:path'
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

export type ToolEffect =
  | { kind: 'filesystem.read'; path: string }
  | { kind: 'filesystem.write'; path: string }
  | { kind: 'filesystem.delete'; path: string; permanent: boolean }
  | {
      kind: 'process.execute'
      executableDigest: string
      executableDisplayName: string
      argsFingerprint: string
      workingDirectory: string
    }
  | {
      kind: 'computer.observe'
      application: ApplicationEffectTarget
    }
  | {
      kind: 'computer.control'
      application: ApplicationEffectTarget
    }
  | { kind: 'repository.publish'; repositoryRoot: string }
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
    }
  | {
      outcome: 'authorized'
      source: 'explicit_grant'
      grantIds: string[]
    }
  | {
      outcome: 'ask'
      reason: 'delete' | 'out_of_scope' | 'process' | 'system' | 'external'
      requests: PermissionRequest[]
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

  for (const effect of input.effects) {
    const boundAuthorization = matchingBoundAuthorization(
      effect,
      input.boundScopes
    )
    if (boundAuthorization && isOrdinaryBoundScopeEffect(effect)) {
      authorizationIds.add(boundAuthorization.authorizationId)
      continue
    }

    const request = permissionRequestForEffect(
      effect,
      input.context,
      maximumRisk(input.risk, minimumRisk(effect))
    )
    const grant = selectCoveringGrant(
      request,
      input.explicitGrants,
      input.appSessionId
    )
    if (grant) {
      grantIds.add(grant.id)
      continue
    }
    requests.push(request)
    reason = higherPriorityReason(reason, approvalReason(effect))
  }

  if (requests.length > 0) {
    return { outcome: 'ask', reason, requests }
  }
  if (grantIds.size > 0) {
    return {
      outcome: 'authorized',
      source: 'explicit_grant',
      grantIds: [...grantIds].sort()
    }
  }
  return {
    outcome: 'authorized',
    source: 'bound_scope',
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

function isOrdinaryBoundScopeEffect(effect: ToolEffect): boolean {
  return (
    effect.kind === 'filesystem.read' ||
    effect.kind === 'filesystem.write' ||
    effect.kind === 'process.execute'
  )
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
  if (effect.kind === 'repository.publish') return effect.repositoryRoot
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
    case 'external':
      return {
        capability: effect.capability,
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
    effect.kind === 'computer.control'
  ) {
    return 'system'
  }
  if (
    effect.kind === 'repository.publish' ||
    effect.kind === 'external'
  ) {
    return 'external'
  }
  return 'out_of_scope'
}

const REASON_PRIORITY = {
  out_of_scope: 0,
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
