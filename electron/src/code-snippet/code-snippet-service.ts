import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type {
  CodeSnippet,
  CodeSnippetRunResult,
  RunnableCodeLanguage
} from '../../../shared/code-snippet'
import {
  isRunnableCodeLanguage,
  normalizeCodeLanguage
} from '../../../shared/code-snippet'

const MAX_SOURCE_BYTES = 256 * 1024
const MAX_OUTPUT_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 5_000

const runtimes: Record<
  RunnableCodeLanguage,
  { executable: string; extension: string; args: (path: string) => string[] }
> = {
  javascript: {
    executable: process.execPath,
    extension: 'js',
    args: (path) => [path]
  },
  python: {
    executable: 'python3',
    extension: 'py',
    args: (path) => [path]
  },
  shell: {
    executable: '/bin/sh',
    extension: 'sh',
    args: (path) => [path]
  }
}

type SaveDialog = {
  showSaveDialog: (options: {
    defaultPath: string
    filters: Array<{ name: string; extensions: string[] }>
    properties: Array<'createDirectory' | 'showOverwriteConfirmation'>
  }) => Promise<{ canceled: boolean; filePath?: string }>
}

export class CodeSnippetService {
  constructor(
    private readonly dependencies: {
      dialog: SaveDialog
      timeoutMs?: number
    }
  ) {}

  async run(snippet: CodeSnippet): Promise<CodeSnippetRunResult> {
    this.assertSnippet(snippet)
    const language = normalizeCodeLanguage(snippet.language)
    if (!isRunnableCodeLanguage(language)) {
      throw new Error('Code language is not runnable')
    }

    const runtime = runtimes[language]
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-code-'))
    const sourcePath = join(directory, `snippet.${runtime.extension}`)
    const startedAt = Date.now()
    try {
      await writeFile(sourcePath, snippet.content, {
        encoding: 'utf8',
        mode: 0o600
      })
      return await this.spawnAndCapture(
        runtime.executable,
        runtime.args(sourcePath),
        directory,
        startedAt
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  async save(snippet: CodeSnippet): Promise<string | null> {
    this.assertSnippet(snippet)
    const language = normalizeCodeLanguage(snippet.language)
    const extension = extensionFor(language)
    const safeName = sanitizeFileName(snippet.suggestedName, extension)
    const selection = await this.dependencies.dialog.showSaveDialog({
      defaultPath: safeName,
      filters: [{ name: 'Code', extensions: [extension] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })
    if (selection.canceled || !selection.filePath) return null

    const targetPath = extname(selection.filePath)
      ? selection.filePath
      : `${selection.filePath}.${extension}`
    const temporaryPath = join(
      targetPath.slice(0, -basename(targetPath).length),
      `.${basename(targetPath)}.${randomUUID()}.tmp`
    )
    try {
      await writeFile(temporaryPath, snippet.content, {
        encoding: 'utf8',
        mode: 0o600
      })
      await rename(temporaryPath, targetPath)
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
    return targetPath
  }

  private assertSnippet(snippet: CodeSnippet): void {
    if (
      typeof snippet.content !== 'string' ||
      Buffer.byteLength(snippet.content, 'utf8') > MAX_SOURCE_BYTES
    ) {
      throw new Error('Code snippet is too large')
    }
    if (
      typeof snippet.language !== 'string' ||
      !snippet.language.trim() ||
      typeof snippet.suggestedName !== 'string' ||
      !snippet.suggestedName.trim()
    ) {
      throw new Error('Code snippet is invalid')
    }
  }

  private spawnAndCapture(
    executable: string,
    args: string[],
    cwd: string,
    startedAt: number
  ): Promise<CodeSnippetRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd,
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          ...(executable === process.execPath
            ? { ELECTRON_RUN_AS_NODE: '1' }
            : {})
        },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      let outputBytes = 0
      let timedOut = false
      let truncated = false
      let settled = false

      const capture = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
        const remaining = Math.max(0, MAX_OUTPUT_BYTES - outputBytes)
        if (remaining === 0) {
          truncated = true
          child.kill('SIGKILL')
          return
        }
        const accepted = chunk.subarray(0, remaining)
        outputBytes += accepted.byteLength
        if (accepted.byteLength < chunk.byteLength) {
          truncated = true
          child.kill('SIGKILL')
        }
        if (target === 'stdout') stdout += accepted.toString('utf8')
        else stderr += accepted.toString('utf8')
      }

      child.stdout.on('data', (chunk: Buffer) => capture('stdout', chunk))
      child.stderr.on('data', (chunk: Buffer) => capture('stderr', chunk))
      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (exitCode) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({
          exitCode,
          stdout,
          stderr,
          timedOut,
          truncated,
          durationMs: Date.now() - startedAt
        })
      })
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, this.dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    })
  }
}

function extensionFor(language: string): string {
  const extensions: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    shell: 'sh',
    java: 'java',
    json: 'json',
    html: 'html',
    css: 'css',
    markdown: 'md'
  }
  return extensions[language] ?? 'txt'
}

function sanitizeFileName(value: string, extension: string): string {
  const name = basename(value.trim()).replace(/[^\w.-]+/g, '-')
  if (!name || name === '.' || name === '..') return `snippet.${extension}`
  return extname(name) ? name : `${name}.${extension}`
}
