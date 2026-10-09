import { createHash } from 'node:crypto'
import type {
  CapabilityDefinition,
  CapabilityInstallation
} from '../../../../domain/capability'
import {
  normalizeToolDefinition,
  type ToolDefinition
} from '../../../../domain/tool-definition'

export function projectConnectorTools(input: {
  definition: CapabilityDefinition
  installation: CapabilityInstallation
}): ToolDefinition[] {
  const { definition, installation } = input
  if (
    definition.kind !== 'connector' ||
    definition.runtime.kind !== 'connector'
  ) {
    return []
  }
  const runtime = definition.runtime
  if (
    installation.capabilityId !== definition.id ||
    installation.capabilityVersion !== definition.version ||
    installation.capabilityDigest !== definition.definitionDigest ||
    !installation.enabled ||
    installation.status !== 'enabled'
  ) {
    throw new Error('Connector capability installation is unavailable')
  }
  return runtime.actions.map((action) => {
    if (action.protocol.kind !== runtime.connectorKind) {
      throw new Error(
        'Connector action protocol does not match Connector kind'
      )
    }
    const projected = {
      schemaVersion: 1 as const,
      id: `${definition.id}.${action.id}`,
      version: definition.version,
      package: {
        packageId: definition.id,
        packageVersion: definition.version,
        packageDigest: definition.manifestDigest
      },
      origin:
        definition.source === 'mcp'
          ? ('mcp' as const)
          : ('local_upload' as const),
      name: action.name,
      description: action.description,
      tags: ['connector', runtime.connectorKind],
      executor: {
        kind: 'connector' as const,
        capabilityId: definition.id,
        capabilityVersion: definition.version,
        capabilityDigest: definition.definitionDigest,
        actionId: action.id
      },
      inputSchema: structuredClone(action.inputSchema),
      outputSchema: structuredClone(action.outputSchema),
      capabilities: [...installation.permissionCeiling.capabilities],
      effects: [...action.effects],
      risk: action.risk,
      invocation: {
        mode: 'unary' as const,
        idempotency:
          action.operation === 'write'
            ? ('required' as const)
            : ('none' as const),
        cancellable: true,
        resumable: false
      },
      resources: {
        timeoutMs: action.timeoutMs,
        maxOutputBytes: action.maxOutputBytes,
        maxAttempts: 1
      },
      discovery: {
        intents: [action.name, action.description].filter(Boolean),
        contexts: ['general', 'space', 'requirement', 'workflow'] as const
      }
    }
    const normalized = normalizeToolDefinition({
      ...projected,
      definitionDigest: digest(projected)
    })
    return deepFreeze(normalized)
  })
}

function digest(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
