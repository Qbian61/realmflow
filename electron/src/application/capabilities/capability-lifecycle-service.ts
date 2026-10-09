import {
  createCapabilityInstallation,
  transitionCapabilityLifecycle,
  type CapabilityDefinition,
  type CapabilityInstallation
} from '../../../../domain/capability'

type LifecycleEventType =
  | 'capability.enabled'
  | 'capability.disabled'
  | 'capability.upgraded'
  | 'capability.rolled_back'

type CapabilityLifecycleCatalog = {
  getInstallation: (
    installationId: string
  ) => Promise<CapabilityInstallation | undefined>
  getDefinition: (
    capabilityId: string,
    capabilityVersion: string
  ) => Promise<CapabilityDefinition | undefined>
  saveInstallation: (
    installation: CapabilityInstallation,
    expectedRevision: number,
    eventType: LifecycleEventType
  ) => Promise<void>
  deleteInstallation: (
    installationId: string,
    expectedRevision: number
  ) => Promise<
    | { status: 'deleted'; packageDigest?: string }
    | {
        status: 'referenced'
        references: Array<{
          ownerKind:
            | 'profile'
            | 'conversation'
            | 'workflow'
            | 'schedule'
            | 'run'
          ownerId: string
        }>
      }
  >
}

export class CapabilityLifecycleService {
  private readonly now: () => number

  constructor(
    private readonly options: {
      catalog: CapabilityLifecycleCatalog
      packages?: {
        removeManagedPackage: (packageDigest: string) => Promise<void>
      }
      now?: () => number
    }
  ) {
    this.now = options.now ?? Date.now
  }

  async setEnabled(input: {
    installationId: string
    enabled: boolean
    expectedRevision: number
  }): Promise<CapabilityInstallation> {
    const current = await this.requireInstallation(
      input.installationId,
      input.expectedRevision
    )
    const status = input.enabled ? 'enabled' : 'installed_disabled'
    transitionCapabilityLifecycle(current.status, status)
    const updated = createCapabilityInstallation({
      ...current,
      enabled: input.enabled,
      status,
      revision: current.revision + 1,
      updatedAt: this.now()
    })
    await this.options.catalog.saveInstallation(
      updated,
      input.expectedRevision,
      input.enabled ? 'capability.enabled' : 'capability.disabled'
    )
    return updated
  }

  async changeVersion(input: {
    installationId: string
    targetVersion: string
    expectedRevision: number
    operation: 'upgrade' | 'rollback'
  }): Promise<CapabilityInstallation> {
    const current = await this.requireInstallation(
      input.installationId,
      input.expectedRevision
    )
    if (
      current.status !== 'enabled' &&
      current.status !== 'installed_disabled'
    ) {
      throw new Error('Capability installation cannot change version')
    }
    const target = await this.options.catalog.getDefinition(
      current.capabilityId,
      input.targetVersion
    )
    if (!target) {
      throw new Error('Capability target version is unavailable')
    }
    const updated = createCapabilityInstallation({
      ...current,
      capabilityVersion: target.version,
      capabilityDigest: target.definitionDigest,
      revision: current.revision + 1,
      updatedAt: this.now()
    })
    await this.options.catalog.saveInstallation(
      updated,
      input.expectedRevision,
      input.operation === 'upgrade'
        ? 'capability.upgraded'
        : 'capability.rolled_back'
    )
    return updated
  }

  async delete(input: {
    installationId: string
    expectedRevision: number
  }) {
    await this.requireInstallation(
      input.installationId,
      input.expectedRevision
    )
    const result = await this.options.catalog.deleteInstallation(
      input.installationId,
      input.expectedRevision
    )
    if (result.status === 'deleted' && result.packageDigest) {
      await this.options.packages?.removeManagedPackage(
        result.packageDigest
      )
    }
    return result
  }

  private async requireInstallation(
    installationId: string,
    expectedRevision: number
  ): Promise<CapabilityInstallation> {
    const current =
      await this.options.catalog.getInstallation(installationId)
    if (!current) {
      throw new Error('Capability installation is unavailable')
    }
    if (current.revision !== expectedRevision) {
      throw new Error('Capability installation revision conflict')
    }
    return current
  }
}
