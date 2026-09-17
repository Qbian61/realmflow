import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const sourceRoot = resolve('src')
const sourceFiles = collectSourceFiles(sourceRoot)
const sharedRoot = resolve('shared')
const sharedFiles = collectSourceFiles(sharedRoot)
const pythonRoot = resolve('python-service')
const pythonFiles = collectSourceFiles(pythonRoot, /\.py$/)

describe('renderer architecture boundaries', () => {
  it('rebuilds native dependencies for Electron development and Node tests', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve('package.json'), 'utf8')
    ) as { scripts?: Record<string, string> }

    expect(packageJson.scripts?.dev).toMatch(/^npm run rebuild:native && /)
    expect(packageJson.scripts?.['rebuild:native']).toContain(
      'electron-rebuild -f'
    )
    expect(packageJson.scripts?.test).toMatch(
      /^npm run rebuild:test-native && /
    )
  })

  it('keeps renderer modules focused enough to review independently', () => {
    const oversizedModules = sourceFiles
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .map((file) => ({
        file: relative(sourceRoot, file),
        lines: readFileSync(file, 'utf8').split('\n').length
      }))
      .filter(({ lines }) => lines > 700)

    expect(oversizedModules).toEqual([])
  })

  it('keeps domain modules independent from UI and infrastructure layers', () => {
    const violations = importsMatching('domain/', [
      '/pages/',
      '/features/',
      '/components/',
      '/infrastructure/',
      '/app/',
      '/shared/'
    ])

    expect(violations).toEqual([])
  })

  it('keeps application modules independent from pages and components', () => {
    const violations = importsMatching('application/', [
      '/pages/',
      '/components/',
      '/infrastructure/'
    ])

    expect(violations).toEqual([])
  })

  it('keeps application modules independent from React', () => {
    const violations = sourceFiles
      .filter((file) => file.includes('/application/'))
      .flatMap((file) => [
        ...(file.endsWith('.tsx')
          ? [`${relative(sourceRoot, file)} is a React module`]
          : []),
        ...importsOf(file)
          .filter(
            (specifier) =>
              specifier === 'react' || specifier.startsWith('react/')
          )
          .map(
            (specifier) =>
              `${relative(sourceRoot, file)} -> ${specifier}`
          )
      ])

    expect(violations).toEqual([])
  })

  it('keeps shared contracts independent from renderer source modules', () => {
    const violations = sharedFiles.flatMap((file) =>
      importsOf(file)
        .filter((specifier) => specifier.includes('/src/'))
        .map((specifier) => `${relative(sharedRoot, file)} -> ${specifier}`)
    )

    expect(violations).toEqual([])
  })

  it('keeps pages independent from concrete infrastructure adapters', () => {
    const violations = importsMatching('pages/', ['/infrastructure/'])

    expect(violations).toEqual([])
  })

  it('does not use page modules as shared type providers', () => {
    const violations = sourceFiles
      .filter((file) => !file.includes('/pages/') && !file.endsWith('/app/AppRoutes.tsx'))
      .flatMap((file) =>
        importsOf(file)
          .filter((specifier) => specifier.includes('/pages/'))
          .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('keeps Electron and Node capabilities out of renderer production code', () => {
    const violations = sourceFiles
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .flatMap((file) =>
        importsOf(file)
          .filter(
            (specifier) =>
              specifier === 'electron' ||
              specifier.startsWith('node:')
          )
          .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('prevents renderer production code from connecting to the Sidecar directly', () => {
    const violations = sourceFiles
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return (
          /\bfetch\s*\(/.test(source) ||
          importsOf(file).some((specifier) =>
            specifier.includes('electron/src/sidecar')
          )
        )
      })
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('prevents renderer production code from writing business aggregates through legacy persistence', () => {
    const allowedCompatibilityAdapter = resolve(
      sourceRoot,
      'infrastructure/storage/main-process-repository.ts'
    )
    const violations = sourceFiles
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) => file !== allowedCompatibilityAdapter)
      .filter((file) =>
        /\b(?:window\.realmflow\??\.persistence|persistence)\.save\s*\(/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('keeps SQLite access in Electron Main infrastructure only', () => {
    const rendererViolations = sourceFiles
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) => /better-sqlite3|sqlite3|realmflow\.db/.test(
        readFileSync(file, 'utf8')
      ))
      .map((file) => relative(sourceRoot, file))
    const pythonViolations = pythonFiles
      .filter((file) => !file.includes('/tests/'))
      .filter((file) =>
        /(^|\n)\s*(import sqlite3|from sqlite3|from sqlalchemy|import sqlalchemy)/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(pythonRoot, file))

    expect([...rendererViolations, ...pythonViolations]).toEqual([])
  })

  it('keeps AI run IPC adapters independent from concrete infrastructure', () => {
    const ipcRoot = resolve('electron/src/ai-run/ipc')
    const violations = collectSourceFiles(ipcRoot)
      .filter((file) => !file.endsWith('.test.ts'))
      .flatMap((file) =>
        importsOf(file)
          .filter((specifier) => specifier.includes('/infrastructure/'))
          .map((specifier) => `${relative(ipcRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('keeps WorkbenchProvider as composition instead of an effect container', () => {
    const provider = resolve(
      sourceRoot,
      'features/workbench/WorkbenchProvider.tsx'
    )
    const hooks = [
      'use-workbench-commands.ts',
      'use-workbench-geometry.ts',
      'use-native-workbench-sync.ts',
      'use-terminal-sessions.ts'
    ].map((file) =>
      resolve(sourceRoot, 'features/workbench/hooks', file)
    )

    expect(readFileSync(provider, 'utf8').split('\n').length).toBeLessThanOrEqual(
      260
    )
    expect(hooks.filter((file) => !existsSync(file))).toEqual([])
  })
})

function importsMatching(
  directory: string,
  forbiddenFragments: string[]
): string[] {
  return sourceFiles
    .filter((file) => file.includes(`/${directory}`))
    .flatMap((file) =>
      importsOf(file)
        .filter((specifier) =>
          forbiddenFragments.some((fragment) => specifier.includes(fragment))
        )
        .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
    )
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1]
  )
}

function collectSourceFiles(
  directory: string,
  extensionPattern = /\.(ts|tsx)$/
): string[] {
  return readdirSync(directory)
    .map((entry) => resolve(directory, entry))
    .flatMap((entry) =>
      statSync(entry).isDirectory()
        ? collectSourceFiles(entry, extensionPattern)
        : entry
    )
    .filter((file) => extensionPattern.test(file))
}
