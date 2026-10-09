import type { IpcMain } from 'electron'
import {
  createCapabilitySpec,
  type CapabilitySpecSource
} from '../../../domain/capability-builder'
import type { CapabilityScope } from '../../../domain/capability'
import {
  requireBoolean,
  requireDigest,
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
import type { CapabilityBuilderService } from '../application/capabilities/capability-builder-service'

type RegisterCapabilityBuilderIpcOptions = {
  builder: Pick<
    CapabilityBuilderService,
    | 'createDraft'
    | 'getSession'
    | 'reviseDraft'
    | 'confirmInstall'
    | 'cancel'
  >
  ipcMain: Pick<IpcMain, 'handle'>
}

export function registerCapabilityBuilderIpc({
  builder,
  ipcMain
}: RegisterCapabilityBuilderIpcOptions): void {
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityBuilderCreate,
    (_event, value) => builder.createDraft(requireCreateCommand(value))
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.capabilityBuilderGet,
    (_event, value) =>
      builder.getSession(
        requireIdentifier(value, 'Capability generation ID')
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityBuilderRevise,
    (_event, value) => builder.reviseDraft(requireReviseCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityBuilderConfirm,
    (_event, value) => builder.confirmInstall(requireConfirmCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.capabilityBuilderCancel,
    (_event, value) => builder.cancel(requireCancelCommand(value))
  )
}

function requireCreateCommand(value: unknown) {
  const command = requireObject(value, 'Capability Builder create command')
  assertExactTopLevel(
    command,
    new Set(['request', 'spec']),
    'Capability Builder create command'
  )
  return {
    request: requireText(command.request, 'Capability request'),
    spec: requireSpec(command.spec)
  }
}

function requireReviseCommand(value: unknown) {
  const command = requireObject(value, 'Capability Builder revise command')
  assertExactTopLevel(
    command,
    new Set(['sessionId', 'expectedRevision', 'request', 'spec']),
    'Capability Builder revise command'
  )
  return {
    sessionId: requireIdentifier(
      command.sessionId,
      'Capability generation ID'
    ),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'Capability generation revision',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    request: requireText(command.request, 'Capability request'),
    spec: requireSpec(command.spec)
  }
}

function requireConfirmCommand(value: unknown) {
  const command = requireObject(value, 'Capability Builder confirm command')
  assertExactTopLevel(
    command,
    new Set([
      'sessionId',
      'proposalId',
      'revision',
      'packageDigest',
      'scope',
      'enable'
    ]),
    'Capability Builder confirm command'
  )
  return {
    sessionId: requireIdentifier(
      command.sessionId,
      'Capability generation ID'
    ),
    proposalId: requireIdentifier(
      command.proposalId,
      'Capability proposal ID'
    ),
    revision: requireInteger(
      command.revision,
      'Capability generation revision',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    packageDigest: requireDigest(
      command.packageDigest,
      'Capability package digest'
    ),
    scope: requireScope(command.scope),
    enable: requireBoolean(command.enable, 'Capability enabled')
  }
}

function requireCancelCommand(value: unknown) {
  const command = requireObject(value, 'Capability Builder cancel command')
  assertExactTopLevel(
    command,
    new Set(['sessionId', 'expectedRevision']),
    'Capability Builder cancel command'
  )
  return {
    sessionId: requireIdentifier(
      command.sessionId,
      'Capability generation ID'
    ),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'Capability generation revision',
      1,
      Number.MAX_SAFE_INTEGER
    )
  }
}

function requireSpec(value: unknown): CapabilitySpecSource {
  const source = requireObject(value, 'Capability Spec')
  requireExactKeys(
    source,
    new Set([
      'schemaVersion',
      'id',
      'kind',
      'version',
      'name',
      'description',
      'scope',
      'runtime',
      'permissions',
      'dependencies',
      'compatibility'
    ]),
    'Capability Spec'
  )
  const runtime = requireObject(source.runtime, 'Capability Spec runtime')
  const kind = requireEnum(
    runtime.kind,
    new Set(['connector', 'skill', 'agent'] as const),
    'Capability Spec runtime kind'
  )
  if (kind === 'connector') {
    requireExactKeys(
      runtime,
      new Set([
        'kind',
        'connectorKind',
        'baseUrl',
        'method',
        'path',
        'credentialRefs',
        'externalWrite'
      ]),
      'Capability Connector runtime'
    )
  } else if (kind === 'skill') {
    requireExactKeys(
      runtime,
      new Set(['kind', 'instructions', 'executable']),
      'Capability Skill runtime'
    )
  } else {
    requireExactKeys(
      runtime,
      new Set([
        'kind',
        'prompt',
        'modelCapabilities',
        'reasoningModes',
        'delegation'
      ]),
      'Capability Agent runtime'
    )
  }
  const normalized = createCapabilitySpec(
    structuredClone(source) as CapabilitySpecSource
  )
  const { specDigest: _specDigest, ...spec } = normalized
  return spec
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
  if (kind === 'workspace') {
    requireExactKeys(
      scope,
      new Set(['kind', 'workspaceId']),
      'Capability scope'
    )
    return {
      kind,
      workspaceId: requireIdentifier(scope.workspaceId, 'Workspace ID')
    }
  }
  requireExactKeys(
    scope,
    new Set(['kind', 'workspaceId', 'requirementId']),
    'Capability scope'
  )
  return {
    kind,
    workspaceId: requireIdentifier(scope.workspaceId, 'Workspace ID'),
    requirementId: requireIdentifier(
      scope.requirementId,
      'Requirement ID'
    )
  }
}

function assertExactTopLevel(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  label: string
): void {
  if (
    Object.keys(value).some((key) => !keys.has(key)) ||
    [...keys].some((key) => !(key in value))
  ) {
    throw new Error(`${label} contains unexpected fields`)
  }
}
