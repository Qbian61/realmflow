import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AgentRuntimeApi, AgentRuntimeStatus } from '../../../shared/agent-runtime-state'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { AgentRuntimePanel } from './AgentRuntimePanel'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const saved: AgentRuntimeStatus = {
  runId: 'root', sessionId: 'parent', rootRunId: 'root', status: 'running', createdAt: 1, updatedAt: 1,
  budgets: { maxToolCalls: 20, maxSubagents: 4, maxRetries: 2, timeoutMs: 60000 }, children: [],
  state: { runId: 'root', revision: 2, goal: { objective: 'Review architecture', status: 'active', revision: 1, updatedAt: 1 },
    cards: [{ id: 'review', title: 'Review', message: 'Checking changes', status: 'running', revision: 1, updatedAt: 1 }],
    instructions: [{ id: 'steer', sourceRunId: 'root', message: 'Check persistence', status: 'queued', createdAt: 1 }] },
  delegations: [{ runId: 'child', sessionId: 'child-session', parentRunId: 'root',
    objective: 'Inspect runtime', status: 'completed',
    result: { taskId: 'inspect', status: 'completed', summary: 'Runtime verified', evidence: [], unresolved: [], artifactIds: [] } }]
}
const api = (): AgentRuntimeApi => ({
  get: vi.fn().mockResolvedValue(saved),
  updateGoal: vi.fn().mockResolvedValue(saved),
  steer: vi.fn().mockResolvedValue(saved),
  cancel: vi.fn().mockResolvedValue(undefined)
})
function mount(value: AgentRuntimeApi) {
  return render(<MemoryRouter><LocalizationProvider>
    <Routes>
      <Route path="/" element={<AgentRuntimePanel runId="provider" api={value} />} />
      <Route path="/sessions/child-session" element={<p>Child conversation opened</p>} />
    </Routes>
  </LocalizationProvider></MemoryRouter>)
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: '运行详情' }))
  await screen.findByText('Review architecture', { selector: 'p' })
}

describe('AgentRuntimePanel', () => {
  it('loads only when opened and shows persisted progress, queued input and child links', async () => {
    const value = api()
    mount(value)
    expect(value.get).not.toHaveBeenCalled()
    await open()
    expect(value.get).toHaveBeenCalledWith('provider')
    expect(screen.getByText('Checking changes')).toBeVisible()
    expect(screen.getByText('Check persistence')).toBeVisible()
    expect(screen.getByText('等待下一回合')).toBeVisible()
    expect(screen.getByText('Runtime verified')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Inspect runtime' }))
    expect(await screen.findByText('Child conversation opened')).toBeVisible()
  })

  it('retains committed state until Main confirms a goal update and reports conflicts', async () => {
    const value = api()
    let reject!: (error: Error) => void
    vi.mocked(value.updateGoal).mockImplementation(() => new Promise((_yes, no) => { reject = no }))
    mount(value)
    await open()
    fireEvent.change(screen.getByLabelText('目标'), { target: { value: 'New objective' } })
    fireEvent.click(screen.getByRole('button', { name: '保存目标' }))
    await waitFor(() => expect(value.updateGoal).toHaveBeenCalledWith({
      runId: 'provider', requestId: expect.any(String), objective: 'New objective', status: 'active', expectedRevision: 1
    }))
    expect(screen.getByText('Review architecture', { selector: 'p' })).toBeVisible()
    expect(screen.queryByText('已保存')).not.toBeInTheDocument()
    await act(async () => reject(new Error('runtime_revision_conflict')))
    expect(await screen.findByRole('alert')).toHaveTextContent('状态已更新，请刷新后重试')
    expect(screen.getByText('Review architecture', { selector: 'p' })).toBeVisible()
  })

  it('queues input through Main, preserves text on failure and disables commands for finished runs', async () => {
    const value = api()
    vi.mocked(value.steer).mockRejectedValueOnce(new Error('failed'))
    mount(value)
    await open()
    fireEvent.change(screen.getByLabelText('调整指令'), { target: { value: 'Check rollback' } })
    fireEvent.click(screen.getByRole('button', { name: '加入下一回合' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('调整指令')).toHaveValue('Check rollback')
    vi.mocked(value.get).mockResolvedValue({ ...saved, status: 'completed' })
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存目标' })).toBeDisabled())
    expect(screen.getByRole('button', { name: '加入下一回合' })).toBeDisabled()
  })
})
