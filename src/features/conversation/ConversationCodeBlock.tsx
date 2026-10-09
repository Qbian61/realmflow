import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Maximize2
} from 'lucide-react'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-lua'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-typescript'
import { useMemo, useState, type ReactNode } from 'react'
import {
  normalizeCodeLanguage,
  type CodeSnippet
} from '../../../shared/code-snippet'
import { useLocalization } from '../../localization/LocalizationProvider'

type ConversationCodeBlockProps = {
  language: string
  code: string
  onOpen?: (snippet: CodeSnippet) => void
}

const languageLabels: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  shell: 'Shell',
  java: 'Java',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  plaintext: 'Plain text'
}

const extensions: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  shell: 'sh',
  java: 'java',
  json: 'json',
  html: 'html',
  css: 'css',
  markdown: 'md',
  plaintext: 'txt'
}

const prismLanguages: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  shell: 'bash',
  java: 'java',
  json: 'json',
  html: 'markup',
  css: 'css',
  markdown: 'markdown',
  lua: 'lua'
}

export function ConversationCodeBlock({
  language,
  code,
  onOpen
}: ConversationCodeBlockProps): JSX.Element {
  const { t } = useLocalization()
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const normalizedLanguage = normalizeCodeLanguage(language)
  const highlightedCode = useMemo(
    () => tokenizeCode(code, normalizedLanguage),
    [code, normalizedLanguage]
  )
  const snippet: CodeSnippet = {
    language: normalizedLanguage,
    content: code,
    suggestedName: `snippet.${extensions[normalizedLanguage] ?? 'txt'}`
  }

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  return (
    <div className="conversation-code-block">
      <div className="conversation-code-header">
        <button
          type="button"
          aria-label={t(
            collapsed ? 'chat.code.expand' : 'chat.code.collapse'
          )}
          title={t(collapsed ? 'chat.code.expand' : 'chat.code.collapse')}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        <span>{languageLabels[normalizedLanguage] ?? normalizedLanguage}</span>
        <div>
          <button
            type="button"
            aria-label={t('chat.code.copy')}
            title={t('chat.code.copy')}
            onClick={() => void copy()}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          {onOpen ? (
            <button
              type="button"
              aria-label={t('chat.code.open')}
              title={t('chat.code.open')}
              onClick={() => onOpen(snippet)}
            >
              <Maximize2 size={15} />
            </button>
          ) : null}
        </div>
      </div>
      {!collapsed ? (
        <pre>
          <code className={`language-${normalizedLanguage}`}>
            {highlightedCode}
          </code>
        </pre>
      ) : null}
    </div>
  )
}

function tokenizeCode(code: string, language: string): ReactNode {
  const grammarName = prismLanguages[language] ?? language
  const grammar = Prism.languages[grammarName]
  if (!grammar) return code
  return Prism.tokenize(code, grammar).map((token, index) =>
    renderToken(token, `token-${index}`)
  )
}

function renderToken(token: string | Prism.Token, key: string): ReactNode {
  if (typeof token === 'string') return token
  const aliases = Array.isArray(token.alias)
    ? token.alias
    : token.alias
      ? [token.alias]
      : []
  const children = Array.isArray(token.content)
    ? token.content.map((child, index) =>
        renderToken(child, `${key}-${index}`)
      )
    : renderToken(token.content, `${key}-content`)
  return (
    <span
      className={['token', token.type, ...aliases].join(' ')}
      key={key}
    >
      {children}
    </span>
  )
}
