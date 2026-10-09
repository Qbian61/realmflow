import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalWordSessionService } from '../files/local-word-session-service'
import { createWordToolHandlers } from './builtin-word-tool-handlers'

describe('builtin Word Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let sessions: Pick<LocalWordSessionService, 'open' | 'execute' | 'save'>

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-word-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(
      join(rootPath, 'report.docx'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04])
    )
    sessions = {
      open: vi.fn().mockResolvedValue(summary()),
      execute: vi.fn().mockResolvedValue({
        ...summary(),
        revision: 1,
        status: 'dirty',
        result: { replacements: 1 }
      }),
      save: vi.fn().mockResolvedValue({
        ...summary(),
        revision: 1
      })
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('registers every document operation as a dedicated handler', () => {
    expect(
      createWordToolHandlers({ sessions }).map(({ name }) => name)
    ).toEqual([
      'document.inspect',
      'document.find',
      'document.insert_blocks',
      'document.replace_text',
      'document.update_style',
      'document.update_layout',
      'document.table_insert',
      'document.table_write',
      'document.comment_add',
      'document.comment_delete',
      'document.save'
    ])
  })

  it('opens only an authorized DOCX path', async () => {
    await run('document.inspect', { path: 'report.docx', mode: 'edit' })

    expect(sessions.open).toHaveBeenCalledWith({
      canonicalPath: await realpath(join(rootPath, 'report.docx')),
      relativePath: 'report.docx',
      mode: 'edit',
      signal: expect.any(AbortSignal)
    })
    await expect(
      run('document.inspect', { path: '../report.docx' })
    ).rejects.toThrow('Path is outside the bound workspace')
  })

  it('forwards structural mutation parameters and expected revision', async () => {
    await run('document.replace_text', {
      sessionId: SESSION_ID,
      expectedRevision: 0,
      query: 'old',
      replacement: 'new'
    })

    expect(sessions.execute).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      expectedRevision: 0,
      operation: 'replace_text',
      parameters: { query: 'old', replacement: 'new' },
      signal: expect.any(AbortSignal)
    })
  })

  it('saves the exact document revision', async () => {
    await run('document.save', {
      sessionId: SESSION_ID,
      expectedRevision: 1
    })

    expect(sessions.save).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      expectedRevision: 1,
      signal: expect.any(AbortSignal)
    })
  })

  async function run(name: string, arguments_: JsonObject) {
    const handler = createWordToolHandlers({ sessions }).find(
      (candidate) => candidate.name === name
    )
    if (!handler) throw new Error(`Missing ${name} handler`)
    return handler.execute({
      arguments: arguments_,
      requestedBy: { type: 'model', id: 'model-1' },
      context: {
        owner: { type: 'conversation', id: 'conversation-1' },
        correlationId: 'correlation-1',
        causationId: 'command-1'
      },
      scopeRoots: [rootPath],
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }
})

const SESSION_ID = '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0'

function summary() {
  return {
    sessionId: SESSION_ID,
    path: 'report.docx',
    format: 'docx' as const,
    mode: 'edit' as const,
    revision: 0,
    status: 'ready' as const,
    sourceChecksum: 'a'.repeat(64),
    preservationRisk: [],
    inspection: { blocks: [] }
  }
}
