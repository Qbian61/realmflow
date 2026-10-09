import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  BuiltinToolHandler,
  BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import {
  requireInteger,
  requireString,
  securePaths,
  selectRoot
} from './builtin-file-tool-support'

const VERSION = '1.0.0'
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

export type GitCommandResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
}

export type GitCommandPort = {
  run(input: {
    executable: string
    arguments: string[]
    cwd: string
    signal: AbortSignal
    maxOutputBytes: number
  }): Promise<GitCommandResult>
}

export function createGitToolHandlers(
  command: GitCommandPort
): BuiltinToolHandler[] {
  const handlers: Record<
    string,
    (input: BuiltinToolHandlerInput) => Promise<JsonObject>
  > = {
    'git.status': (input) =>
      runQuery(command, input, [
        'status',
        '--short',
        '--branch',
        '--untracked-files=all'
      ]),
    'git.diff': (input) => runDiff(command, input),
    'git.log': (input) => runLog(command, input),
    'git.list_branches': (input) =>
      runQuery(command, input, [
        'branch',
        '--all',
        '--no-color',
        '--format=%(refname)%09%(objectname)%09%(HEAD)'
      ]),
    'git.show': (input) => runShow(command, input),
    'git.file_history': (input) => runFileHistory(command, input),
    'git.commit': (input) => commit(command, input)
  }
  return Object.entries(handlers).map(([name, execute]) => ({
    name,
    version: VERSION,
    execute
  }))
}

async function runDiff(
  command: GitCommandPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  const staged = input.arguments.staged ?? false
  if (typeof staged !== 'boolean') {
    throw new Error('Git Tool staged is invalid')
  }
  const path = optionalPath(input.arguments, 'path')
  return runQuery(command, input, [
    'diff',
    '--no-ext-diff',
    ...(staged ? ['--cached'] : []),
    ...(path ? ['--', path] : [])
  ])
}

async function runLog(
  command: GitCommandPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  const maximum = requireInteger(input.arguments, 'maxCount', 50, 500)
  return runQuery(command, input, [
    'log',
    '--format=%H%x09%an%x09%aI%x09%s',
    '--no-color',
    `--max-count=${maximum}`
  ])
}

async function runShow(
  command: GitCommandPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  const reference = requireString(input.arguments, 'ref')!
  if (reference.startsWith('-') || reference.includes('\0')) {
    throw new Error('Git Tool ref is invalid')
  }
  return runQuery(command, input, [
    'show',
    '--no-ext-diff',
    '--no-color',
    '--format=fuller',
    reference
  ])
}

async function runFileHistory(
  command: GitCommandPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  const path = optionalPath(input.arguments, 'path', false)!
  const maximum = requireInteger(input.arguments, 'maxCount', 50, 500)
  return runQuery(command, input, [
    'log',
    '--format=%H%x09%an%x09%aI%x09%s',
    '--no-color',
    `--max-count=${maximum}`,
    '--',
    path
  ])
}

async function commit(
  command: GitCommandPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  const message = requireString(input.arguments, 'message')!.trim()
  if (!message || message.length > 10_000 || message.includes('\0')) {
    throw new Error('Git Tool message is invalid')
  }
  const files = normalizeFiles(input.arguments.files)
  const cwd = await repositoryRoot(input)
  await requireSuccess(
    command.run({
      executable: 'git',
      arguments: ['add', '--', ...files],
      cwd,
      signal: input.signal,
      maxOutputBytes: MAX_OUTPUT_BYTES
    })
  )
  const result = await requireSuccess(
    command.run({
      executable: 'git',
      arguments: ['commit', '--message', message, '--', ...files],
      cwd,
      signal: input.signal,
      maxOutputBytes: MAX_OUTPUT_BYTES
    })
  )
  return {
    committed: true,
    files,
    message,
    stdout: result.stdout,
    stderr: result.stderr,
    truncated: result.truncated
  }
}

async function runQuery(
  command: GitCommandPort,
  input: BuiltinToolHandlerInput,
  arguments_: string[]
): Promise<JsonObject> {
  return requireSuccess(
    command.run({
      executable: 'git',
      arguments: arguments_,
      cwd: await repositoryRoot(input),
      signal: input.signal,
      maxOutputBytes: MAX_OUTPUT_BYTES
    })
  )
}

async function repositoryRoot(
  input: BuiltinToolHandlerInput
): Promise<string> {
  return securePaths.canonicalizeDirectory(
    selectRoot(input.scopeRoots, input.arguments)
  )
}

function optionalPath(
  input: JsonObject,
  key: string,
  optional = true
): string | undefined {
  const value = requireString(input, key, { optional })
  return value === undefined
    ? undefined
    : securePaths.normalizeRelativePath(value)
}

function normalizeFiles(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1_000) {
    throw new Error('Git Tool files are invalid')
  }
  const files = value.map((path) => {
    if (typeof path !== 'string') {
      throw new Error('Git Tool files are invalid')
    }
    return securePaths.normalizeRelativePath(path)
  })
  if (new Set(files).size !== files.length) {
    throw new Error('Git Tool files are duplicated')
  }
  return files
}

async function requireSuccess(
  promise: Promise<GitCommandResult>
): Promise<GitCommandResult & JsonObject> {
  const result = await promise
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim().slice(0, 500) || 'Git Tool command failed'
    )
  }
  return result
}
