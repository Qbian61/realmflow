import { constants } from 'node:fs'
import { access, realpath } from 'node:fs/promises'
import { dirname } from 'node:path'

export type SandboxedCommand = {
  executable: string
  arguments: string[]
}

export type SandboxCommandPort = {
  wrap(input: {
    executable: string
    arguments: string[]
    cwd: string
  }): Promise<SandboxedCommand>
}

export class SandboxUnavailableError extends Error {
  readonly code = 'tool_sandbox_unavailable'

  constructor() {
    super('OS process isolation is unavailable')
  }
}

export class PlatformSandboxDriver implements SandboxCommandPort {
  private readonly platform: NodeJS.Platform
  private readonly sandboxExecutable: string | null

  constructor(
    options: {
      platform?: NodeJS.Platform
      sandboxExecutable?: string | null
    } = {}
  ) {
    this.platform = options.platform ?? process.platform
    this.sandboxExecutable =
      options.sandboxExecutable === undefined
        ? defaultSandboxExecutable(this.platform)
        : options.sandboxExecutable
  }

  async wrap(input: {
    executable: string
    arguments: string[]
    cwd: string
  }): Promise<SandboxedCommand> {
    if (!this.sandboxExecutable) throw new SandboxUnavailableError()
    await access(this.sandboxExecutable, constants.X_OK).catch(() => {
      throw new SandboxUnavailableError()
    })
    const executable = await realpath(input.executable)
    const cwd = await realpath(input.cwd)
    if (this.platform === 'darwin') {
      return macOsCommand(
        this.sandboxExecutable,
        executable,
        input.arguments,
        cwd
      )
    }
    if (this.platform === 'linux') {
      return linuxCommand(
        this.sandboxExecutable,
        executable,
        input.arguments,
        cwd
      )
    }
    throw new SandboxUnavailableError()
  }
}

function defaultSandboxExecutable(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') return '/usr/bin/sandbox-exec'
  if (platform === 'linux') return '/usr/bin/bwrap'
  return null
}

function macOsCommand(
  sandboxExecutable: string,
  executable: string,
  arguments_: string[],
  cwd: string
): SandboxedCommand {
  const readableRoots = [
    '/System',
    '/usr',
    '/bin',
    '/sbin',
    '/dev',
    dirname(dirname(executable)),
    cwd
  ]
  const profile = [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(deny file-read*)',
    '(deny file-write*)',
    '(allow file-read-data (literal "/"))',
    '(allow file-read-metadata)',
    ...[...new Set(readableRoots)].map(
      (path) => `(allow file-read* (subpath ${JSON.stringify(path)}))`
    ),
    `(allow file-write* (subpath ${JSON.stringify(cwd)}))`
  ].join('\n')
  return {
    executable: sandboxExecutable,
    arguments: ['-p', profile, executable, ...arguments_]
  }
}

function linuxCommand(
  sandboxExecutable: string,
  executable: string,
  arguments_: string[],
  cwd: string
): SandboxedCommand {
  const argumentsList = [
    '--die-with-parent',
    '--new-session',
    '--unshare-net',
    '--unshare-pid',
    '--proc',
    '/proc',
    '--dev',
    '/dev'
  ]
  argumentsList.push('--ro-bind', '/usr', '/usr')
  for (const root of ['/bin', '/sbin', '/lib', '/lib64', '/etc']) {
    argumentsList.push('--ro-bind-try', root, root)
  }
  for (const directory of parentDirectories(cwd)) {
    argumentsList.push('--dir', directory)
  }
  argumentsList.push(
    '--bind',
    cwd,
    cwd,
    '--chdir',
    cwd,
    '--',
    executable,
    ...arguments_
  )
  return { executable: sandboxExecutable, arguments: argumentsList }
}

function parentDirectories(path: string): string[] {
  const result: string[] = []
  let current = dirname(path)
  while (current !== '/' && current !== '.') {
    result.unshift(current)
    current = dirname(current)
  }
  return result
}
