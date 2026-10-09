import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalPresentationSessionService } from '../files/local-presentation-session-service'
import { createPresentationToolHandlers } from './builtin-presentation-tool-handlers'

describe('builtin Presentation Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let sessions: Pick<
    LocalPresentationSessionService,
    'open' | 'execute' | 'save'
  >

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-pptx-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(
      join(rootPath, 'deck.pptx'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04])
    )
    await writeFile(join(rootPath, 'replacement.png'), PNG_HEADER)
    sessions = {
      open: vi.fn().mockResolvedValue(summary()),
      execute: vi.fn().mockResolvedValue({
        ...summary(),
        revision: 1,
        status: 'dirty',
        result: { shapeId: 'shape-256-2' }
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

  it('registers every presentation operation as a dedicated handler', () => {
    expect(
      createPresentationToolHandlers({ sessions }).map(({ name }) => name)
    ).toEqual([
      'presentation.inspect',
      'presentation.update_text',
      'presentation.replace_image',
      'presentation.table_write',
      'presentation.chart_write',
      'presentation.add_slide',
      'presentation.copy_slide',
      'presentation.delete_slide',
      'presentation.reorder_slide',
      'presentation.add_text',
      'presentation.add_image',
      'presentation.add_table',
      'presentation.add_chart',
      'presentation.reorder_shape',
      'presentation.update_size',
      'presentation.save'
    ])
  })

  it('opens only an authorized PPTX path', async () => {
    await run('presentation.inspect', { path: 'deck.pptx', mode: 'edit' })

    expect(sessions.open).toHaveBeenCalledWith({
      canonicalPath: await realpath(join(rootPath, 'deck.pptx')),
      relativePath: 'deck.pptx',
      mode: 'edit',
      signal: expect.any(AbortSignal)
    })
    await expect(
      run('presentation.inspect', { path: '../deck.pptx' })
    ).rejects.toThrow('Path is outside the bound workspace')
  })

  it('materializes authorized image paths before invoking the Sidecar', async () => {
    await run('presentation.replace_image', {
      sessionId: SESSION_ID,
      expectedRevision: 0,
      shapeId: 'shape-256-2',
      imagePath: 'replacement.png'
    })

    expect(sessions.execute).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      expectedRevision: 0,
      operation: 'replace_image',
      parameters: {
        shapeId: 'shape-256-2',
        imageBase64: PNG_HEADER.toString('base64')
      },
      signal: expect.any(AbortSignal)
    })
    await expect(
      run('presentation.add_image', {
        sessionId: SESSION_ID,
        expectedRevision: 0,
        slideId: 'slide-256',
        imagePath: '../secret.png',
        bounds: {
          leftPt: 0,
          topPt: 0,
          widthPt: 72,
          heightPt: 72
        }
      })
    ).rejects.toThrow('Path is outside the bound workspace')
  })

  it('forwards mutations with an exact expected revision', async () => {
    await run('presentation.update_text', {
      sessionId: SESSION_ID,
      expectedRevision: 0,
      shapeId: 'shape-256-2',
      text: 'Updated'
    })

    expect(sessions.execute).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      expectedRevision: 0,
      operation: 'update_text',
      parameters: { shapeId: 'shape-256-2', text: 'Updated' },
      signal: expect.any(AbortSignal)
    })
  })

  it('saves the exact presentation revision', async () => {
    await run('presentation.save', {
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
    const handler = createPresentationToolHandlers({ sessions }).find(
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

const SESSION_ID = '77b32dd6-8e27-45a8-a8f3-57407e2fc8b0'
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
])

function summary() {
  return {
    sessionId: SESSION_ID,
    path: 'deck.pptx',
    format: 'pptx' as const,
    mode: 'edit' as const,
    revision: 0,
    status: 'ready' as const,
    sourceChecksum: 'a'.repeat(64),
    preservationRisk: [],
    inspection: { slides: [] }
  }
}
