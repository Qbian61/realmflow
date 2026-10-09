import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import { ThemeProvider, useTheme } from '../../theme/ThemeProvider'
import CodeEditor from './CodeEditor'

const editorProps = vi.hoisted(() => vi.fn())

vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => {
    editorProps(props)
    return <div data-testid="monaco-editor" />
  },
  loader: { config: vi.fn() }
}))
vi.mock('monaco-editor', () => ({}))
vi.mock('monaco-editor/editor/editor.worker.js?worker', () => ({
  default: class EditorWorker {}
}))
vi.mock('monaco-editor/language/css/css.worker.js?worker', () => ({
  default: class CssWorker {}
}))
vi.mock('monaco-editor/language/html/html.worker.js?worker', () => ({
  default: class HtmlWorker {}
}))
vi.mock('monaco-editor/language/json/json.worker.js?worker', () => ({
  default: class JsonWorker {}
}))
vi.mock('monaco-editor/language/typescript/ts.worker.js?worker', () => ({
  default: class TypeScriptWorker {}
}))

function ThemeToggle(): JSX.Element {
  const { setTheme } = useTheme()
  return (
    <button type="button" onClick={() => setTheme('dark')}>
      dark
    </button>
  )
}

describe('CodeEditor theme', () => {
  it('uses the resolved light theme by default', () => {
    render(
      <ThemeProvider>
        <CodeEditor
          language="typescript"
          path="/test.ts"
          value="const value = 1"
          onChange={vi.fn()}
        />
      </ThemeProvider>
    )

    expect(editorProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'vs' })
    )
  })

  it('updates Monaco when the resolved theme changes', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
        <CodeEditor
          language="typescript"
          path="/test.ts"
          value="const value = 1"
          onChange={vi.fn()}
        />
      </ThemeProvider>
    )

    fireEvent.click(document.querySelector('button')!)

    expect(editorProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'vs-dark' })
    )
  })
})
