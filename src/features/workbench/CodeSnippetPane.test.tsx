import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodeSnippetApi } from '../../../shared/code-snippet'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import CodeSnippetPane from './CodeSnippetPane'

vi.mock('../artifacts/CodeEditor', () => ({
  default: ({
    value,
    onChange
  }: {
    value: string
    onChange: (value: string) => void
  }) => (
    <textarea
      aria-label="代码编辑器"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}))

describe('CodeSnippetPane', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs, copies, and saves the current edited content', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText }
    })
    const api: CodeSnippetApi = {
      run: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'edited\n',
        stderr: '',
        timedOut: false,
        truncated: false,
        durationMs: 12
      }),
      save: vi.fn().mockResolvedValue('/tmp/snippet.js')
    }
    render(
      <LocalizationProvider>
        <CodeSnippetPane
          api={api}
          snippet={{
            language: 'javascript',
            content: 'console.log("original")',
            suggestedName: 'snippet.js'
          }}
        />
      </LocalizationProvider>
    )

    fireEvent.change(screen.getByLabelText('代码编辑器'), {
      target: { value: 'console.log("edited")' }
    })
    fireEvent.click(screen.getByRole('button', { name: '运行代码' }))
    await waitFor(() =>
      expect(api.run).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'console.log("edited")' })
      )
    )
    expect(screen.getByText('edited')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    })
    expect(writeText).toHaveBeenCalledWith('console.log("edited")')
    fireEvent.click(screen.getByRole('button', { name: '下载代码' }))
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'console.log("edited")' })
    )
  })

  it('disables execution for unsupported languages', () => {
    const api: CodeSnippetApi = {
      run: vi.fn(),
      save: vi.fn()
    }
    render(
      <LocalizationProvider>
        <CodeSnippetPane
          api={api}
          snippet={{
            language: 'typescript',
            content: 'const value: number = 1',
            suggestedName: 'snippet.ts'
          }}
        />
      </LocalizationProvider>
    )

    expect(screen.getByRole('button', { name: '运行代码' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '运行代码' })).toHaveAttribute(
      'title',
      '当前语言暂不支持运行'
    )
  })
})
