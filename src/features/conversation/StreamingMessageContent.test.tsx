import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StreamingMessageContent } from './StreamingMessageContent'

afterEach(() => vi.useRealTimers())

it('shows a recovered answer and its footer when a non-streaming empty message updates', () => {
  const view = render(<StreamingMessageContent content="" pending={false} />)
  view.rerender(<StreamingMessageContent content="恢复后的完整回答" pending={false}>
    <button>复制回答</button>
  </StreamingMessageContent>)
  expect(screen.getByText('恢复后的完整回答')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '复制回答' })).toBeInTheDocument()
})

it('continues playing streamed text after the completion event arrives', () => {
  vi.useFakeTimers()
  const view = render(<StreamingMessageContent content="" pending />)
  view.rerender(<StreamingMessageContent content="流式内容" pending={false}>
    <button>复制回答</button>
  </StreamingMessageContent>)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  for (let index = 0; index < 5; index++) act(() => vi.advanceTimersByTime(16))
  expect(screen.getByText('流式内容')).toBeInTheDocument()
  expect(screen.getByRole('button')).toBeInTheDocument()
})
