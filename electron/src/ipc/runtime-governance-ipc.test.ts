import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import { registerRuntimeGovernanceIpc } from './runtime-governance-ipc'

describe('Runtime governance IPC', () => {
  it('registers strict queries, evaluation, release and redacted export', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, value?: unknown) => unknown
    >()
    const service = {
      querySnapshot: vi.fn().mockResolvedValue({ revision: 1 }),
      getRunDetail: vi.fn().mockResolvedValue({ runId: 'run-1' }),
      runEvaluation: vi.fn().mockResolvedValue({ id: 'evaluation-1' }),
      release: vi.fn().mockResolvedValue({
        status: 'published',
        revision: 2,
        reasons: []
      }),
      createDiagnosticPackage: vi.fn().mockResolvedValue('{"safe":true}'),
      recordDiagnosticExport: vi.fn().mockResolvedValue(undefined)
    }
    const writeFileAtomically = vi.fn().mockResolvedValue(undefined)
    registerRuntimeGovernanceIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      },
      dialog: {
        showSaveDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePath: '/tmp/runtime-diagnostic.json'
        })
      },
      writeFileAtomically
    })

    await handlers.get(IPC_QUERY_CHANNELS.runtimeGovernanceSnapshot)!(
      {} as IpcMainInvokeEvent
    )
    await handlers.get(IPC_QUERY_CHANNELS.runtimeGovernanceRunDetail)!(
      {} as IpcMainInvokeEvent,
      { runId: 'run-1' }
    )
    await handlers.get(IPC_COMMAND_CHANNELS.runtimeGovernanceEvaluate)!(
      {} as IpcMainInvokeEvent
    )
    await handlers.get(IPC_COMMAND_CHANNELS.runtimeGovernanceRelease)!(
      {} as IpcMainInvokeEvent,
      { evaluationId: 'evaluation-1', expectedRevision: 1 }
    )
    const exported = await handlers.get(
      IPC_COMMAND_CHANNELS.runtimeGovernanceExport
    )!({} as IpcMainInvokeEvent, { runId: 'run-1' })

    expect(service.querySnapshot).toHaveBeenCalledOnce()
    expect(service.getRunDetail).toHaveBeenCalledWith('run-1')
    expect(service.runEvaluation).toHaveBeenCalledOnce()
    expect(service.release).toHaveBeenCalledWith({
      evaluationId: 'evaluation-1',
      expectedRevision: 1
    })
    expect(writeFileAtomically).toHaveBeenCalledWith(
      '/tmp/runtime-diagnostic.json',
      '{"safe":true}'
    )
    expect(service.recordDiagnosticExport).toHaveBeenCalledWith('run-1')
    expect(exported).toEqual({
      status: 'exported',
      fileName: 'runtime-diagnostic.json'
    })
  })

  it('rejects extra fields and does not audit a cancelled export', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, value?: unknown) => unknown
    >()
    const service = {
      querySnapshot: vi.fn(),
      getRunDetail: vi.fn(),
      runEvaluation: vi.fn(),
      release: vi.fn(),
      createDiagnosticPackage: vi.fn(),
      recordDiagnosticExport: vi.fn()
    }
    registerRuntimeGovernanceIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      },
      dialog: {
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true })
      },
      writeFileAtomically: vi.fn()
    })

    expect(() =>
      handlers.get(IPC_QUERY_CHANNELS.runtimeGovernanceRunDetail)!(
        {} as IpcMainInvokeEvent,
        { runId: 'run-1', rawContent: true }
      )
    ).toThrow('Runtime Run detail query contains unexpected fields')
    expect(() =>
      handlers.get(IPC_COMMAND_CHANNELS.runtimeGovernanceEvaluate)!(
        {} as IpcMainInvokeEvent,
        {
          dimensions: {
            safety: { passed: 10, total: 10 }
          }
        }
      )
    ).toThrow('Runtime evaluation command takes no payload')

    expect(
      await handlers.get(IPC_COMMAND_CHANNELS.runtimeGovernanceExport)!(
        {} as IpcMainInvokeEvent,
        { runId: 'run-1' }
      )
    ).toEqual({ status: 'cancelled' })
    expect(service.createDiagnosticPackage).not.toHaveBeenCalled()
    expect(service.recordDiagnosticExport).not.toHaveBeenCalled()
  })
})
