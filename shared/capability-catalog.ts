import type {
  CapabilityDefinition,
  CapabilityInstallation,
  CapabilityPermissionDeclaration,
  CapabilityScope
} from '../domain/capability'
import type {
  CapabilityGenerationSession,
  CapabilitySpecSource
} from '../domain/capability-builder'
import type {
  CapabilityLocale,
  LocalizedCapabilityDisplay
} from './capability-localization'

export type CapabilityPackageSourceType = 'directory' | 'archive'

export type CapabilityImportProposalDto = {
  proposalId: string
  definition: CapabilityDefinition
  packageDigest: string
  source: {
    type: CapabilityPackageSourceType
    displayName: string
  }
  byteSize: number
  fileCount: number
  validationReport: {
    compatible: true
    dependencyStatus: 'resolved'
    tests: Array<{
      id: string
      status: 'passed'
      detail?: string
    }>
  }
}

export type ChooseCapabilityPackageCommand = {
  sourceType: CapabilityPackageSourceType
}

export type InstallCapabilityPackageCommand = {
  proposalId: string
  scope: CapabilityScope
  enable: boolean
  permissionCeiling?: CapabilityPermissionDeclaration
}

export type InstalledCapabilityDto = {
  definition: CapabilityDefinition
  installation: CapabilityInstallation
}

export type CapabilityCatalogSnapshotDto = {
  definitions: CapabilityDefinition[]
  installations: CapabilityInstallation[]
  displayByDefinitionKey?: Record<string, LocalizedCapabilityDisplay>
}

export type SetCapabilityEnabledCommand = {
  installationId: string
  enabled: boolean
  expectedRevision: number
}

export type ChangeCapabilityVersionCommand = {
  installationId: string
  targetVersion: string
  expectedRevision: number
  operation: 'upgrade' | 'rollback'
}

export type DeleteCapabilityCommand = {
  installationId: string
  expectedRevision: number
}

export type DeleteCapabilityResult =
  | { status: 'deleted'; packageDigest?: string }
  | {
      status: 'referenced'
      references: Array<{
        ownerKind: 'profile' | 'conversation' | 'workflow' | 'schedule' | 'run'
        ownerId: string
      }>
    }

export interface CapabilityCatalogApi {
  list: (query: {
    locale: CapabilityLocale
  }) => Promise<CapabilityCatalogSnapshotDto>
  chooseAndPrepare: (
    command: ChooseCapabilityPackageCommand
  ) => Promise<CapabilityImportProposalDto | null>
  install: (
    command: InstallCapabilityPackageCommand
  ) => Promise<InstalledCapabilityDto>
  discard: (proposalId: string) => Promise<void>
  setEnabled: (
    command: SetCapabilityEnabledCommand
  ) => Promise<CapabilityInstallation>
  changeVersion: (
    command: ChangeCapabilityVersionCommand
  ) => Promise<CapabilityInstallation>
  delete: (
    command: DeleteCapabilityCommand
  ) => Promise<DeleteCapabilityResult>
}

export type CreateCapabilityDraftCommand = {
  request: string
  spec: CapabilitySpecSource
}

export type ReviseCapabilityDraftCommand = {
  sessionId: string
  expectedRevision: number
  request: string
  spec: CapabilitySpecSource
}

export type ConfirmCapabilityInstallCommand = {
  sessionId: string
  proposalId: string
  revision: number
  packageDigest: string
  scope: CapabilityScope
  enable: boolean
}

export type CancelCapabilityGenerationCommand = {
  sessionId: string
  expectedRevision: number
}

export interface CapabilityBuilderApi {
  createDraft: (
    command: CreateCapabilityDraftCommand
  ) => Promise<CapabilityGenerationSession>
  getSession: (sessionId: string) => Promise<CapabilityGenerationSession>
  reviseDraft: (
    command: ReviseCapabilityDraftCommand
  ) => Promise<CapabilityGenerationSession>
  confirmInstall: (
    command: ConfirmCapabilityInstallCommand
  ) => Promise<InstalledCapabilityDto>
  cancel: (
    command: CancelCapabilityGenerationCommand
  ) => Promise<CapabilityGenerationSession>
}
