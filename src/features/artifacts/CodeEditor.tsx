import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'

type MonacoWorkerEnvironment = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, label: string) => Worker
  }
}

;(self as MonacoWorkerEnvironment).MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    if (label === 'json') return new JsonWorker()
    if (['css', 'less', 'scss'].includes(label)) return new CssWorker()
    if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker()
    if (['javascript', 'typescript'].includes(label)) return new TypeScriptWorker()
    return new EditorWorker()
  }
}

loader.config({ monaco })

type CodeEditorProps = {
  language: string
  path: string
  value: string
  onChange: (value: string) => void
}

export default function CodeEditor({
  language,
  path,
  value,
  onChange
}: CodeEditorProps): JSX.Element {
  return (
    <Editor
      height="100%"
      language={language}
      path={path}
      theme="vs"
      value={value}
      onChange={(nextValue) => onChange(nextValue ?? '')}
      options={{
        automaticLayout: true,
        contextmenu: true,
        fontFamily:
          "'SFMono-Regular', 'SF Mono', Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 21,
        minimap: { enabled: false },
        padding: { top: 14 },
        renderLineHighlight: 'line',
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: 'off'
      }}
    />
  )
}
