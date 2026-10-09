import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { FixedLayoutService } from '../files/fixed-layout-service'
import { createFixedLayoutToolHandlers } from './builtin-fixed-layout-tool-handlers'

describe('builtin fixed-layout Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let fixedLayout: Pick<FixedLayoutService, 'inspect' | 'ocr'>

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-ofd-tool-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(join(rootPath, 'invoice.ofd'), ZIP_HEADER)
    await writeFile(join(rootPath, 'archive.zip'), ZIP_HEADER)
    fixedLayout = {
      inspect: vi.fn().mockResolvedValue({
        sourcePath: 'invoice.ofd',
        sourceChecksum: 'a'.repeat(64),
        format: 'ofd',
        metadata: {},
        pages: [],
        pageCount: 0,
        characterCount: 0,
        ocrRequired: true
      }),
      ocr: vi.fn().mockResolvedValue({
        sourceOfd: 'invoice.ofd',
        sourcePage: 1,
        provider: 'local',
        language: 'eng',
        blocks: []
      })
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('registers inspect and local OCR handlers', () => {
    expect(
      createFixedLayoutToolHandlers({ fixedLayout }).map(({ name }) => name)
    ).toEqual(['fixed_layout.inspect', 'fixed_layout.ocr'])
  })

  it('recognizes an authorized OFD page with local OCR', async () => {
    await run({
      path: 'invoice.ofd',
      pageNumber: 1,
      language: 'eng',
      maxDimension: 1200
    })

    expect(fixedLayout.ocr).toHaveBeenCalledWith({
      sourceCanonicalPath: expect.stringMatching(/invoice\.ofd$/),
      sourceRelativePath: 'invoice.ofd',
      pageNumber: 1,
      language: 'eng',
      maxDimension: 1200,
      signal: expect.any(AbortSignal)
    })
  })

  it('inspects an authorized OFD for a model request', async () => {
    await run({ path: 'invoice.ofd' })

    expect(fixedLayout.inspect).toHaveBeenCalledWith({
      sourceCanonicalPath: expect.stringMatching(/invoice\.ofd$/),
      sourceRelativePath: 'invoice.ofd',
      signal: expect.any(AbortSignal)
    })
  })

  it('rejects non-OFD and escaped paths before parsing', async () => {
    await expect(run({ path: 'archive.zip' })).rejects.toThrow(
      'Fixed-layout inspection requires an OFD file'
    )
    await expect(run({ path: '../invoice.ofd' })).rejects.toThrow(
      'Path is outside the bound workspace'
    )
    expect(fixedLayout.inspect).not.toHaveBeenCalled()
  })

  async function run(arguments_: JsonObject) {
    const name =
      typeof arguments_.pageNumber === 'number'
        ? 'fixed_layout.ocr'
        : 'fixed_layout.inspect'
    const handler = createFixedLayoutToolHandlers({ fixedLayout }).find(
      (candidate) => candidate.name === name
    )
    if (!handler) throw new Error(`Missing ${name}`)
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

const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04])
