import type { IpcMain } from 'electron'
import {
  normalizeStringArray,
  requireBoolean,
  requireEnum,
  requireExactKeys,
  requireIdentifier,
  requireInteger,
  requireObject,
  requireText
} from '../../../domain/tool-protocol-validation'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import type {
  ChooseExtensionPackageCommand,
  ChangeExtensionPackageVersionCommand,
  McpServerDto,
  SaveMcpServerCommandDto,
  ToolCatalogActivationCommand,
  ToolModelFacingMode
} from '../../../shared/tool-catalog'
import {
  localizeCapability,
  type CapabilityLocale
} from '../../../shared/capability-localization'
import type { ExtensionCatalogImportService } from '../application/tools/extension-catalog-import-service'
import type { ToolCatalogService } from '../application/tools/tool-catalog-service'
import type { McpServerService } from '../application/tools/mcp-server-service'
import type { McpServerRecord } from '../application/tools/mcp-server-store'
import { requireNoIpcPayload } from './runtime-validation'
import type { ToolPolicyConfigurationService } from '../application/tools/tool-policy-configuration-service'

type RegisterToolCatalogIpcOptions = {
  policy?: Pick<ToolPolicyConfigurationService, 'get' | 'save' | 'preview'>
  catalog: Pick<
    ToolCatalogService,
    'list' | 'setActivation' | 'changePackageVersion'
  >
  importer: Pick<ExtensionCatalogImportService, 'importFromPath'>
  mcpServers: Pick<
    McpServerService,
    'list' | 'save' | 'delete' | 'testConnection' | 'discover'
  >
  onCatalogChanged?: () => Promise<void>
  ipcMain: Pick<IpcMain, 'handle'>
  dialog: {
    showOpenDialog: (options: {
      properties: Array<'openFile' | 'openDirectory'>
      filters?: Array<{ name: string; extensions: string[] }>
    }) => Promise<{ canceled: boolean; filePaths: string[] }>
  }
}

export function registerToolCatalogIpc({
  policy,
  catalog,
  importer,
  mcpServers,
  onCatalogChanged,
  ipcMain,
  dialog
}: RegisterToolCatalogIpcOptions): void {
  ipcMain.handle(IPC_QUERY_CHANNELS.toolPolicyGet, async (_event, query) => {
    if (!policy) throw new Error('Tool policy service unavailable')
    return policy.get(query)
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.toolPolicyPreview, async (_event, query) => {
    if (!policy) throw new Error('Tool policy service unavailable')
    return policy.preview(query)
  })
  ipcMain.handle(IPC_COMMAND_CHANNELS.toolPolicySave, async (_event, command) => {
    if (!policy) throw new Error('Tool policy service unavailable')
    return policy.save(command)
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.toolCatalogList, async (_event, value) => {
    const { locale, modelFacingMode } = requireCatalogLocaleQuery(value)
    const state = await catalog.list({ modelFacingMode })
    return {
      packages: state.packages.map((item) => ({
        ...item,
        display: localizeCapability(
          item.packageId,
          { name: item.name, description: item.description },
          item.origin,
          locale
        )
      })),
      tools: state.tools.map((item) => ({
        ...item,
        display:
          item.modelFacing?.kind === 'facade'
            ? {
                name: item.definition.name,
                description: item.definition.description,
                requestedLocale: locale,
                resolvedLocale: 'canonical'
              }
            : localizeCapability(
                item.id,
                {
                  name: item.definition.name,
                  description: item.definition.description
                },
                item.definition.origin,
                locale
              )
      })),
      skills: state.skills.map((item) => ({
        ...item,
        display: localizeCapability(
          item.id,
          {
            name: item.definition.name,
            description: item.definition.description
          },
          item.definition.origin,
          locale
        )
      }))
    }
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.mcpServerList, async (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.mcpServerList)
    return (await mcpServers.list()).map(toMcpServerDto)
  })
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.toolCatalogChooseAndImport,
    async (_event, value) => {
      const command = requireChooseExtensionPackageCommand(value)
      const result = await dialog.showOpenDialog(
        command.sourceType === 'archive'
          ? {
              properties: ['openFile'],
              filters: [
                { name: 'Extension package', extensions: ['zip'] }
              ]
            }
          : { properties: ['openDirectory'] }
      )
      if (result.canceled || !result.filePaths[0]) return null
      const imported = await importer.importFromPath({
        sourcePath: result.filePaths[0],
        idempotencyKey: command.idempotencyKey
      })
      await onCatalogChanged?.()
      return imported
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.toolCatalogSetActivation,
    async (_event, value) => {
      const result = await catalog.setActivation(
        requireActivationCommand(value)
      )
      await onCatalogChanged?.()
      return result
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.toolCatalogChangePackageVersion,
    async (_event, value) => {
      const result = await catalog.changePackageVersion(
        requirePackageVersionCommand(value)
      )
      await onCatalogChanged?.()
      return result
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.mcpServerSave,
    async (_event, value) => {
      const result = toMcpServerDto(
        await mcpServers.save(requireMcpSaveCommand(value))
      )
      await onCatalogChanged?.()
      return result
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.mcpServerDelete,
    async (_event, value) => {
      const result = await mcpServers.delete(requireMcpDeleteCommand(value))
      await onCatalogChanged?.()
      return result
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.mcpServerTest,
    async (_event, value) => {
      const result = toMcpServerDto(
        await mcpServers.testConnection(requireMcpTestCommand(value))
      )
      await onCatalogChanged?.()
      return result
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.mcpServerDiscover,
    async (_event, value) => {
      await mcpServers.discover(requireMcpDiscoverCommand(value))
      await onCatalogChanged?.()
    }
  )
}

function requireCatalogLocaleQuery(value: unknown): {
  locale: CapabilityLocale
  modelFacingMode?: ToolModelFacingMode
} {
  const query = requireObject(value, 'Tool Catalog locale query')
  requireExactKeys(
    query,
    new Set(['locale', 'modelFacingMode']),
    'Tool Catalog locale query',
    new Set(['modelFacingMode'])
  )
  return {
    locale: requireEnum(
      query.locale,
      new Set<CapabilityLocale>(['zh-CN', 'en', 'ja']),
      'Tool Catalog locale'
    ),
    ...(query.modelFacingMode === undefined
      ? {}
      : {
          modelFacingMode: requireEnum(
            query.modelFacingMode,
            new Set<ToolModelFacingMode>(['direct', 'facade', 'directory']),
            'Tool Catalog model-facing mode'
          )
        })
  }
}

function requireChooseExtensionPackageCommand(
  value: unknown
): ChooseExtensionPackageCommand {
  const command = requireObject(value, 'Extension import command')
  requireExactKeys(
    command,
    new Set(['sourceType', 'idempotencyKey']),
    'Extension import command'
  )
  return {
    sourceType: requireEnum(
      command.sourceType,
      new Set(['directory', 'archive'] as const),
      'Extension source type'
    ),
    idempotencyKey: requireIdempotencyKey(command.idempotencyKey)
  }
}

function requireActivationCommand(
  value: unknown
): ToolCatalogActivationCommand {
  const command = requireObject(value, 'Tool Catalog activation command')
  requireExactKeys(
    command,
    new Set(['targetType', 'targetId', 'enabled', 'idempotencyKey']),
    'Tool Catalog activation command'
  )
  return {
    targetType: requireEnum(
      command.targetType,
      new Set(['package', 'tool', 'skill'] as const),
      'Tool Catalog target type'
    ),
    targetId: requireIdentifier(
      command.targetId,
      'Tool Catalog target ID'
    ),
    enabled: requireBoolean(command.enabled, 'Tool Catalog activation'),
    idempotencyKey: requireIdempotencyKey(command.idempotencyKey)
  }
}

function requirePackageVersionCommand(
  value: unknown
): ChangeExtensionPackageVersionCommand {
  const command = requireObject(value, 'Tool Catalog package version command')
  requireExactKeys(
    command,
    new Set([
      'packageId',
      'targetVersion',
      'operation',
      'idempotencyKey'
    ]),
    'Tool Catalog package version command'
  )
  return {
    packageId: requireIdentifier(
      command.packageId,
      'Tool Catalog package ID'
    ),
    targetVersion: requireText(
      command.targetVersion,
      'Tool Catalog target version'
    ),
    operation: requireEnum(
      command.operation,
      new Set(['upgrade', 'rollback'] as const),
      'Tool Catalog package version operation'
    ),
    idempotencyKey: requireIdempotencyKey(command.idempotencyKey)
  }
}

function requireIdempotencyKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
  ) {
    throw new Error('Tool Catalog idempotency key is invalid')
  }
  return value
}

function requireMcpSaveCommand(value: unknown): SaveMcpServerCommandDto {
  const command = requireObject(value, 'MCP Server save command')
  requireExactKeys(
    command,
    new Set([
      'id',
      'name',
      'enabled',
      'transport',
      'credentialValues',
      'expectedRevision',
      'idempotencyKey'
    ]),
    'MCP Server save command'
  )
  const transport = requireObject(command.transport, 'MCP transport draft')
  const kind = requireEnum(
    transport.kind,
    new Set(['stdio', 'streamable_http'] as const),
    'MCP transport kind'
  )
  const credentialNames = normalizeStringArray(
    transport.credentialNames,
    'MCP credential names'
  )
  const credentialValues = requireObject(
    command.credentialValues,
    'MCP credential values'
  )
  for (const value of Object.values(credentialValues)) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
      throw new Error('MCP credential value is invalid')
    }
  }
  const normalizedTransport =
    kind === 'stdio'
      ? requireStdioTransport(transport, credentialNames)
      : requireHttpTransport(transport, credentialNames)
  return {
    id: requireIdentifier(command.id, 'MCP Server ID'),
    name: requireText(command.name, 'MCP Server name'),
    enabled: requireBoolean(command.enabled, 'MCP Server enabled'),
    transport: normalizedTransport,
    credentialValues: credentialValues as Record<string, string>,
    expectedRevision: requireInteger(
      command.expectedRevision,
      'MCP Server revision',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    idempotencyKey: requireIdempotencyKey(command.idempotencyKey)
  }
}

function requireStdioTransport(
  transport: Record<string, unknown>,
  credentialNames: string[]
): Extract<SaveMcpServerCommandDto['transport'], { kind: 'stdio' }> {
  requireExactKeys(
    transport,
    new Set(['kind', 'command', 'arguments', 'credentialNames']),
    'MCP stdio transport draft'
  )
  if (!Array.isArray(transport.arguments)) {
    throw new Error('MCP stdio arguments are invalid')
  }
  const arguments_ = transport.arguments.map((value) => {
    if (typeof value !== 'string' || value.includes('\0')) {
      throw new Error('MCP stdio argument is invalid')
    }
    return value
  })
  return {
    kind: 'stdio',
    command: requireText(transport.command, 'MCP stdio command'),
    arguments: arguments_,
    credentialNames
  }
}

function requireHttpTransport(
  transport: Record<string, unknown>,
  credentialNames: string[]
): Extract<
  SaveMcpServerCommandDto['transport'],
  { kind: 'streamable_http' }
> {
  requireExactKeys(
    transport,
    new Set(['kind', 'url', 'credentialNames']),
    'MCP HTTP transport draft'
  )
  return {
    kind: 'streamable_http',
    url: requireText(transport.url, 'MCP Server URL'),
    credentialNames
  }
}

function requireMcpDeleteCommand(value: unknown) {
  const command = requireMcpRevisionCommand(
    value,
    'MCP Server delete command',
    true
  )
  return {
    ...command,
    idempotencyKey: requireIdempotencyKey(command.idempotencyKey)
  }
}

function requireMcpTestCommand(value: unknown) {
  return requireMcpRevisionCommand(value, 'MCP Server test command', false)
}

function requireMcpRevisionCommand(
  value: unknown,
  field: string,
  withIdempotencyKey: boolean
): { id: string; expectedRevision: number; idempotencyKey?: unknown } {
  const command = requireObject(value, field)
  requireExactKeys(
    command,
    new Set([
      'id',
      'expectedRevision',
      ...(withIdempotencyKey ? ['idempotencyKey'] : [])
    ]),
    field
  )
  return {
    id: requireIdentifier(command.id, 'MCP Server ID'),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'MCP Server revision',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    ...(withIdempotencyKey
      ? { idempotencyKey: command.idempotencyKey }
      : {})
  }
}

function requireMcpDiscoverCommand(value: unknown) {
  const command = requireObject(value, 'MCP Server discover command')
  requireExactKeys(
    command,
    new Set(['id', 'idempotencyKey']),
    'MCP Server discover command'
  )
  return {
    id: requireIdentifier(command.id, 'MCP Server ID'),
    idempotencyKey: requireIdempotencyKey(command.idempotencyKey)
  }
}

function toMcpServerDto(record: McpServerRecord): McpServerDto {
  const transport = record.configuration.transport
  return {
    id: record.configuration.id,
    name: record.configuration.name,
    identity: record.configuration.identity,
    enabled: record.configuration.enabled,
    transport:
      transport.kind === 'stdio'
        ? {
            kind: 'stdio',
            command: transport.command,
            arguments: [...transport.arguments],
            credentialNames: Object.keys(
              transport.environmentCredentialIds
            ).sort()
          }
        : {
            kind: 'streamable_http',
            url: transport.url,
            credentialNames: Object.keys(
              transport.headerCredentialIds
            ).sort()
          },
    revision: record.revision,
    hasCredentials: { ...record.hasCredentials },
    ...(record.validation ? { validation: { ...record.validation } } : {})
  }
}
