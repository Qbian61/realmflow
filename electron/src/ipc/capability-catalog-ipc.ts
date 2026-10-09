import type { IpcMain } from 'electron'
import {
  requireBoolean,
  requireEnum,
  requireExactKeys,
  requireIdentifier,
  requireInteger,
  requireObject,
  requireText
} from '../../../domain/tool-protocol-validation'
import type {
  CapabilityPermissionDeclaration,
  CapabilityScope
} from '../../../domain/capability'
import {
  localizeCapability,
  type CapabilityLocale
} from '../../../shared/capability-localization'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import type { CapabilityImportCoordinator } from '../application/capabilities/capability-import-coordinator'
import type { CapabilityLifecycleService } from '../application/capabilities/capability-lifecycle-service'
import type { SqliteCapabilityCatalogRepository } from '../infrastructure/sqlite/capability-catalog-repository'

type RegisterCapabilityCatalogIpcOptions = {
  catalog: Pick<
    SqliteCapabilityCatalogRepository,
    'listDefinitions' | 'listInstallations'
  >
  importer: Pick<CapabilityImportCoordinator, 'prepare' | 'install' | 'discard'>
  lifecycle: Pick<
    CapabilityLifecycleService,
    'setEnabled' | 'changeVersion' | 'delete'
  >
  ipcMain: Pick<IpcMain, 'handle'>
  dialog: {
    showOpenDialog: (options: {
      properties: Array<'openFile' | 'openDirectory'>
      filters?: Array<{ name: string; extensions: string[] }>
    }) => Promise<{ canceled: boolean; filePaths: string[] }>
  }
}

export function registerCapabilityCatalogIpc({
  catalog,
  importer,
  lifecycle,
  ipcMain,
  dialog
}: RegisterCapabilityCatalogIpcOptions): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.capabilityCatalogList,
    async (_event, value) => {
      const { locale } = requireCatalogLocaleQuery(value)
      const definitions = await catalog.listDefinitions()
      return {
        definitions,
        installations: await catalog.listInstallations(),
        displayByDefinitionKey: Object.fromEntries(
          definitions.map((definition) => [
            `${definition.id}@${definition.version}`,
            localizeCapability(
              definition.id,
              {
                name: definition.name,
                description: definition.description
              },
              definition.source,
              locale
            )
          ])
        )
      }
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityPackageChooseAndPrepare,
    async (_event, value) => {
      const command = requireChooseCommand(value)
      const result = await dialog.showOpenDialog(
        command.sourceType === 'archive'
          ? {
              properties: ['openFile'],
              filters: [{ name: 'Capability package', extensions: ['zip'] }]
            }
          : { properties: ['openDirectory'] }
      )
      if (result.canceled || !result.filePaths[0]) return null
      return importer.prepare(result.filePaths[0])
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityPackageInstall,
    (_event, value) => importer.install(requireInstallCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityPackageDiscard,
    (_event, value) =>
      importer.discard(
        requireIdentifier(value, 'Capability proposal ID')
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilitySetEnabled,
    (_event, value) => lifecycle.setEnabled(requireSetEnabledCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityChangeVersion,
    (_event, value) =>
      lifecycle.changeVersion(requireChangeVersionCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityDelete,
    (_event, value) => lifecycle.delete(requireDeleteCommand(value))
  )
}

function requireCatalogLocaleQuery(value: unknown): {
  locale: CapabilityLocale
} {
  const query = requireObject(value, 'Capability Catalog locale query')
  requireExactKeys(
    query,
    new Set(['locale']),
    'Capability Catalog locale query'
  )
  return {
    locale: requireEnum(
      query.locale,
      new Set<CapabilityLocale>(['zh-CN', 'en', 'ja']),
      'Capability Catalog locale'
    )
  }
}

function requireSetEnabledCommand(value: unknown) {
  const command = requireObject(value, 'Capability activation command')
  requireExactKeys(
    command,
    new Set(['installationId', 'enabled', 'expectedRevision']),
    'Capability activation command'
  )
  return {
    installationId: requireIdentifier(
      command.installationId,
      'Capability installation ID'
    ),
    enabled: requireBoolean(command.enabled, 'Capability enabled'),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'Capability revision',
      1,
      Number.MAX_SAFE_INTEGER
    )
  }
}

function requireChangeVersionCommand(value: unknown) {
  const command = requireObject(value, 'Capability version command')
  requireExactKeys(
    command,
    new Set([
      'installationId',
      'targetVersion',
      'expectedRevision',
      'operation'
    ]),
    'Capability version command'
  )
  return {
    installationId: requireIdentifier(
      command.installationId,
      'Capability installation ID'
    ),
    targetVersion: requireText(
      command.targetVersion,
      'Capability target version'
    ),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'Capability revision',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    operation: requireEnum(
      command.operation,
      new Set(['upgrade', 'rollback'] as const),
      'Capability version operation'
    )
  }
}

function requireDeleteCommand(value: unknown) {
  const command = requireObject(value, 'Capability delete command')
  requireExactKeys(
    command,
    new Set(['installationId', 'expectedRevision']),
    'Capability delete command'
  )
  return {
    installationId: requireIdentifier(
      command.installationId,
      'Capability installation ID'
    ),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'Capability revision',
      1,
      Number.MAX_SAFE_INTEGER
    )
  }
}

function requireChooseCommand(value: unknown): {
  sourceType: 'directory' | 'archive'
} {
  const command = requireObject(value, 'Capability choose command')
  requireExactKeys(
    command,
    new Set(['sourceType']),
    'Capability choose command'
  )
  return {
    sourceType: requireEnum(
      command.sourceType,
      new Set(['directory', 'archive'] as const),
      'Capability package source type'
    )
  }
}

function requireInstallCommand(value: unknown) {
  const command = requireObject(value, 'Capability install command')
  requireExactKeys(
    command,
    new Set(['proposalId', 'scope', 'enable', 'permissionCeiling']),
    'Capability install command'
  )
  return {
    proposalId: requireIdentifier(
      command.proposalId,
      'Capability proposal ID'
    ),
    scope: requireScope(command.scope),
    enable: requireBoolean(command.enable, 'Capability enabled'),
    ...(command.permissionCeiling === undefined
      ? {}
      : {
          permissionCeiling: command.permissionCeiling as CapabilityPermissionDeclaration
        })
  }
}

function requireScope(value: unknown): CapabilityScope {
  const scope = requireObject(value, 'Capability scope')
  const kind = requireEnum(
    scope.kind,
    new Set([
      'global',
      'work-root',
      'folder',
      'workspace',
      'requirement'
    ] as const),
    'Capability scope kind'
  )
  if (kind === 'global') {
    requireExactKeys(scope, new Set(['kind']), 'Capability scope')
    return { kind }
  }
  if (kind === 'work-root') {
    requireExactKeys(
      scope,
      new Set(['kind', 'workRootId']),
      'Capability scope'
    )
    return {
      kind,
      workRootId: requireIdentifier(scope.workRootId, 'Work root ID')
    }
  }
  if (kind === 'folder') {
    requireExactKeys(
      scope,
      new Set(['kind', 'workRootId', 'canonicalPath']),
      'Capability scope'
    )
    return {
      kind,
      workRootId: requireIdentifier(scope.workRootId, 'Work root ID'),
      canonicalPath: requireText(scope.canonicalPath, 'Folder path')
    }
  }
  requireExactKeys(
    scope,
    new Set([
      'kind',
      'workspaceId',
      ...(kind === 'requirement' ? ['requirementId'] : [])
    ]),
    'Capability scope'
  )
  return kind === 'workspace'
    ? {
        kind,
        workspaceId: requireIdentifier(scope.workspaceId, 'Workspace ID')
      }
    : {
        kind,
        workspaceId: requireIdentifier(scope.workspaceId, 'Workspace ID'),
        requirementId: requireIdentifier(
          scope.requirementId,
          'Requirement ID'
        )
      }
}
