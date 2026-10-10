import type { IpcMain } from 'electron'
import {
  requireBoolean,
  requireDigest,
  requireEnum,
  requireExactKeys,
  requireIdentifier,
  requireInteger,
  requireObject,
  requireSemver,
  requireText,
} from '../../../domain/tool-protocol-validation'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS,
} from '../../../shared/ipc-contract'
import type {
  SkillRegistryActivationCommand,
  SkillRegistryItemDto,
  SkillRegistryReviewCommand,
  SkillRegistrySyncResult,
} from '../../../shared/skill-registry'
import type { SkillRegistryService } from '../application/skills/skill-registry-service'
import { requireNoIpcPayload } from './runtime-validation'

type Options = {
  service: Pick<
    SkillRegistryService,
    'list' | 'review' | 'setActivation'
  >
  synchronize: () => Promise<SkillRegistrySyncResult>
  ipcMain: Pick<IpcMain, 'handle'>
}

export function registerSkillRegistryIpc({
  service,
  synchronize,
  ipcMain,
}: Options): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.skillRegistryList,
    (_event, ...values) => {
      requireNoIpcPayload(values, IPC_QUERY_CHANNELS.skillRegistryList)
      return service.list().map(toDto)
    },
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.skillRegistrySynchronize,
    async (_event, ...values) => {
      requireNoIpcPayload(
        values,
        IPC_COMMAND_CHANNELS.skillRegistrySynchronize,
      )
      return synchronize()
    },
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.skillRegistryReview,
    (_event, value) => service.review(requireReviewCommand(value)),
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.skillRegistrySetActivation,
    (_event, value) =>
      service.setActivation(requireActivationCommand(value)),
  )
}

function toDto(item: ReturnType<SkillRegistryService['list']>[number]): SkillRegistryItemDto {
  return {
    source: item.source,
    skill: {
      id: item.version.skillId,
      version: item.version.version,
      digest: item.version.digest,
      name: item.version.definition.name,
      description: item.version.definition.description,
      risk: item.version.risk,
      contexts: [...item.version.definition.activation.contexts],
      requiredTools: structuredClone(
        item.version.definition.requiredTools,
      ),
      instructionsDigest: item.version.instructionsDigest,
      boundaryNotes: item.version.boundaryNotes,
    },
    review: item.review,
    activation: item.activation,
    present: item.present,
  }
}

function requireReviewCommand(value: unknown): SkillRegistryReviewCommand {
  const command = requireObject(value, 'Skill review command')
  requireExactKeys(
    command,
    new Set([
      'skillId',
      'version',
      'digest',
      'status',
      'notes',
      'expectedRevision',
      'requestId',
    ]),
    'Skill review command',
  )
  return {
    ...requireIdentity(command),
    status: requireEnum(
      command.status,
      new Set(['approved', 'rejected'] as const),
      'Skill review status',
    ),
    notes: requireText(command.notes, 'Skill review notes', true),
    expectedRevision: requireRevision(command.expectedRevision),
    requestId: requireIdentifier(command.requestId, 'Skill review request ID'),
  }
}

function requireActivationCommand(
  value: unknown,
): SkillRegistryActivationCommand {
  const command = requireObject(value, 'Skill activation command')
  requireExactKeys(
    command,
    new Set([
      'skillId',
      'version',
      'digest',
      'enabled',
      'expectedRevision',
      'requestId',
    ]),
    'Skill activation command',
  )
  return {
    ...requireIdentity(command),
    enabled: requireBoolean(command.enabled, 'Skill activation'),
    expectedRevision: requireRevision(command.expectedRevision),
    requestId: requireIdentifier(
      command.requestId,
      'Skill activation request ID',
    ),
  }
}

function requireIdentity(command: Record<string, unknown>) {
  return {
    skillId: requireIdentifier(command.skillId, 'Skill ID'),
    version: requireSemver(command.version, 'Skill version'),
    digest: requireDigest(command.digest, 'Skill digest'),
  }
}

function requireRevision(value: unknown): number {
  return requireInteger(
    value,
    'Skill revision',
    0,
    Number.MAX_SAFE_INTEGER,
  )
}
