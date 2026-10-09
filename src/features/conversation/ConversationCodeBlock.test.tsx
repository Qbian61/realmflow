import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { ConversationCodeBlock } from './ConversationCodeBlock'

describe('ConversationCodeBlock', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows language controls and opens the original code in the workbench', () => {
    const openCodeSnippet = vi.fn()
    const { container } = render(
      <LocalizationProvider>
        <ConversationCodeBlock
          language="js"
          code={'console.log("ready")\n'}
          onOpen={openCodeSnippet}
        />
      </LocalizationProvider>
    )

    expect(screen.getByText('JavaScript')).toBeInTheDocument()
    expect(container.querySelector('code')).toHaveTextContent(
      'console.log("ready")'
    )

    fireEvent.click(screen.getByRole('button', { name: '在工作区打开' }))
    expect(openCodeSnippet).toHaveBeenCalledWith({
      language: 'javascript',
      content: 'console.log("ready")\n',
      suggestedName: 'snippet.js'
    })
  })

  it('copies and collapses code without changing its source', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText }
    })
    render(
      <LocalizationProvider>
        <ConversationCodeBlock
          language="python"
          code={'print("ready")\n'}
        />
      </LocalizationProvider>
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    })
    expect(writeText).toHaveBeenCalledWith('print("ready")\n')

    fireEvent.click(screen.getByRole('button', { name: '折叠代码' }))
    expect(screen.queryByText('print("ready")')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '展开代码' })
    ).toBeInTheDocument()
  })

  it('tokenizes fenced code for syntax coloring', () => {
    const { container } = render(
      <LocalizationProvider>
        <ConversationCodeBlock
          language="lua"
          code={[
            '-- rate limit',
            "local current = redis.call('get', KEYS[1]) or 0",
            'if current < 100 then',
            '  return 1',
            'end'
          ].join('\n')}
        />
      </LocalizationProvider>
    )

    expect(container.querySelector('.token.comment')).toHaveTextContent(
      '-- rate limit'
    )
    expect(container.querySelectorAll('.token.keyword').length).toBeGreaterThan(
      2
    )
    expect(container.querySelector('.token.string')).toHaveTextContent("'get'")
    expect(container.querySelector('.token.number')).toHaveTextContent('1')
  })
})
