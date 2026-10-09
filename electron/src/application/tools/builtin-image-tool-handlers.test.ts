import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalImageSessionService } from '../files/local-image-session-service'
import { createImageToolHandlers } from './builtin-image-tool-handlers'

describe('builtin image Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let sessions: Pick<
    LocalImageSessionService,
    'open' | 'transform' | 'ocr' | 'save'
  >

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-image-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(
      join(rootPath, 'photo.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
    sessions = {
      open: vi.fn().mockResolvedValue(summary()),
      transform: vi.fn().mockResolvedValue({
        ...summary(),
        revision: 1,
        status: 'dirty',
        result: { operation: 'resize' }
      }),
      ocr: vi.fn().mockResolvedValue({
        sourceImage: 'photo.png',
        provider: 'local',
        language: 'eng',
        blocks: []
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

  it('registers every deterministic image operation as a dedicated handler', () => {
    expect(
      createImageToolHandlers({ sessions }).map(({ name }) => name)
    ).toEqual([
      'image.inspect',
      'image.ocr',
      'image.resize',
      'image.crop',
      'image.rotate',
      'image.compress',
      'image.convert',
      'image.composite',
      'image.redact',
      'image.remove_exif',
      'image.save'
    ])
  })

  it('opens only an authorized supported image path', async () => {
    await run('image.inspect', { path: 'photo.png', mode: 'edit' })

    expect(sessions.open).toHaveBeenCalledWith({
      canonicalPath: await realpath(join(rootPath, 'photo.png')),
      relativePath: 'photo.png',
      format: 'png',
      mode: 'edit',
      signal: expect.any(AbortSignal)
    })
    await expect(run('image.inspect', { path: '../photo.png' })).rejects.toThrow(
      'Path is outside the bound workspace'
    )
  })

  it('forwards deterministic transforms with an exact expected revision', async () => {
    await run('image.resize', {
      sessionId: SESSION_ID,
      expectedRevision: 0,
      width: 640,
      height: 480,
      fit: 'inside'
    })

    expect(sessions.transform).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      expectedRevision: 0,
      operation: 'resize',
      parameters: { width: 640, height: 480, fit: 'inside' },
      signal: expect.any(AbortSignal)
    })
  })

  it('derives model vision authorization only from trusted connector grants', async () => {
    await run(
      'image.ocr',
      {
        sessionId: SESSION_ID,
        language: 'eng',
        modelVisionAuthorized: true
      },
      []
    )
    expect(sessions.ocr).toHaveBeenLastCalledWith({
      sessionId: SESSION_ID,
      language: 'eng',
      modelVisionAuthorized: false,
      signal: expect.any(AbortSignal)
    })

    await run('image.ocr', { sessionId: SESSION_ID }, [
      {
        service: 'realmflow.model-vision',
        url: 'https://models.example/v1',
        token: 'secret'
      }
    ])
    expect(sessions.ocr).toHaveBeenLastCalledWith({
      sessionId: SESSION_ID,
      language: undefined,
      modelVisionAuthorized: true,
      signal: expect.any(AbortSignal)
    })
  })

  async function run(
    name: string,
    arguments_: JsonObject,
    connectorGrants: Array<{ service: string; url: string; token: string }> = []
  ) {
    const handler = createImageToolHandlers({ sessions }).find(
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
      connectorGrants,
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }
})

const SESSION_ID = '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0'

function summary() {
  return {
    sessionId: SESSION_ID,
    path: 'photo.png',
    format: 'png' as const,
    mode: 'edit' as const,
    revision: 0,
    status: 'ready' as const,
    sourceChecksum: 'a'.repeat(64),
    inspection: {
      format: 'png' as const,
      width: 40,
      height: 30,
      orientation: 1 as const,
      colorSpace: 'srgb',
      hasAlpha: true,
      animated: false,
      pages: 1,
      exif: {}
    }
  }
}
