import { createHash } from 'node:crypto'
import type {
  ToolCapability,
  ToolRisk
} from './tool-definition'

export type SandboxExecutionLevel =
  | 'pure_function'
  | 'controlled_file'
  | 'controlled_process'
  | 'controlled_network'
  | 'external_side_effect'

export type SandboxPlatformIsolation =
  | 'sandbox-exec'
  | 'bwrap'
  | 'unavailable'

export type SandboxManifest = {
  schemaVersion: 1
  executionId: string
  executionLevel: SandboxExecutionLevel
  enforcement: 'enforced'
  platformIsolation: Exclude<SandboxPlatformIsolation, 'unavailable'>
  packageRoot: string
  readOnlyRoots: string[]
  readWriteRoots: string[]
  environmentVariables: string[]
  networkTargets: Array<{
    service: string
    origin: string
    pathPrefix: string
  }>
  resources: {
    timeoutMs: number
    maxMemoryMb: number
    maxOutputBytes: number
  }
  policyDigest: string
}

export type SandboxManifestInput = {
  executionId: string
  runtime: 'python' | 'process'
  capabilities: ToolCapability[]
  effects: string[]
  risk: ToolRisk
  packageRoot: string
  scopeRoots: string[]
  connectorGrants: Array<{
    service: string
    url: string
    token: string
  }>
  resources: SandboxManifest['resources']
  platform: {
    name: NodeJS.Platform
    processIsolation: SandboxPlatformIsolation
  }
}

export class SandboxPolicyError extends Error {
  readonly name = 'SandboxPolicyError'

  constructor(
    readonly code:
      | 'platform_isolation_required'
      | 'invalid_network_grant',
    message: string
  ) {
    super(message)
  }
}

export function createSandboxManifest(
  input: SandboxManifestInput
): SandboxManifest {
  const executionLevel = resolveExecutionLevel(input)
  if (
    requiresProcessIsolation(executionLevel) &&
    input.platform.processIsolation === 'unavailable'
  ) {
    throw new SandboxPolicyError(
      'platform_isolation_required',
      'This capability requires OS process isolation'
    )
  }

  const canRead =
    input.capabilities.includes('filesystem.read') ||
    input.capabilities.includes('repository.read')
  const canWrite =
    input.capabilities.includes('filesystem.write') ||
    input.capabilities.includes('filesystem.delete') ||
    input.capabilities.includes('repository.modify')
  const networkTargets = input.connectorGrants
    .map(normalizeNetworkTarget)
    .sort((left, right) => left.service.localeCompare(right.service))
  const manifestWithoutDigest = {
    schemaVersion: 1 as const,
    executionId: input.executionId,
    executionLevel,
    enforcement: 'enforced' as const,
    platformIsolation: input.platform
      .processIsolation as Exclude<SandboxPlatformIsolation, 'unavailable'>,
    packageRoot: input.packageRoot,
    readOnlyRoots: uniqueSorted([
      input.packageRoot,
      ...(canRead && !canWrite ? input.scopeRoots : [])
    ]),
    readWriteRoots: canWrite ? uniqueSorted(input.scopeRoots) : [],
    environmentVariables:
      input.runtime === 'python'
        ? [
            'LANG',
            'LC_ALL',
            'PYTHONHASHSEED',
            ...(networkTargets.length > 0
              ? ['REALMFLOW_SKILL_CONNECTORS']
              : [])
          ]
        : [
            'LANG',
            'LC_ALL',
            ...(networkTargets.length > 0
              ? ['REALMFLOW_TOOL_CONNECTORS']
              : [])
          ],
    networkTargets,
    resources: { ...input.resources }
  }
  return {
    ...manifestWithoutDigest,
    policyDigest: createHash('sha256')
      .update(canonicalJson(manifestWithoutDigest))
      .digest('hex')
  }
}

function resolveExecutionLevel(
  input: Pick<SandboxManifestInput, 'capabilities' | 'effects' | 'risk'>
): SandboxExecutionLevel {
  if (
    input.capabilities.some((capability) =>
      [
        'credential.use',
        'computer.control',
        'clipboard.write'
      ].includes(capability)
    ) ||
    input.effects.some((effect) =>
      /^(?:external|remote)_data\.(?:write|delete)$/.test(effect)
    )
  ) {
    return 'external_side_effect'
  }
  if (
    input.capabilities.includes('network.connect') ||
    input.capabilities.includes('connector.use')
  ) {
    return 'controlled_network'
  }
  if (
    input.capabilities.some((capability) =>
      [
        'process.discover',
        'process.execute',
        'process.manage'
      ].includes(capability)
    )
  ) {
    return 'controlled_process'
  }
  if (
    input.capabilities.some((capability) =>
      capability.startsWith('filesystem.') ||
      capability.startsWith('repository.')
    )
  ) {
    return 'controlled_file'
  }
  return 'pure_function'
}

function requiresProcessIsolation(level: SandboxExecutionLevel): boolean {
  return (
    level === 'controlled_process' ||
    level === 'controlled_network' ||
    level === 'external_side_effect'
  )
}

function normalizeNetworkTarget(
  grant: SandboxManifestInput['connectorGrants'][number]
): SandboxManifest['networkTargets'][number] {
  let url: URL
  try {
    url = new URL(grant.url)
  } catch {
    throw invalidNetworkGrant()
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(grant.service) ||
    !grant.token ||
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `/v1/skills/connectors/${grant.service}`
  ) {
    throw invalidNetworkGrant()
  }
  return {
    service: grant.service,
    origin: url.origin,
    pathPrefix: url.pathname
  }
}

function invalidNetworkGrant(): SandboxPolicyError {
  return new SandboxPolicyError(
    'invalid_network_grant',
    'Sandbox network grant is invalid'
  )
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalJson(item)}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}
