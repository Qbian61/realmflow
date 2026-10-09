import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { IpcMain } from 'electron'
import {
  requireIdentifier,
  requireInteger,
  requireObject
} from '../../../domain/tool-protocol-validation'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import type { RuntimeGovernanceService } from '../application/analytics/runtime-governance-service'

type RuntimeGovernanceServicePort = Pick<
  RuntimeGovernanceService,
  | 'querySnapshot'
  | 'getRunDetail'
  | 'runEvaluation'
  | 'release'
  | 'createDiagnosticPackage'
  | 'recordDiagnosticExport'
>

type RegisterRuntimeGovernanceIpcOptions = {
  service: RuntimeGovernanceServicePort
  ipcMain: Pick<IpcMain, 'handle'>
  dialog: {
    showSaveDialog: (options: {
      defaultPath: string
      filters: Array<{ name: string; extensions: string[] }>
      properties: Array<'createDirectory' | 'showOverwriteConfirmation'>
    }) => Promise<{ canceled: boolean; filePath?: string }>
  }
  writeFileAtomically?: (path: string, content: string) => Promise<void>
}

export function registerRuntimeGovernanceIpc({
  service,
  ipcMain,
  dialog,
  writeFileAtomically = atomicWrite
}: RegisterRuntimeGovernanceIpcOptions): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.runtimeGovernanceSnapshot,
    (_event, ...values) => {
      if (values.length > 0) {
        throw new Error('Runtime governance snapshot query takes no payload')
      }
      return service.querySnapshot()
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.runtimeGovernanceRunDetail,
    (_event, value) => service.getRunDetail(requireRunId(value, 'query'))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.runtimeGovernanceEvaluate,
    (_event, ...values) => {
      if (values.length > 0) {
        throw new Error('Runtime evaluation command takes no payload')
      }
      return service.runEvaluation()
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.runtimeGovernanceRelease,
    (_event, value) => service.release(requireRelease(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.runtimeGovernanceExport,
    async (_event, value) => {
      const runId = requireRunId(value, 'export command')
      const selection = await dialog.showSaveDialog({
        defaultPath: `realmflow-diagnostic-${runId}.json`,
        filters: [{ name: 'RealmFlow Diagnostic', extensions: ['json'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      })
      if (selection.canceled || !selection.filePath) {
        return { status: 'cancelled' as const }
      }
      const content = await service.createDiagnosticPackage(runId)
      await writeFileAtomically(selection.filePath, content)
      await service.recordDiagnosticExport(runId)
      return {
        status: 'exported' as const,
        fileName: basename(selection.filePath)
      }
    }
  )
}

function requireRunId(value: unknown, operation: string): string {
  const command = requireObject(value, `Runtime Run detail ${operation}`)
  const keys = Object.keys(command)
  if (keys.length !== 1 || keys[0] !== 'runId') {
    throw new Error('Runtime Run detail query contains unexpected fields')
  }
  return requireIdentifier(command.runId, 'Runtime Run ID')
}

function requireRelease(value: unknown) {
  const command = requireObject(value, 'Runtime release command')
  requireKeys(
    command,
    ['evaluationId', 'expectedRevision'],
    ['baselineOverallScore'],
    'Runtime release command'
  )
  return {
    evaluationId: requireIdentifier(
      command.evaluationId,
      'Runtime evaluation ID'
    ),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'Runtime governance revision',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    ...(command.baselineOverallScore === undefined
      ? {}
      : {
          baselineOverallScore: requireScore(command.baselineOverallScore)
        })
  }
}

function requireScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('Runtime baseline score is invalid')
  }
  return value
}

function requireKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[],
  label: string
): void {
  const allowed = new Set([...required, ...optional])
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    required.some((key) => !(key in value))
  ) {
    throw new Error(`${label} contains unexpected fields`)
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.tmp-${randomUUID()}`
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}
