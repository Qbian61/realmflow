import type {
  ExtensionPackageCatalogItem,
  SkillCatalogItem,
  ToolCatalogItem,
  ToolCatalogState,
  ToolModelFacingMode
} from '../domain/tool-catalog'
import type {
  CapabilityLocale,
  LocalizedCapabilityDisplay
} from './capability-localization'

export type ToolCatalogPackageDto = ExtensionPackageCatalogItem & {
  display?: LocalizedCapabilityDisplay
}
export type ToolCatalogToolDto = ToolCatalogItem & {
  display?: LocalizedCapabilityDisplay
}
export type ToolCatalogSkillDto = SkillCatalogItem & {
  display?: LocalizedCapabilityDisplay
}
export type ToolCatalogDto = Omit<
  ToolCatalogState,
  'packages' | 'tools' | 'skills'
> & {
  packages: ToolCatalogPackageDto[]
  tools: ToolCatalogToolDto[]
  skills: ToolCatalogSkillDto[]
}
export type ToolCatalogTargetType = 'package' | 'tool' | 'skill'
export type ToolCatalogSourceType = 'directory' | 'archive'
export type { ToolModelFacingMode }

export type ToolCatalogListQuery = {
  locale: CapabilityLocale
  modelFacingMode?: ToolModelFacingMode
}

export type ToolCatalogActivationCommand = {
  targetType: ToolCatalogTargetType
  targetId: string
  enabled: boolean
  idempotencyKey: string
}

export type ToolCatalogActivationResult =
  | {
      targetType: 'package'
      item: ToolCatalogPackageDto
    }
  | {
      targetType: 'tool'
      item: ToolCatalogToolDto
    }
  | {
      targetType: 'skill'
      item: ToolCatalogSkillDto
    }

export type ChooseExtensionPackageCommand = {
  sourceType: ToolCatalogSourceType
  idempotencyKey: string
}

export type ImportedExtensionCatalogDto = {
  package: ToolCatalogPackageDto
  tools: ToolCatalogToolDto[]
  skills: ToolCatalogSkillDto[]
}

export type McpServerTransportDto =
  | {
      kind: 'stdio'
      command: string
      arguments: string[]
      credentialNames: string[]
    }
  | {
      kind: 'streamable_http'
      url: string
      credentialNames: string[]
    }

export type McpServerDto = {
  id: string
  name: string
  identity: string
  enabled: boolean
  transport: McpServerTransportDto
  revision: number
  hasCredentials: Record<string, boolean>
  validation?: {
    status: 'available' | 'unavailable'
    message: string
    checkedAt: number
  }
}

export type SaveMcpServerCommandDto = {
  id: string
  name: string
  enabled: boolean
  transport: McpServerTransportDto
  credentialValues: Record<string, string>
  expectedRevision: number
  idempotencyKey: string
}

export type DeleteMcpServerCommandDto = {
  id: string
  expectedRevision: number
  idempotencyKey: string
}

export interface ToolCatalogApi {
  list: (query: ToolCatalogListQuery) => Promise<ToolCatalogDto>
  chooseAndImport: (
    command: ChooseExtensionPackageCommand
  ) => Promise<ImportedExtensionCatalogDto | null>
  setActivation: (
    command: ToolCatalogActivationCommand
  ) => Promise<ToolCatalogActivationResult>
  listMcpServers: () => Promise<McpServerDto[]>
  saveMcpServer: (command: SaveMcpServerCommandDto) => Promise<McpServerDto>
  deleteMcpServer: (
    command: DeleteMcpServerCommandDto
  ) => Promise<{ id: string }>
  testMcpServer: (command: {
    id: string
    expectedRevision: number
  }) => Promise<McpServerDto>
  discoverMcpServer: (command: {
    id: string
    idempotencyKey: string
  }) => Promise<void>
}
