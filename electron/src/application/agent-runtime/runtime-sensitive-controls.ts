import { createHash } from 'node:crypto'
import type { CapabilityDefinition, CapabilityInstallation } from '../../../../domain/capability'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'

type SensitiveControlContext = { runId: string; requestId: string }

export class RuntimeSensitiveControls {
  constructor(private readonly dependencies: {
    credentials: {
      resolveHandle(name: string, service?: string): Promise<string | undefined>
    }
    catalog: {
      listDefinitions(): Promise<CapabilityDefinition[]>
      listInstallations(): Promise<CapabilityInstallation[]>
    }
  }) {}

  async secret(input: JsonObject): Promise<JsonObject> {
    const action = input.action
    const name = input.name
    const service = typeof input.service === 'string' ? input.service : 'model'
    if (!['request', 'resolve'].includes(String(action)) || typeof name !== 'string' ||
        !name.trim() || name.length > 160 || !service.trim() || service.length > 160) {
      throw new Error('runtime_secret_command_invalid')
    }
    const handle = await this.dependencies.credentials.resolveHandle(name, service)
    return handle
      ? { status: 'available', handle, service }
      : { status: 'user_input_required', name, service, nextAction: 'configure_credential' }
  }

  async capability(input: JsonObject, context: SensitiveControlContext): Promise<JsonObject> {
    const action = input.action
    if (action === 'search' || action === 'inspect') {
      return this.readCapability(input, action)
    }
    if (!['install', 'enable', 'disable', 'upgrade', 'rollback'].includes(String(action))) {
      throw new Error('runtime_capability_command_invalid')
    }
    assertMutationInput(input, action as string)
    const proposalId = `runtime-capability-${createHash('sha256')
      .update(JSON.stringify({ context, input }, sortedJson))
      .digest('hex').slice(0, 24)}`
    return {
      status: 'approval_required',
      proposalId,
      action,
      approvalSurface: 'capabilities',
      message: 'Review and approve this change in Capabilities.'
    }
  }

  private async readCapability(input: JsonObject, action: 'search' | 'inspect'): Promise<JsonObject> {
    const [definitions, installations] = await Promise.all([
      this.dependencies.catalog.listDefinitions(),
      this.dependencies.catalog.listInstallations()
    ])
    const query = typeof input.query === 'string' ? input.query.trim().toLocaleLowerCase() : ''
    const capabilityId = typeof input.capabilityId === 'string' ? input.capabilityId : undefined
    const limit = typeof input.limit === 'number' && Number.isSafeInteger(input.limit)
      ? Math.min(50, Math.max(1, input.limit)) : 20
    const projected = definitions
      .filter((definition) => action === 'inspect'
        ? definition.id === capabilityId
        : !query || `${definition.id} ${definition.name} ${definition.description}`.toLocaleLowerCase().includes(query))
      .slice(0, action === 'inspect' ? 1 : limit)
      .map((definition) => projectCapability(definition,
        installations.find((item) => item.capabilityId === definition.id &&
          item.capabilityVersion === definition.version)))
    if (action === 'inspect') {
      if (!projected[0]) throw new Error('runtime_capability_unavailable')
      return { status: 'completed', capability: projected[0] }
    }
    return { status: 'completed', capabilities: projected, total: projected.length }
  }
}

function projectCapability(
  definition: CapabilityDefinition,
  installation?: CapabilityInstallation
): JsonObject {
  return {
    capabilityId: definition.id,
    version: definition.version,
    kind: definition.kind,
    name: definition.name,
    description: definition.description,
    source: definition.source,
    ...(installation ? {
      installationId: installation.id,
      installationStatus: installation.status,
      enabled: installation.enabled,
      revision: installation.revision
    } : {})
  }
}

function assertMutationInput(input: JsonObject, action: string): void {
  if (action === 'install') {
    if (typeof input.proposalId !== 'string' || !input.proposalId.trim()) {
      throw new Error('runtime_capability_command_invalid')
    }
    return
  }
  if (typeof input.installationId !== 'string' || !input.installationId.trim() ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1 ||
      (['upgrade', 'rollback'].includes(action) &&
        (typeof input.targetVersion !== 'string' || !input.targetVersion.trim()))) {
    throw new Error('runtime_capability_command_invalid')
  }
}

function sortedJson(_key: string, value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value
}
