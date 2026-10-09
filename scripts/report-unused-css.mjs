import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PRISM_TOKEN_CLASSES = new Set([
  'attr-name',
  'attr-value',
  'boolean',
  'cdata',
  'char',
  'class-name',
  'comment',
  'constant',
  'doctype',
  'function',
  'keyword',
  'number',
  'operator',
  'prolog',
  'property',
  'punctuation',
  'selector',
  'string',
  'symbol',
  'tag'
])

export const CSS_USAGE_ALLOWLIST = [
  {
    kind: 'prefix',
    value: 'react-flow__',
    owner: '@xyflow/react',
    reason: 'React Flow emits its internal class names at runtime.',
    removalCondition:
      'Remove when the corresponding React Flow surface and override are deleted.'
  },
  {
    kind: 'set',
    values: PRISM_TOKEN_CLASSES,
    owner: 'prism-react-renderer',
    reason: 'Prism emits syntax token classes from parsed source code.',
    removalCondition:
      'Remove individual names when Prism no longer emits or styles that token.'
  },
  {
    kind: 'pattern',
    value:
      /^ui-(?:badge|button|card|data-table|dialog|drawer|inline-alert|menu|menu-item|page__body|tab-list|tabs)--/,
    owner: 'src/components/ui',
    reason: 'Shared UI variants are assembled from typed component props.',
    removalCondition:
      'Remove when the matching component variant is removed from its public API.'
  },
  {
    kind: 'set',
    values: new Set([
      'status-active',
      'status-corrupted',
      'status-dependency_disabled',
      'status-failed',
      'status-interrupted',
      'status-succeeded'
    ]),
    owner: 'Renderer domain status views',
    reason: 'Status suffixes are assembled from validated domain state values.',
    removalCondition:
      'Remove when the owning domain state or its visual treatment is deleted.'
  },
  {
    kind: 'set',
    values: new Set(['is-secondary', 'requirement-dag-node-active']),
    owner: 'Renderer stateful components',
    reason: 'The complete class name is assembled from local state.',
    removalCondition:
      'Remove when the associated state branch stops emitting the class.'
  }
]

export const GOVERNED_UNUSED_CLASS_PATTERNS = [
  { kind: 'prefix', value: 'active-schedule-' },
  { kind: 'prefix', value: 'skill-trial-' },
  {
    kind: 'set',
    values: new Set([
      'permission-actions',
      'permission-context',
      'permission-copy',
      'permission-mode',
      'permission-resource',
      'permission-row',
      'permission-title',
      'requirement-breadcrumb',
      'requirement-status',
      'requirement-status-row',
      'model-page-heading',
      'catalog-search-status',
      'workflow-node-error',
      'workflow-parallelism-error',
      'workflow-node-action-dialog-error'
    ])
  }
]

const DEFAULT_CSS_PATHS = [
  'src/styles.css',
  'src/components/ui/ui.css',
  'src/features/toast/toast.css',
  'src/features/workbench/workbench.css',
  'src/features/workbench/native-workbench-menu.css',
  'src/features/artifacts/artifact-workbench.css'
]

function matchesEntry(name, entry) {
  if (entry.kind === 'prefix') {
    return name.startsWith(entry.value)
  }
  if (entry.kind === 'set') {
    return entry.values.has(name)
  }
  return entry.value.test(name)
}

function extractCssClasses(content) {
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '')
  const classes = new Set()
  const selectorPattern = /\.([_a-zA-Z][-_a-zA-Z0-9]*)/g

  for (const match of withoutComments.matchAll(selectorPattern)) {
    classes.add(match[1])
  }
  return classes
}

function extractSourceTokens(content) {
  const tokens = new Set()
  const tokenPattern = /[_a-zA-Z][-_a-zA-Z0-9]*/g

  for (const match of content.matchAll(tokenPattern)) {
    tokens.add(match[0])
  }
  return tokens
}

export function analyzeCssUsage({ styles, sources }) {
  const classPaths = new Map()
  const sourceTokens = new Set()

  for (const source of sources) {
    for (const token of extractSourceTokens(source.content)) {
      sourceTokens.add(token)
    }
  }

  for (const style of styles) {
    for (const name of extractCssClasses(style.content)) {
      const paths = classPaths.get(name) ?? new Set()
      paths.add(style.path)
      classPaths.set(name, paths)
    }
  }

  const classes = [...classPaths]
    .map(([name, paths]) => ({ name, paths: [...paths].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name))
  const unused = classes
    .filter(({ name }) => !sourceTokens.has(name))
    .map((entry) => {
      const allowlisted = CSS_USAGE_ALLOWLIST.find((candidate) =>
        matchesEntry(entry.name, candidate)
      )
      const governed = GOVERNED_UNUSED_CLASS_PATTERNS.some((candidate) =>
        matchesEntry(entry.name, candidate)
      )
      return {
        ...entry,
        classification: allowlisted
          ? 'allowlisted'
          : governed
            ? 'governed'
            : 'review',
        allowlist: allowlisted
      }
    })

  return {
    classes,
    unused,
    violations: unused.filter(
      ({ classification }) => classification === 'governed'
    )
  }
}

function walkSourceFiles(directory, rootDirectory, paths) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(absolutePath, rootDirectory, paths)
      continue
    }
    if (!entry.isFile() || !['.ts', '.tsx', '.html'].includes(extname(entry.name))) {
      continue
    }
    if (
      entry.name.endsWith('.test.ts') ||
      entry.name.endsWith('.test.tsx') ||
      entry.name.endsWith('.d.ts')
    ) {
      continue
    }
    paths.push(relative(rootDirectory, absolutePath))
  }
}

export function analyzeRepositoryCssUsage(rootDirectory) {
  const root = resolve(rootDirectory)
  const sourcePaths = []
  const rendererSource = join(root, 'src')

  if (statSync(rendererSource).isDirectory()) {
    walkSourceFiles(rendererSource, root, sourcePaths)
  }
  const indexPath = join(root, 'index.html')
  if (statSync(indexPath).isFile()) {
    sourcePaths.push('index.html')
  }

  return analyzeCssUsage({
    styles: DEFAULT_CSS_PATHS.map((path) => ({
      path,
      content: readFileSync(join(root, path), 'utf8')
    })),
    sources: sourcePaths.map((path) => ({
      path,
      content: readFileSync(join(root, path), 'utf8')
    }))
  })
}

export function formatCssUsageReport(report, { details = false } = {}) {
  const reviewCount = report.unused.filter(
    ({ classification }) => classification === 'review'
  ).length
  const allowlistedCount = report.unused.filter(
    ({ classification }) => classification === 'allowlisted'
  ).length
  const lines = [
    `CSS classes: ${report.classes.length}`,
    `Unmatched: ${report.unused.length} (${allowlistedCount} allowlisted, ${reviewCount} review, ${report.violations.length} governed)`
  ]

  if (report.violations.length > 0) {
    lines.push(
      'Governed unused selectors:',
      ...report.violations.map(
        ({ name, paths }) => `- .${name} (${paths.join(', ')})`
      )
    )
  }
  if (details) {
    for (const [classification, heading] of [
      ['review', 'Review-only selectors:'],
      ['allowlisted', 'Allowlisted selectors:']
    ]) {
      const entries = report.unused.filter(
        (entry) => entry.classification === classification
      )
      if (entries.length > 0) {
        lines.push(
          heading,
          ...entries.map(
            ({ name, paths }) => `- .${name} (${paths.join(', ')})`
          )
        )
      }
    }
  }
  return lines.join('\n')
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const report = analyzeRepositoryCssUsage(rootDirectory)
  const check = process.argv.includes('--check')
  console.log(
    formatCssUsageReport(report, {
      details: !check || process.argv.includes('--verbose')
    })
  )
  if (check && report.violations.length > 0) {
    process.exitCode = 1
  }
}
