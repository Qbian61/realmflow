import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('development process lifecycle', () => {
  it.skipIf(process.platform === 'win32')('forwards terminal stop to descendants', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-dev-signals-'))
    const runner = join(directory, 'electron-vite')
    await writeFile(runner, `#!${process.execPath}
const { spawn } = require('node:child_process')
console.log('runner-pid:' + process.pid)
const worker = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{console.log('worker-stopped');process.exit(0)});console.log('worker-ready');setInterval(()=>{},1000)"], { stdio: 'inherit' })
console.log('worker-pid:' + worker.pid)
process.on('SIGTERM', () => worker.once('exit',()=>process.exit(0)))
`, { mode: 0o755 })
    const child = spawn(process.execPath, [resolve('scripts/dev.mjs')], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let stderr = ''
    const stopped = new Promise<void>(resolve => {
      child.stdout.on('data', chunk => {
        output += String(chunk)
        if (output.includes('worker-ready') && !output.includes('stop-sent')) {
          output += 'stop-sent'
          child.kill('SIGTERM')
        }
        if (output.includes('worker-stopped')) resolve()
      })
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    try {
      await Promise.race([
        stopped,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timed out waiting for worker-stopped\nstdout:\n${output}\nstderr:\n${stderr}`)),
            5000
          )
        )
      ])
      expect(output).toContain('worker-stopped')
    } finally {
      // The fixture is isolated from all application processes.
      child.kill('SIGKILL')
      for (const match of output.matchAll(/(?:runner|worker)-pid:(\d+)/g)) {
        try { process.kill(Number(match[1]), 'SIGKILL') } catch {}
      }
      await rm(directory, { recursive: true, force: true })
    }
  })
})
