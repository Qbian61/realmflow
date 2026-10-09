import { randomUUID } from 'node:crypto'
import type {
  CapabilityImportProposalDto,
  InstallCapabilityPackageCommand,
  InstalledCapabilityDto
} from '../../../../shared/capability-catalog'
import type { CapabilityAtomicInstaller } from './capability-atomic-installer'
import type {
  CapabilityPackageService,
  PreparedCapabilityPackage
} from './capability-package-service'

type CapabilityImportCoordinatorOptions = {
  packages: Pick<CapabilityPackageService, 'prepare'>
  installer: Pick<CapabilityAtomicInstaller, 'install'>
  createId?: () => string
}

export class CapabilityImportCoordinator {
  private readonly proposals = new Map<string, PreparedCapabilityPackage>()
  private readonly createId: () => string

  constructor(private readonly options: CapabilityImportCoordinatorOptions) {
    this.createId = options.createId ?? randomUUID
  }

  async prepare(sourcePath: string): Promise<CapabilityImportProposalDto> {
    const prepared = await this.options.packages.prepare(sourcePath)
    const proposalId = this.createId()
    this.proposals.set(proposalId, prepared)
    return {
      proposalId,
      definition: prepared.definition,
      packageDigest: prepared.packageDigest,
      source: prepared.source,
      byteSize: prepared.byteSize,
      fileCount: prepared.fileCount,
      validationReport: prepared.validationReport
    }
  }

  async install(
    command: InstallCapabilityPackageCommand
  ): Promise<InstalledCapabilityDto> {
    const prepared = this.proposals.get(command.proposalId)
    if (!prepared) {
      throw new Error('Capability import proposal is unavailable')
    }
    const installed = await this.options.installer.install({
      prepared,
      scope: command.scope,
      enable: command.enable,
      permissionCeiling: command.permissionCeiling
    })
    this.proposals.delete(command.proposalId)
    return installed
  }

  async discard(proposalId: string): Promise<void> {
    const prepared = this.proposals.get(proposalId)
    if (!prepared) return
    await prepared.pending.rollback()
    this.proposals.delete(proposalId)
  }
}
