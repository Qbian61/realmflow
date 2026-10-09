import { randomUUID } from 'node:crypto'
import {
  createCapabilityInstallation,
  type CapabilityDefinition,
  type CapabilityInstallation,
  type CapabilityPermissionDeclaration,
  type CapabilityScope
} from '../../../../domain/capability'
import type { PreparedCapabilityPackage } from './capability-package-service'

type CapabilityAtomicInstallerOptions = {
  catalog: {
    publishAndInstall: (
      definition: CapabilityDefinition,
      installation: CapabilityInstallation,
      packageDigest: string,
      onTransaction?: () => void
    ) => Promise<void>
  }
  createId?: () => string
  now?: () => number
}

export class CapabilityAtomicInstaller {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(private readonly options: CapabilityAtomicInstallerOptions) {
    this.createId = options.createId ?? randomUUID
    this.now = options.now ?? Date.now
  }

  async install(input: {
    prepared: PreparedCapabilityPackage
    scope: CapabilityScope
    enable?: boolean
    permissionCeiling?: CapabilityPermissionDeclaration
    onCatalogTransaction?: (result: {
      definition: CapabilityDefinition
      installation: CapabilityInstallation
    }) => void
  }): Promise<{
    definition: CapabilityDefinition
    installation: CapabilityInstallation
  }> {
    const enabled = input.enable ?? false
    const now = this.now()
    const installation = createCapabilityInstallation({
      id: this.createId(),
      capabilityId: input.prepared.definition.id,
      capabilityVersion: input.prepared.definition.version,
      capabilityDigest: input.prepared.definition.definitionDigest,
      scope: input.scope,
      enabled,
      permissionCeiling:
        input.permissionCeiling ?? input.prepared.definition.permissions,
      status: enabled ? 'enabled' : 'installed_disabled',
      revision: 1,
      installedAt: now,
      updatedAt: now
    })
    try {
      await input.prepared.pending.commit()
      const argumentsForCatalog = [
        input.prepared.definition,
        installation,
        input.prepared.packageDigest
      ] as const
      if (input.onCatalogTransaction) {
        await this.options.catalog.publishAndInstall(
          ...argumentsForCatalog,
          () =>
            input.onCatalogTransaction?.({
              definition: input.prepared.definition,
              installation
            })
        )
      } else {
        await this.options.catalog.publishAndInstall(
          ...argumentsForCatalog
        )
      }
    } catch (error) {
      await input.prepared.pending.rollback()
      throw error
    }
    return {
      definition: input.prepared.definition,
      installation
    }
  }
}
