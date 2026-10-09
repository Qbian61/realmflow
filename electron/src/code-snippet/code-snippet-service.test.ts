import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeSnippetService } from './code-snippet-service'

describe('CodeSnippetService', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-code-test-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('runs JavaScript without shell interpolation and returns captured output', async () => {
    const service = new CodeSnippetService({
      dialog: { showSaveDialog: vi.fn() }
    })

    const result = await service.run({
      language: 'javascript',
      content: 'console.log("ready")',
      suggestedName: 'snippet.js'
    })

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: 'ready\n',
      stderr: '',
      timedOut: false,
      truncated: false
    })
  })

  it('rejects unsupported languages and oversized source before spawning', async () => {
    const service = new CodeSnippetService({
      dialog: { showSaveDialog: vi.fn() }
    })

    await expect(
      service.run({
        language: 'typescript',
        content: 'const answer: number = 42',
        suggestedName: 'snippet.ts'
      })
    ).rejects.toThrow('Code language is not runnable')
    await expect(
      service.run({
        language: 'javascript',
        content: 'x'.repeat(256 * 1024 + 1),
        suggestedName: 'snippet.js'
      })
    ).rejects.toThrow('Code snippet is too large')
  })

  it('terminates code that exceeds the execution timeout', async () => {
    const service = new CodeSnippetService({
      dialog: { showSaveDialog: vi.fn() },
      timeoutMs: 100
    })

    const result = await service.run({
      language: 'javascript',
      content: 'setInterval(() => undefined, 1000)',
      suggestedName: 'snippet.js'
    })

    expect(result.timedOut).toBe(true)
    expect(result.exitCode).not.toBe(0)
  })

  it('uses a save dialog and atomically writes the selected file', async () => {
    const targetPath = join(directory, 'answer.py')
    const showSaveDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: targetPath
    })
    const service = new CodeSnippetService({
      dialog: { showSaveDialog }
    })

    await expect(
      service.save({
        language: 'python',
        content: 'print("saved")\n',
        suggestedName: '../answer.py'
      })
    ).resolves.toBe(targetPath)
    await expect(readFile(targetPath, 'utf8')).resolves.toBe(
      'print("saved")\n'
    )
    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'answer.py' })
    )
  })
})
