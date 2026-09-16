import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_FORCE_IS_PACKAGED

const child = spawn(
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite',
  ['dev', ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env,
    stdio: 'inherit'
  }
)

child.once('exit', (code) => {
  process.exit(code ?? 1)
})
