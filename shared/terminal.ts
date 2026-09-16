export type TerminalDimensions = {
  cols: number
  rows: number
}

export type TerminalSession = {
  id: string
  title: string
  cwd: string
}

export type TerminalEvent =
  | {
      sessionId: string
      type: 'data'
      data: string
    }
  | {
      sessionId: string
      type: 'exit'
      exitCode: number
    }

export interface TerminalApi {
  create: (
    workspaceId: string,
    dimensions: TerminalDimensions
  ) => Promise<TerminalSession>
  write: (sessionId: string, data: string) => Promise<void>
  resize: (
    sessionId: string,
    dimensions: TerminalDimensions
  ) => Promise<void>
  destroy: (sessionId: string) => Promise<void>
  onEvent: (listener: (event: TerminalEvent) => void) => () => void
}
