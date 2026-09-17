import { vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import { IPC_INVOKE_CHANNELS } from '../../../../shared/ipc-contract'
import {
  requireCancelAiRunInput,
  requireGetAiRunInput,
  requireListAiRunEventsInput,
  requireStartAiRunInput
} from '../../ipc/runtime-validation'
import { RendererRunEventPublisher } from '../infrastructure/renderer-run-event-publisher'
import { registerAiRunIpc } from './ai-run-ipc'

describe('AI run IPC', () => {
  it('validates command and query payloads at runtime', () => {
    expect(
      requireStartAiRunInput(
        {
          requirementId: 'requirement-1',
          nodeId: 'requirement-1:analysis',
          nodeRunId: 'node-run-1'
        },
        'ai-run:start'
      )
    ).toEqual({
      requirementId: 'requirement-1',
      nodeId: 'requirement-1:analysis',
      nodeRunId: 'node-run-1'
    })
    expect(() =>
      requireStartAiRunInput(
        {
          requirementId: 'requirement-1',
          nodeId: 'requirement-1:analysis',
          nodeRunId: '../unsafe'
        },
        'ai-run:start'
      )
    ).toThrow('Invalid IPC payload')
    expect(() =>
      requireStartAiRunInput(
        {
          requirementId: 'requirement-1',
          nodeId: 'requirement-1:analysis'
        },
        'ai-run:start'
      )
    ).toThrow('Invalid IPC payload')
    expect(() =>
      requireStartAiRunInput(
        { requirementId: '../unsafe', stageId: 'unknown' },
        'ai-run:start'
      )
    ).toThrow('Invalid IPC payload')
    expect(() =>
      requireCancelAiRunInput({ runId: '' }, 'ai-run:cancel')
    ).toThrow('Invalid IPC payload')
    expect(requireGetAiRunInput({ runId: 'run-1' }, 'ai-run:get')).toEqual({
      runId: 'run-1'
    })
    expect(
      requireListAiRunEventsInput({ runId: 'run-1' }, 'ai-run:list-events')
    ).toEqual({ runId: 'run-1' })
    expect(() => requireGetAiRunInput({ runId: 7 }, 'ai-run:get')).toThrow(
      'Invalid IPC payload'
    )
  })

  it('registers a renderer only for the run it started', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const publisher = new RendererRunEventPublisher()
    const sender = { id: 7, isDestroyed: () => false, send: vi.fn() }
    const executeNode = vi.fn().mockResolvedValue({
      runId: 'run-1',
      completion: Promise.resolve()
    })
    const executeStage = vi.fn()
    registerAiRunIpc({
      executeNode: { execute: executeNode } as never,
      executeStage: { execute: executeStage } as never,
      cancel: { execute: vi.fn() } as never,
      getRun: { execute: vi.fn() } as never,
      listEvents: { execute: vi.fn() } as never,
      publisher,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    await handlers.get(IPC_INVOKE_CHANNELS.aiRunStart)?.(
      { sender },
      {
        requirementId: 'requirement-1',
        nodeId: 'requirement-1:analysis',
        nodeRunId: 'node-run-1'
      }
    )
    const event = createEvent('run-1')
    publisher.publish(event)
    publisher.publish({ ...event, runId: 'run-2' })

    expect(sender.send).toHaveBeenCalledTimes(1)
    expect(sender.send).toHaveBeenCalledWith('ai-run:event', event)
    expect(executeNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'requirement-1:analysis',
      nodeRunId: 'node-run-1'
    })
    expect(executeStage).not.toHaveBeenCalled()
  })

  it('queries persisted runs and control-event history through use cases', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const run = {
      id: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'analysis',
      status: 'completed'
    }
    const events = [createEvent('run-1')]
    const getRun = { execute: vi.fn().mockResolvedValue(run) }
    const listEvents = { execute: vi.fn().mockResolvedValue(events) }
    registerAiRunIpc({
      executeNode: { execute: vi.fn() } as never,
      executeStage: { execute: vi.fn() } as never,
      cancel: { execute: vi.fn() } as never,
      getRun: getRun as never,
      listEvents: listEvents as never,
      publisher: { subscribe: vi.fn() },
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    await expect(
      handlers.get(IPC_INVOKE_CHANNELS.aiRunGet)?.({}, { runId: 'run-1' })
    ).resolves.toEqual(run)
    await expect(
      handlers.get(IPC_INVOKE_CHANNELS.aiRunListEvents)?.(
        {},
        { runId: 'run-1' }
      )
    ).resolves.toEqual(events)
    expect(getRun.execute).toHaveBeenCalledWith('run-1')
    expect(listEvents.execute).toHaveBeenCalledWith('run-1')
  })

  it('subscribes the renderer before returning an attached run snapshot', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const calls: string[] = []
    const sender = { id: 8, isDestroyed: () => false, send: vi.fn() }
    const run = {
      id: 'run-1',
      requirementId: 'requirement-1',
      nodeId: 'node-analysis',
      stageId: 'analysis',
      status: 'running',
      lastSequence: 2,
      content: '# Scope'
    }
    const events = [createEvent('run-1')]
    registerAiRunIpc({
      executeNode: { execute: vi.fn() } as never,
      executeStage: { execute: vi.fn() } as never,
      cancel: { execute: vi.fn() } as never,
      getRun: {
        execute: vi.fn(async () => {
          calls.push('get')
          return run
        })
      } as never,
      listEvents: {
        execute: vi.fn(async () => {
          calls.push('events')
          return events
        })
      } as never,
      publisher: {
        subscribe: vi.fn(() => {
          calls.push('subscribe')
        })
      },
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    await expect(
      handlers.get(IPC_INVOKE_CHANNELS.aiRunAttach)?.(
        { sender },
        { runId: 'run-1' }
      )
    ).resolves.toEqual({ run, events })
    expect(calls).toEqual(['subscribe', 'get', 'events'])
  })
})

function createEvent(runId: string): AiRunEvent {
  return {
    id: 'event-1',
    runId,
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-09-16T00:00:00Z',
    data: {}
  }
}
