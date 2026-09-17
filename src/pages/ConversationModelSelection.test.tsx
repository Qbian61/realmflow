import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import type { ModelProfile } from '../../domain/model'
import ChatSessionPage from './ChatSessionPage'
import { NewChatPage } from './NewChatPage'

const enabledProfile: ModelProfile & { revision: number } = {
  id: 'profile-fast',
  providerId: 'provider-local',
  modelId: 'fast-model',
  displayName: 'Fast Model',
  enabled: true,
  capabilities: {
    text: true,
    vision: false,
    toolCalling: true,
    structuredOutput: true
  },
  contextWindow: 32_000,
  inputCostPerMillionTokens: 0,
  outputCostPerMillionTokens: 0,
  revision: 1
}

describe('conversation model selection', () => {
  afterEach(() => {
    delete window.realmflow
  })

  it('passes the selected enabled profile when creating a conversation', async () => {
    installModelPool()
    const onCreateSession = vi.fn()
    render(<NewChatPage onCreateSession={onCreateSession} />)

    await screen.findByRole('option', { name: 'Fast Model' })
    fireEvent.change(screen.getByLabelText('对话内容'), {
      target: { value: 'Plan the rollout' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))

    expect(onCreateSession).toHaveBeenCalledWith(
      'none',
      'Plan the rollout',
      'profile-fast'
    )
  })

  it('passes the selected enabled profile when continuing a conversation', async () => {
    installModelPool()
    const onAppendMessage = vi.fn()
    render(
      <MemoryRouter initialEntries={['/sessions/session-1']}>
        <Routes>
          <Route
            path="/sessions/:sessionId"
            element={
              <ChatSessionPage
                sessions={[
                  {
                    id: 'session-1',
                    title: 'Rollout',
                    spacePath: '/spaces/store',
                    messages: [],
                    createdAt: 1,
                    updatedAt: 1
                  }
                ]}
                spaces={[]}
                onAppendMessage={onAppendMessage}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByRole('option', { name: 'Fast Model' })
    fireEvent.change(screen.getByLabelText('继续对话'), {
      target: { value: 'Use a canary release' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送对话消息' }))

    await waitFor(() =>
      expect(onAppendMessage).toHaveBeenCalledWith(
        'session-1',
        'Use a canary release',
        'profile-fast'
      )
    )
  })
})

function installModelPool(): void {
  window.realmflow = {
    business: {
      listModels: vi.fn().mockResolvedValue({
        providers: [],
        profiles: [
          enabledProfile,
          { ...enabledProfile, id: 'profile-disabled', enabled: false }
        ]
      })
    }
  } as unknown as typeof window.realmflow
}
