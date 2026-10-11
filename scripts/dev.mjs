import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_FORCE_IS_PACKAGED

const child = spawn(
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite',
  ['dev', ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env,
    detached: process.platform !== 'win32',
    stdio: 'inherit'
  }
)

child.once('exit', (code) => {
  process.exit(code ?? 1)
})

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    if (!child.pid || child.exitCode !== null) return
    if (process.platform === 'win32') {
      child.kill(signal)
    } else {
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
  })
}
