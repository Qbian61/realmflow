import { randomUUID } from 'node:crypto'
import { spawn as spawnPty } from 'node-pty'
import { IPC_EVENT_CHANNELS } from '../../../shared/ipc-contract'
import type {
  TerminalDimensions,
  TerminalEvent,
  TerminalSession
} from '../../../shared/terminal'
import type { WorkspaceService } from '../workspace/workspace-service'

type TerminalSender = {
  id: number
  send: (channel: string, event: TerminalEvent) => void
}

type TerminalProcess = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (listener: (data: string) => void) => { dispose: () => void }
  onExit: (
    listener: (event: { exitCode: number }) => void
  ) => { dispose: () => void }
}

type TerminalSpawner = (
  file: string,
  args: string[],
  options: {
    name: string
    cols: number
    rows: number
    cwd: string
    env: Record<string, string>
  }
) => TerminalProcess

type TerminalManagerDependencies = {
  workspace: Pick<WorkspaceService, 'resolveTerminalBinding'>
  spawn?: TerminalSpawner
  shell?: string
  env?: NodeJS.ProcessEnv
}

type ManagedTerminal = {
  ownerId: number
  process: TerminalProcess
  disposables: Array<{ dispose: () => void }>
}

const MAX_INPUT_LENGTH = 64 * 1024

export class TerminalManager {
  private readonly sessions = new Map<string, ManagedTerminal>()
  private readonly spawn: TerminalSpawner
  private readonly shell: string
  private readonly env: Record<string, string>

  constructor(private readonly dependencies: TerminalManagerDependencies) {
    this.spawn = dependencies.spawn ?? (spawnPty as TerminalSpawner)
    this.shell =
      dependencies.shell ??
      process.env.SHELL ??
      (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')
    this.env = Object.fromEntries(
      Object.entries(dependencies.env ?? process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  }

  async create(
    sender: TerminalSender,
    workspaceId: string,
    dimensions: TerminalDimensions
  ): Promise<TerminalSession> {
    this.assertDimensions(dimensions)
    const binding =
      await this.dependencies.workspace.resolveTerminalBinding(workspaceId)
    const id = `terminal-${randomUUID()}`
    const process = this.spawn(this.shell, [], {
      name: 'xterm-256color',
      cols: dimensions.cols,
      rows: dimensions.rows,
      cwd: binding.rootPath,
      env: {
        ...this.env,
        TERM: 'xterm-256color'
      }
    })
    const managed: ManagedTerminal = {
      ownerId: sender.id,
      process,
      disposables: []
    }
    managed.disposables.push(
      process.onData((data) => {
        sender.send(IPC_EVENT_CHANNELS.terminalEvent, {
          sessionId: id,
          type: 'data',
          data
        })
      }),
      process.onExit(({ exitCode }) => {
        sender.send(IPC_EVENT_CHANNELS.terminalEvent, {
          sessionId: id,
          type: 'exit',
          exitCode
        })
        this.disposeSession(id, false)
      })
    )
    this.sessions.set(id, managed)
    return {
      id,
      title: `终端 · ${binding.rootName}`,
      cwd: binding.rootPath
    }
  }

  async write(ownerId: number, sessionId: string, data: string): Promise<void> {
    if (data.length > MAX_INPUT_LENGTH) {
      throw new Error('Terminal input is too large')
    }
    this.requireOwnedSession(ownerId, sessionId).process.write(data)
  }

  async resize(
    ownerId: number,
    sessionId: string,
    dimensions: TerminalDimensions
  ): Promise<void> {
    this.assertDimensions(dimensions)
    this.requireOwnedSession(ownerId, sessionId).process.resize(
      dimensions.cols,
      dimensions.rows
    )
  }

  async destroy(ownerId: number, sessionId: string): Promise<void> {
    this.requireOwnedSession(ownerId, sessionId)
    this.disposeSession(sessionId, true)
  }

  disposeOwner(ownerId: number): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.ownerId === ownerId) this.disposeSession(sessionId, true)
    }
  }

  dispose(): void {
    for (const sessionId of this.sessions.keys()) {
      this.disposeSession(sessionId, true)
    }
  }

  private requireOwnedSession(
    ownerId: number,
    sessionId: string
  ): ManagedTerminal {
    const session = this.sessions.get(sessionId)
    if (!session || session.ownerId !== ownerId) {
      throw new Error('Terminal session is not available')
    }
    return session
  }

  private disposeSession(sessionId: string, kill: boolean): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)
    for (const disposable of session.disposables) disposable.dispose()
    if (kill) session.process.kill()
  }

  private assertDimensions({ cols, rows }: TerminalDimensions): void {
    if (
      !Number.isInteger(cols) ||
      !Number.isInteger(rows) ||
      cols < 2 ||
      cols > 500 ||
      rows < 1 ||
      rows > 300
    ) {
      throw new Error('Terminal dimensions are invalid')
    }
  }
}
