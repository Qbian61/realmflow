import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FollowUpSuggestionList } from './FollowUpSuggestionList'

const labels = {
  region: '后续建议',
  send: (label: string) => `发送建议：${label}`,
  insert: (label: string) => `添加到对话：${label}`,
  sendTitle: '发送建议',
  insertTitle: '添加到对话'
}

const followUp = {
  suggestionSetId: 'set-1',
  revision: 2,
  suggestions: [
    {
      id: 'suggestion-1',
      label: '验证结果',
      prompt: '请运行验证并总结结果。',
      intent: 'verify' as const
    },
    {
      id: 'suggestion-2',
      label: '解释设计',
      prompt: '请解释设计的关键取舍。',
      intent: 'explain' as const
    }
  ]
}

it('renders accessible send and Composer actions in suggestion order', () => {
  const onSend = vi.fn()
  const onInsert = vi.fn()
  render(
    <FollowUpSuggestionList
      followUp={followUp}
      labels={labels}
      onSend={onSend}
      onInsert={onInsert}
    />
  )

  const region = screen.getByRole('region', { name: '后续建议' })
  expect(region).not.toHaveTextContent('由 AI 生成')
  const sendButton = screen.getByRole('button', {
    name: '发送建议：验证结果'
  })
  const insertButton = screen.getByRole('button', {
    name: '添加到对话：解释设计'
  })
  // 视觉 title 只提示操作类型，不拼接建议内容
  expect(sendButton).toHaveAttribute('title', '发送建议')
  expect(insertButton).toHaveAttribute('title', '添加到对话')

  fireEvent.click(sendButton)
  fireEvent.click(insertButton)

  expect(onSend).toHaveBeenCalledWith(followUp.suggestions[0])
  expect(onInsert).toHaveBeenCalledWith(followUp.suggestions[1])
})

it('disables the whole group while a suggestion is sending', () => {
  render(
    <FollowUpSuggestionList
      followUp={followUp}
      sending
      labels={labels}
      onSend={vi.fn()}
      onInsert={vi.fn()}
    />
  )

  expect(screen.getAllByRole('button')).toHaveLength(4)
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled()
  }
})
