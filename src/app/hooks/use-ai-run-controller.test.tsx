import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import type { AiRunEvent } from '../../../domain/ai-run'
import type { AiRunApi } from '../../../shared/ai-run'
import { useAiRunController } from './use-ai-run-controller'

function Harness({ api }: { api: AiRunApi }): JSX.Element {
  const controller = useAiRunController(api)
  const [runId, setRunId] = useState('')
  const run = runId ? controller.runs[runId] : undefined
  return (
    <>
      <button
        onClick={() =>
          void controller
            .start({
              requirementId: 'requirement-1',
              nodeId: 'requirement-1:analysis',
              nodeRunId: 'node-run-1'
            })
            .then(setRunId)
        }
      >
        generate
      </button>
      <button onClick={() => runId && void controller.cancel(runId)}>
        cancel
      </button>
      <output>
        {run?.status}|{run?.progress}|{run?.content}|{run?.error}
      </output>
    </>
  )
}

function AttachHarness({ api }: { api: AiRunApi }): JSX.Element {
  const controller = useAiRunController(api)
  const run = controller.runs['run-restored']
  return (
    <>
      <button onClick={() => void controller.attach('run-restored')}>
        attach
      </button>
      <output>
        {run?.status}|{run?.progress}|{run?.content}|{run?.error}
      </output>
    </>
  )
}

describe('useAiRunController', () => {
  it('projects progress, streaming content, completion and cancellation', async () => {
    let listener: (event: AiRunEvent) => void = () => undefined
    const api: AiRunApi = {
      start: vi.fn().mockResolvedValue({ runId: 'run-1' }),
      cancel: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      attach: vi.fn(),
      listEvents: vi.fn(),
      onEvent: vi.fn().mockImplementation((next) => {
        listener = next
        return () => undefined
      })
    }
    render(<Harness api={api} />)

    fireEvent.click(screen.getByRole('button', { name: 'generate' }))
    await waitFor(() =>
      expect(screen.getByText(/^created/)).toBeInTheDocument()
    )
    expect(api.start).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'requirement-1:analysis',
      nodeRunId: 'node-run-1'
    })
    act(() => {
      listener(event(1, 'run.started'))
      listener(event(2, 'run.progress', { progress: 40 }))
      listener(event(3, 'content.delta', { delta: '# Scope' }))
    })
    await waitFor(() =>
      expect(screen.getByText('running|40|# Scope|')).toBeInTheDocument()
    )

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('run-1'))
    expect(screen.getByText(/^cancelling/)).toBeInTheDocument()
    act(() => listener(event(4, 'run.cancelled')))
    await waitFor(() =>
      expect(screen.getByText(/^cancelled/)).toBeInTheDocument()
    )
  })

  it('shows typed failures and unsubscribes without cancelling on unmount', async () => {
    let listener: (event: AiRunEvent) => void = () => undefined
    const unsubscribe = vi.fn()
    const api: AiRunApi = {
      start: vi.fn().mockResolvedValue({ runId: 'run-1' }),
      cancel: vi.fn(),
      get: vi.fn(),
      attach: vi.fn(),
      listEvents: vi.fn(),
      onEvent: vi.fn().mockImplementation((next) => {
        listener = next
        return unsubscribe
      })
    }
    const view = render(<Harness api={api} />)
    fireEvent.click(screen.getByRole('button', { name: 'generate' }))
    await screen.findByText(/^created/)

    act(() =>
      listener(event(1, 'run.failed', { message: 'Sidecar is unavailable' }))
    )
    await screen.findByText('failed|0||Sidecar is unavailable')
    view.unmount()

    expect(unsubscribe).toHaveBeenCalled()
    expect(api.cancel).not.toHaveBeenCalled()
  })

  it('hydrates and follows a persisted run after the page reopens', async () => {
    let listener: (event: AiRunEvent) => void = () => undefined
    const api: AiRunApi = {
      start: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn(),
      attach: vi.fn().mockResolvedValue({
        run: {
          id: 'run-restored',
          requirementId: 'requirement-1',
          nodeId: 'requirement-1:analysis',
          stageId: 'analysis',
          status: 'running',
          lastSequence: 3,
          content: '# Existing'
        },
        events: [
          event(1, 'run.started', {}, 'run-restored'),
          event(2, 'content.delta', { delta: '# Existing' }, 'run-restored'),
          event(3, 'run.progress', { progress: 60 }, 'run-restored')
        ]
      }),
      listEvents: vi.fn(),
      onEvent: vi.fn().mockImplementation((next) => {
        listener = next
        return () => undefined
      })
    }
    render(<AttachHarness api={api} />)

    fireEvent.click(screen.getByRole('button', { name: 'attach' }))
    await screen.findByText('running|60|# Existing|')
    expect(api.attach).toHaveBeenCalledWith('run-restored')

    act(() =>
      listener(
        event(4, 'content.delta', { delta: '\n\nContinued' }, 'run-restored')
      )
    )
    await screen.findByText('running|60|# Existing Continued|')
  })
})

function event(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data'] = {},
  runId = 'run-1'
): AiRunEvent {
  return {
    id: `event-${sequence}`,
    runId,
    sequence,
    type,
    timestamp: new Date(sequence).toISOString(),
    data
  }
}
