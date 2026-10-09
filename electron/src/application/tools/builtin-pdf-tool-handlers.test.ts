import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalPdfSessionService } from '../files/local-pdf-session-service'
import { createPdfToolHandlers } from './builtin-pdf-tool-handlers'

describe('builtin PDF Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let sessions: Pick<
    LocalPdfSessionService,
    'open' | 'thumbnail' | 'ocr' | 'mutate' | 'save'
  >

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-pdf-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(join(rootPath, 'source.pdf'), '%PDF-1.7 source')
    await writeFile(join(rootPath, 'append.pdf'), '%PDF-1.7 append')
    sessions = {
      open: vi.fn().mockResolvedValue(summary()),
      thumbnail: vi.fn().mockResolvedValue({
        sourcePdf: 'source.pdf',
        sourcePage: 1,
        mimeType: 'image/png',
        width: 100,
        height: 80,
        contentBase64: 'cG5n'
      }),
      ocr: vi.fn().mockResolvedValue({
        sourcePdf: 'source.pdf',
        sourcePage: 1,
        provider: 'local',
        language: 'eng',
        blocks: []
      }),
      mutate: vi.fn().mockResolvedValue({
        ...summary(),
        revision: 1,
        status: 'dirty',
        result: { operation: 'merge' }
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

  it('registers every PDF operation as a dedicated handler', () => {
    expect(createPdfToolHandlers({ sessions }).map(({ name }) => name)).toEqual([
      'pdf.inspect',
      'pdf.thumbnail',
      'pdf.ocr',
      'pdf.merge',
      'pdf.split',
      'pdf.rotate',
      'pdf.watermark',
      'pdf.form_fill',
      'pdf.annotation_add',
      'pdf.save'
    ])
  })

  it('opens only an authorized PDF path', async () => {
    await run('pdf.inspect', { path: 'source.pdf', mode: 'edit' })

    expect(sessions.open).toHaveBeenCalledWith({
      canonicalPath: await realpath(join(rootPath, 'source.pdf')),
      relativePath: 'source.pdf',
      mode: 'edit',
      signal: expect.any(AbortSignal)
    })
    await expect(run('pdf.inspect', { path: '../source.pdf' })).rejects.toThrow(
      'Path is outside the bound workspace'
    )
  })

  it('opens a PDF from a relative scopeRoot under the single authorized root', async () => {
    await mkdir(join(rootPath, 'out'))
    await writeFile(join(rootPath, 'out', 'resume.pdf'), '%PDF-1.7 resume')

    await run('pdf.inspect', {
      path: 'out/resume.pdf',
      scopeRoot: 'out',
      mode: 'read'
    })

    expect(sessions.open).toHaveBeenCalledWith({
      canonicalPath: await realpath(join(rootPath, 'out', 'resume.pdf')),
      relativePath: 'out/resume.pdf',
      mode: 'read',
      signal: expect.any(AbortSignal)
    })
  })

  it('resolves every merge source before passing bytes into Main session state', async () => {
    await run('pdf.merge', {
      sessionId: SESSION_ID,
      expectedRevision: 0,
      paths: ['append.pdf']
    })

    expect(sessions.mutate).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      expectedRevision: 0,
      operation: 'merge',
      parameters: {
        sources: [Buffer.from('%PDF-1.7 append')],
        sourcePaths: ['append.pdf']
      },
      signal: expect.any(AbortSignal)
    })
  })

  it('forwards page reads and exact revisioned mutations', async () => {
    await run('pdf.thumbnail', {
      sessionId: SESSION_ID,
      pageNumber: 2,
      maxDimension: 640
    })
    await run('pdf.rotate', {
      sessionId: SESSION_ID,
      expectedRevision: 0,
      pageNumbers: [1, 2],
      angle: 90
    })

    expect(sessions.thumbnail).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      pageNumber: 2,
      maxDimension: 640,
      signal: expect.any(AbortSignal)
    })
    expect(sessions.mutate).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      expectedRevision: 0,
      operation: 'rotate',
      parameters: { pageNumbers: [1, 2], angle: 90 },
      signal: expect.any(AbortSignal)
    })
  })

  async function run(name: string, arguments_: JsonObject) {
    const handler = createPdfToolHandlers({ sessions }).find(
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
    path: 'source.pdf',
    format: 'pdf' as const,
    mode: 'edit' as const,
    revision: 0,
    status: 'ready' as const,
    sourceChecksum: 'a'.repeat(64),
    inspection: {
      pageCount: 1,
      encrypted: false,
      signed: false,
      pages: [],
      forms: [],
      annotations: []
    }
  }
}
