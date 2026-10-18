import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const parityPath = join(
  root,
  'src/features/conversation/conversation-parity.css'
)
const stylesPath = join(root, 'src/styles.css')
const mainPath = join(root, 'src/main.tsx')
const fixturePath = join(
  root,
  'src/features/conversation/ConversationParityFixture.tsx'
)
const parity = readFile()
const styles = readFileSync(stylesPath, 'utf8')
const main = readFileSync(mainPath, 'utf8')
const fixture = readOptionalFile(fixturePath)

describe('conversation parity tokens', () => {
  it.each([
    ['--conversation-content-max-width', '722px'],
    ['--conversation-turn-gap', '24px'],
    ['--conversation-body-font-size', '13px'],
    ['--conversation-body-line-height', '19.5px'],
    ['--conversation-progress-height', '32px'],
    ['--conversation-agent-padding-inline-start', '16px'],
    ['--conversation-agent-padding-inline-end', '12px'],
    ['--conversation-control-radius', '6px'],
    ['--conversation-icon-size', '14px'],
    ['--conversation-hit-target', '28px'],
    ['--conversation-motion-duration', '120ms'],
    ['--conversation-terminal-max-height', '240px']
  ])('defines %s as %s', (name, value) => {
    expect(parity).toContain(`${name}: ${value}`)
  })

  it.each([
    ['--assistant-content-width', '728px'],
    ['--assistant-row-width', '756px'],
    ['--assistant-answer-font-size', '14px'],
    ['--assistant-answer-line-height', '22px'],
    ['--assistant-avatar-size', '18px'],
    ['--assistant-avatar-radius', '4px'],
    ['--assistant-primary-text', '#171717'],
    ['--assistant-secondary-text', '#737373'],
    ['--assistant-file-accent', '#3f85ff'],
    ['--assistant-summary-height', '28px']
  ])('defines assistant-only token %s as %s', (name, value) => {
    expect(parity).toContain(`${name}: ${value}`)
  })

  it('scopes Trae geometry to conversation messages without changing the composer', () => {
    expect(parity).toContain(
      '.chat-message.assistant .chat-message-assistant-content'
    )
    expect(parity).toContain(
      'width: var(--assistant-row-width)'
    )
    expect(parity).toMatch(
      /\.chat-message\.user > \.chat-message-content\s*\{[^}]*padding:\s*8px 12px[^}]*border-radius:\s*12px/s
    )
    expect(parity).toMatch(
      /\.chat-message-user-image\s*\{[^}]*width:\s*100px[^}]*height:\s*100px[^}]*border-radius:\s*12px/s
    )
    expect(parity).toMatch(
      /\.chat-message-user-file\s*\{[^}]*width:\s*200px[^}]*height:\s*54px[^}]*padding:\s*0 12px 0 8px/s
    )
    expect(parity).not.toContain('.chat-session-composer {')
  })

  it('uses the Trae assistant width and mono font in the acceptance fixture', () => {
    expect(parity).toContain("--font-mono: 'JetBrains Mono'")
    expect(parity).toMatch(
      /\.conversation-parity-fixture__viewport\s*\{[^}]*var\(--assistant-content-width\)/s
    )
    expect(parity).toMatch(
      /\.conversation-parity-scenario\s*\{[^}]*padding:\s*28px 0 32px/s
    )
  })

  it('keeps the shared assistant body track from expanding with the wider content row', () => {
    expect(parity).toMatch(
      /\.chat-message-assistant-body\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s
    )
    expect(parity).toMatch(
      /\.chat-message-assistant-body\s*\{[^}]*max-width:\s*100%/s
    )
  })

  it('keeps the assistant footer on the same padded grid as the answer', () => {
    expect(parity).toMatch(
      /\.chat-message-assistant-body > \.chat-message-footer\s*\{[^}]*width:\s*var\(--assistant-row-width\)[^}]*justify-self:\s*end[^}]*padding-left:\s*var\(--conversation-agent-padding-inline-start\)[^}]*margin-left:\s*0/s
    )
  })

  it('keeps assistant content inside the conversation column at narrow desktop widths', () => {
    expect(parity).toMatch(
      /@container main-workspace \(max-width:\s*760px\)\s*\{[\s\S]*?\.chat-session-page \.chat-message\.assistant \.chat-message-assistant-content,\s*\.chat-session-page \.chat-message-assistant-body > \.chat-message-footer\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*justify-self:\s*stretch/s
    )
    expect(parity).toMatch(
      /@container main-workspace \(max-width:\s*760px\)\s*\{[\s\S]*?\.chat-session-page \.assistant-message-answer\s*\{[^}]*width:\s*100%/s
    )
  })

  it.each([
    [
      '.assistant-message-answer .chat-message-markdown h1',
      ['font-size: 20px', 'line-height: 28px', 'margin: 0 0 16px']
    ],
    [
      '.assistant-message-answer .chat-message-markdown h2',
      ['font-size: 16px', 'line-height: 24px', 'margin: 32px 0 16px']
    ],
    [
      '.assistant-message-answer .chat-message-markdown h3',
      ['font-size: 13px', 'line-height: 18.2px', 'margin: 28px 0 0']
    ],
    [
      '.assistant-message-answer .chat-message-markdown p',
      ['font-size: 14px', 'line-height: 21px', 'margin: 12px 0 0']
    ],
    [
      '.assistant-message-answer .chat-message-markdown :not(pre) > code',
      ['font-size: 13px', 'line-height: 16px', 'padding: 0 3px', 'border-radius: 3px']
    ]
  ])('matches Trae Markdown density for %s', (selector, declarations) => {
    const start = parity.indexOf(`${selector} {`)
    expect(start).toBeGreaterThan(-1)
    const block = parity.slice(start, parity.indexOf('}', start))
    for (const declaration of declarations) {
      expect(block).toContain(declaration)
    }
  })

  it.each([
    '.chat-session-messages',
    '.chat-turn',
    '.assistant-task-disclosure-trigger',
    '.assistant-tool-terminal',
    '.chat-message-markdown table',
    '.chat-message-actions',
    '.assistant-tool-error',
    ':focus-visible',
    ':hover'
  ])('owns the %s parity selector', (selector) => {
    expect(parity).toContain(selector)
  })

  it('is loaded after the general application stylesheet', () => {
    const general = main.indexOf("import './styles.css'")
    const conversation = main.indexOf(
      "import './features/conversation/conversation-parity.css'"
    )
    expect(styles).not.toContain('@import')
    expect(general).toBeGreaterThan(-1)
    expect(conversation).toBeGreaterThan(general)
  })

  it('lets the expanded execution tree grow with the conversation page', () => {
    expect(parity).toMatch(
      /\.assistant-display-tree\s*\{[^}]*max-height:\s*none[^}]*overflow:\s*visible/s
    )
  })

  it('matches Trae execution-flow hierarchy and density', () => {
    expect(parity).toMatch(
      /\.assistant-task-disclosure-header\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*32px 1px/s
    )
    expect(parity).toMatch(
      /\.assistant-task-disclosure-content\s*\{[^}]*padding:\s*0/s
    )
    expect(parity).toMatch(
      /\.assistant-progress-group\s*\{[^}]*gap:\s*16px/s
    )
    expect(parity).toMatch(
      /\.assistant-display-tree\s*>\s*\.assistant-display-reasoning,\s*\.assistant-progress-group\s*>\s*\.assistant-display-reasoning\s*\{[^}]*margin:\s*0[^}]*color:\s*var\(--assistant-primary-text\)[^}]*font-size:\s*14px[^}]*line-height:\s*21px/s
    )
    expect(parity).toMatch(
      /\.assistant-execution-timeline\[data-density='compact'\]\s+\.assistant-disclosure-trigger\s*\{[^}]*min-height:\s*28px/s
    )
    expect(parity).toMatch(
      /\.assistant-display-group\s*>\s*\.assistant-display-disclosure-body,\s*\.assistant-display-group-children\s*\{[^}]*margin-left:\s*0/s
    )
    expect(parity).toMatch(
      /\.assistant-display-group-children\s*\{[^}]*display:\s*flex[^}]*gap:\s*4px[^}]*padding-top:\s*8px/s
    )
    expect(parity).toMatch(
      /\.assistant-display-group\s*>\s*\.assistant-disclosure-trigger\s*\{[^}]*height:\s*28px[^}]*padding:\s*0[^}]*border-radius:\s*0/s
    )
    expect(parity).toMatch(
      /\.assistant-execution-timeline\[data-density='compact'\]\s+\.assistant-reference-group\s*>\s*\.assistant-disclosure-trigger\s*\{[^}]*height:\s*24px[^}]*padding:\s*0[^}]*border-radius:\s*4px/s
    )
  })

  it('matches Trae expanded Tool card geometry', () => {
    expect(parity).toMatch(
      /\.assistant-tool-card__header\s*\{[^}]*height:\s*24px[^}]*gap:\s*8px/s
    )
    expect(parity).toMatch(
      /\.assistant-tool-card__body-row\s*\{[^}]*display:\s*flex[^}]*gap:\s*4px/s
    )
    expect(parity).toMatch(
      /\.assistant-tool-card__connector\s*\{[^}]*width:\s*16px/s
    )
    expect(parity).toMatch(
      /\.assistant-tool-card__body\s*\{[^}]*padding:\s*4px 0 8px 4px/s
    )
    expect(parity).toMatch(
      /\.assistant-tool-surface\s*\{[^}]*background:\s*rgb\(86 99 119 \/ 3%\)[^}]*border-radius:\s*12px/s
    )
    expect(parity).toMatch(
      /\.assistant-tool-surface\.collapsed\s+\.assistant-tool-surface__body\s*\{[^}]*max-height:\s*240px/s
    )
    expect(parity).toMatch(
      /\.assistant-tool-command-line,\s*\.assistant-tool-output\s*\{[^}]*font:\s*12px\/18px var\(--font-mono\)/s
    )
  })

  it('keeps failed Tool details compact instead of rendering a red error block', () => {
    expect(parity).toMatch(
      /\.assistant-tool-error-detail\s*\{[^}]*color:\s*var\(--assistant-secondary-text\)[^}]*background:\s*transparent[^}]*border-left:\s*0/s
    )
    expect(parity).not.toMatch(
      /\.assistant-tool-error,\s*\.assistant-display-notification\.error/
    )
  })

  it('matches Trae Sub-agent identity rail and single-line header geometry', () => {
    expect(parity).toMatch(
      /\.assistant-sub-agent-item\s*\{[^}]*grid-template-columns:\s*16px minmax\(0,\s*1fr\)[^}]*gap:\s*4px/s
    )
    expect(parity).toMatch(
      /\.assistant-sub-agent-header\s*\{[^}]*height:\s*24px[^}]*white-space:\s*nowrap/s
    )
    expect(parity).toMatch(
      /\.assistant-sub-agent-objective\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s
    )
  })
})

function readFile(): string {
  return readOptionalFile(parityPath)
}

describe('conversation parity acceptance fixture', () => {
  it.each([
    'collapsed',
    'expanded',
    'running',
    'completed',
    'failed',
    'sub-agent'
  ])('contains the %s scenario', (scenario) => {
    expect(fixture).toContain(`data-scenario="${scenario}"`)
  })

  it('is reachable only through the development fixture query', () => {
    expect(main).toContain("conversationFixture === 'messages'")
    expect(main).toContain('<ConversationParityFixture />')
  })
})

function readOptionalFile(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
