import { vi } from 'vitest'
import { TerminalManager } from './terminal-manager'

describe('TerminalManager', () => {
  it('starts a shell in an authorized folder and forwards terminal traffic', async () => {
    let emitData: ((data: string) => void) | undefined
    let emitExit: ((event: { exitCode: number }) => void) | undefined
    const process = {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn((listener: (data: string) => void) => {
        emitData = listener
        return { dispose: vi.fn() }
      }),
      onExit: vi.fn((listener: (event: { exitCode: number }) => void) => {
        emitExit = listener
        return { dispose: vi.fn() }
      })
    }
    const workspace = {
      resolveTerminalBinding: vi.fn().mockResolvedValue({
        requirementId: 'session-folder',
        rootName: 'project',
        rootPath: '/tmp/project'
      })
    }
    const spawn = vi.fn().mockReturnValue(process)
    const sender = { id: 7, send: vi.fn() }
    const manager = new TerminalManager({
      workspace,
      spawn,
      shell: '/bin/zsh',
      env: { PATH: '/usr/bin' }
    })

    const session = await manager.create(sender, 'session-folder', {
      cols: 100,
      rows: 30
    })

    expect(workspace.resolveTerminalBinding).toHaveBeenCalledWith('session-folder')
    expect(spawn).toHaveBeenCalledWith('/bin/zsh', [], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: '/tmp/project',
      env: { PATH: '/usr/bin', TERM: 'xterm-256color' }
    })
    expect(session).toMatchObject({
      title: '终端 · project',
      cwd: '/tmp/project'
    })

    await manager.write(7, session.id, 'pwd\r')
    await manager.resize(7, session.id, { cols: 120, rows: 40 })
    expect(process.write).toHaveBeenCalledWith('pwd\r')
    expect(process.resize).toHaveBeenCalledWith(120, 40)

    emitData?.('project % ')
    expect(sender.send).toHaveBeenCalledWith('terminal:event', {
      sessionId: session.id,
      type: 'data',
      data: 'project % '
    })

    emitExit?.({ exitCode: 0 })
    expect(sender.send).toHaveBeenCalledWith('terminal:event', {
      sessionId: session.id,
      type: 'exit',
      exitCode: 0
    })
  })

  it('rejects access from another renderer and disposes owned sessions', async () => {
    const process = {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onExit: vi.fn(() => ({ dispose: vi.fn() }))
    }
    const manager = new TerminalManager({
      workspace: {
        resolveTerminalBinding: vi.fn().mockResolvedValue({
          requirementId: 'session-folder',
          rootName: 'project',
          rootPath: '/tmp/project'
        })
      },
      spawn: vi.fn().mockReturnValue(process),
      shell: '/bin/zsh',
      env: {}
    })
    const session = await manager.create(
      { id: 7, send: vi.fn() },
      'session-folder',
      { cols: 80, rows: 24 }
    )

    await expect(manager.write(8, session.id, 'ls\r')).rejects.toThrow(
      'Terminal session is not available'
    )

    manager.disposeOwner(7)
    expect(process.kill).toHaveBeenCalledTimes(1)
  })
})
