import {
  Check,
  Copy,
  Download,
  Play
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  CodeSnippet,
  CodeSnippetApi,
  CodeSnippetRunResult
} from '../../../shared/code-snippet'
import { isRunnableCodeLanguage } from '../../../shared/code-snippet'
import { Spinner } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import CodeEditor from '../artifacts/CodeEditor'

export default function CodeSnippetPane({
  snippet,
  api
}: {
  snippet: CodeSnippet
  api?: CodeSnippetApi
}): JSX.Element {
  const { t } = useLocalization()
  const [content, setContent] = useState(snippet.content)
  const [result, setResult] = useState<CodeSnippetRunResult | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setContent(snippet.content)
    setResult(null)
    setError('')
  }, [snippet])

  const currentSnippet = (): CodeSnippet => ({ ...snippet, content })
  const runnable = Boolean(api && isRunnableCodeLanguage(snippet.language))

  const run = async (): Promise<void> => {
    if (!api || !runnable || running) return
    setRunning(true)
    setError('')
    try {
      setResult(await api.run(currentSnippet()))
    } catch (runError) {
      setResult(null)
      setError(
        runError instanceof Error ? runError.message : t('workbench.code.failed')
      )
    } finally {
      setRunning(false)
    }
  }

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  return (
    <section className="global-code-pane">
      <div className="global-code-toolbar">
        <span>{snippet.language}</span>
        <div>
          <button
            type="button"
            disabled={!runnable || running}
            aria-busy={running || undefined}
            aria-label={t('workbench.code.run')}
            title={
              runnable
                ? t('workbench.code.run')
                : t('workbench.code.unsupported')
            }
            onClick={() => void run()}
          >
            {running ? (
              <Spinner size={16} />
            ) : (
              <Play size={16} />
            )}
          </button>
          <button
            type="button"
            aria-label={t('workbench.code.copy')}
            title={t('workbench.code.copy')}
            onClick={() => void copy()}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button
            type="button"
            disabled={!api}
            aria-label={t('workbench.code.download')}
            title={t('workbench.code.download')}
            onClick={() => void api?.save(currentSnippet())}
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      <div className="global-code-editor">
        <CodeEditor
          language={snippet.language}
          path={snippet.suggestedName}
          value={content}
          onChange={setContent}
        />
      </div>
      {result || error ? (
        <div className="global-code-output" aria-live="polite">
          <div>
            <strong>{t('workbench.code.output')}</strong>
            {result ? (
              <span>
                {t('workbench.code.exit', {
                  code: result.timedOut
                    ? t('workbench.code.timeout')
                    : String(result.exitCode ?? '-')
                })}
              </span>
            ) : null}
          </div>
          {error ? <pre className="error">{error}</pre> : null}
          {result?.stdout ? <pre>{result.stdout}</pre> : null}
          {result?.stderr ? (
            <pre className="error">{result.stderr}</pre>
          ) : null}
          {result && !result.stdout && !result.stderr ? (
            <p>{t('workbench.code.noOutput')}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
