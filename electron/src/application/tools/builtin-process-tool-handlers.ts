import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  BuiltinToolHandler,
  BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import type { ToolExecutionContext } from './tool-adapter'
import {
  requireInteger,
  requireString,
  securePaths,
  selectRoot
} from './builtin-file-tool-support'

const VERSION = '1.0.0'
const EXECUTABLE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/
const EXECUTABLE_PATH = /^\/[A-Za-z0-9._+/-]{1,199}$/
const PROCESS_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/

type ProcessOwner = ToolExecutionContext['owner']

class ProcessToolError extends Error {
  readonly name = 'ProcessToolError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export type ManagedProcessPort = {
  discover(input: {
    names: string[]
    cwd: string
    signal: AbortSignal
  }): Promise<JsonObject[]>
  run(input: {
    executable: string
    arguments: string[]
    cwd: string
    timeoutMs: number
    maxOutputBytes: number
    signal: AbortSignal
  }): Promise<JsonObject>
  start(input: {
    owner: ProcessOwner
    executable: string
    arguments: string[]
    cwd: string
    maxOutputBytes: number
    signal: AbortSignal
  }): Promise<JsonObject>
  list(owner: ProcessOwner): Promise<JsonObject[]>
  stop(input: {
    owner: ProcessOwner
    processId: string
  }): Promise<JsonObject>
}

export function createProcessToolHandlers(
  processes: ManagedProcessPort
): BuiltinToolHandler[] {
  const handlers: Record<
    string,
    (input: BuiltinToolHandlerInput) => Promise<JsonObject>
  > = {
    'process.discover': (input) => discover(processes, input),
    'process.run': (input) => run(processes, input),
    'process.start': (input) => start(processes, input),
    'process.list': async (input) => ({
      processes: await processes.list(input.context.owner)
    }),
    'process.stop': (input) => stop(processes, input)
  }
  return Object.entries(handlers).map(([name, execute]) => ({
    name,
    version: VERSION,
    execute
  }))
}

async function discover(
  processes: ManagedProcessPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  const names = normalizeNames(input.arguments.names)
  return {
    tools: await processes.discover({
      names,
      cwd: await resolveCwd(input),
      signal: input.signal
    })
  }
}

async function run(
  processes: ManagedProcessPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  return processes.run({
    executable: normalizeExecutable(input.arguments),
    arguments: normalizeArguments(input.arguments),
    cwd: await resolveCwd(input),
    timeoutMs: requireInteger(
      input.arguments,
      'timeoutMs',
      120_000,
      3_600_000
    ),
    maxOutputBytes: requireInteger(
      input.arguments,
      'maxOutputBytes',
      1024 * 1024,
      16 * 1024 * 1024,
      1024
    ),
    signal: input.signal
  })
}

async function start(
  processes: ManagedProcessPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  return processes.start({
    owner: input.context.owner,
    executable: normalizeExecutable(input.arguments),
    arguments: normalizeArguments(input.arguments),
    cwd: await resolveCwd(input),
    maxOutputBytes: requireInteger(
      input.arguments,
      'maxOutputBytes',
      4 * 1024 * 1024,
      16 * 1024 * 1024,
      1024
    ),
    signal: input.signal
  })
}

async function stop(
  processes: ManagedProcessPort,
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  const processId = requireString(input.arguments, 'processId')!
  if (!PROCESS_ID.test(processId)) {
    throw processError('Process Tool processId is invalid')
  }
  return processes.stop({
    owner: input.context.owner,
    processId
  })
}

async function resolveCwd(
  input: BuiltinToolHandlerInput
): Promise<string> {
  const root = selectRoot(input.scopeRoots, input.arguments)
  const relativePath = requireString(input.arguments, 'cwd', {
    optional: true,
    allowEmpty: true
  })
  if (relativePath === undefined || relativePath === '') {
    return securePaths.canonicalizeDirectory(root)
  }
  const resolved = await securePaths.resolveExistingPath(root, relativePath)
  if (!(await stat(resolved.targetPath)).isDirectory()) {
    throw new Error('Process Tool cwd is not a directory')
  }
  return resolved.targetPath
}

function normalizeExecutable(input: JsonObject): string {
  const executable = input.executable
  if (executable === undefined) {
    throw processError('Process Tool executable is required')
  }
  if (typeof executable !== 'string' || executable.length === 0) {
    throw processError('Process Tool executable is invalid')
  }
  if (!isValidExecutable(executable)) {
    throw processError('Process Tool executable is invalid')
  }
  return executable
}

function normalizeNames(value: unknown): string[] {
  if (value === undefined) {
    throw processError('Process Tool names are required')
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw processError('Process Tool names are invalid')
  }
  const names = value.map((name) => {
    if (typeof name !== 'string' || !EXECUTABLE_NAME.test(name)) {
      throw processError('Process Tool names are invalid')
    }
    return name
  })
  if (new Set(names).size !== names.length) {
    throw processError('Process Tool names are duplicated')
  }
  return names
}

function isValidExecutable(executable: string): boolean {
  if (EXECUTABLE_NAME.test(executable)) return true
  return isAbsolute(executable) && EXECUTABLE_PATH.test(executable)
}

function normalizeArguments(input: JsonObject): string[] {
  if (input.args !== undefined || input.argv !== undefined) {
    throw processError(
      'Process Tool arguments must be provided as arguments'
    )
  }
  if (input.command !== undefined || input.cmd !== undefined) {
    throw processError(
      'Process Tool command strings are not supported; use executable and arguments'
    )
  }
  const value = input.arguments
  if (value === undefined) return []
  if (
    !Array.isArray(value) ||
    value.length > 1_000 ||
    value.some(
      (argument) =>
        typeof argument !== 'string' ||
        argument.includes('\0') ||
        Buffer.byteLength(argument) > 64 * 1024
    )
  ) {
    throw processError('Process Tool arguments are invalid')
  }
  return [...value] as string[]
}

function processError(message: string): ProcessToolError {
  return new ProcessToolError('process_arguments_invalid', message)
}
