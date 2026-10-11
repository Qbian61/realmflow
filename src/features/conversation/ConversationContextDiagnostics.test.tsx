import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { ConversationContextDiagnostics } from './ConversationContextDiagnostics'

describe('ConversationContextDiagnostics', () => {
  it('loads sanitized diagnostics on demand without rendering runtime handles', async () => {
    const getConversationContextDiagnostics = vi.fn().mockResolvedValue({
      sourceMessageId: 'message-1',
      relation: 'fresh',
      reasons: ['manual_fresh'],
      selectedMessageCount: 0,
      excluded: [
        { reason: 'runtime_handle', count: 1 },
        { reason: 'unrelated', count: 2 }
      ],
      recentMessageCount: 1,
      compactedFactCount: 0,
      recalledMemoryCount: 1,
      characterCount: 120,
      estimatedTokens: 30,
      projectionDigest: 'a'.repeat(64),
      createdAt: 1,
      leases: [
        {
          resourceType: 'browser_session',
          status: 'released',
          epoch: 2
        }
      ]
    })

    render(
      <LocalizationProvider>
        <ConversationContextDiagnostics
          sessionId="conversation-1"
          business={{ getConversationContextDiagnostics } as never}
        />
      </LocalizationProvider>
    )

    expect(screen.queryByText('fresh')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上下文详情' }))
    expect(await screen.findByText('fresh')).toBeInTheDocument()
    expect(screen.getByText('aaaaaaaaaaaa')).toBeInTheDocument()
    expect(screen.getByText('runtime_handle: 1')).toBeInTheDocument()
    expect(screen.getByText('browser_session · released · epoch 2')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('browser-dead-session')
    expect(document.body.textContent).not.toContain('cookie')
    expect(getConversationContextDiagnostics).toHaveBeenCalledWith({
      sessionId: 'conversation-1'
    })
  })
})
