import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { OfficeSafeCopyService } from '../files/office-safe-copy-service'
import { createOfficeSafeCopyToolHandlers } from './builtin-office-safe-copy-tool-handlers'

describe('builtin Office safe-copy Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let safeCopy: Pick<OfficeSafeCopyService, 'create'>

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'realmflow-office-safe-copy-')
    )
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(join(rootPath, 'template.dotx'), OOXML_HEADER)
    await writeFile(join(rootPath, 'report.docm'), OOXML_HEADER)
    await writeFile(join(rootPath, 'notes.txt'), 'not Office')
    safeCopy = {
      create: vi.fn().mockResolvedValue({
        sourcePath: 'template.dotx',
        sourceFormat: 'dotx',
        sourceChecksum: 'a'.repeat(64),
        outputPath: 'template.docx',
        outputFormat: 'docx',
        outputChecksum: 'b'.repeat(64),
        macrosRemoved: false,
        templateMaterialized: true,
        removedParts: [],
        session: {
          sessionId: '77b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
          path: 'template.docx',
          format: 'docx',
          mode: 'edit',
          revision: 0,
          status: 'ready',
          sourceChecksum: 'b'.repeat(64)
        }
      })
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('registers one explicit safe-copy handler', () => {
    expect(
      createOfficeSafeCopyToolHandlers({ safeCopy }).map(({ name }) => name)
    ).toEqual(['office.create_safe_copy'])
  })

  it('materializes a template into an explicit authorized modern output', async () => {
    await run({
      path: 'template.dotx',
      expectedChecksum: sha256(OOXML_HEADER),
      outputPath: 'template.docx',
      expectedAbsent: true
    })

    expect(safeCopy.create).toHaveBeenCalledWith({
      sourceCanonicalPath: await realpath(join(rootPath, 'template.dotx')),
      sourceRelativePath: 'template.dotx',
      expectedSourceChecksum: sha256(OOXML_HEADER),
      outputCanonicalPath: join(await realpath(rootPath), 'template.docx'),
      outputRelativePath: 'template.docx',
      sourceFormat: 'dotx',
      confirmMacroRemoval: false,
      signal: expect.any(AbortSignal)
    })
  })

  it('passes explicit macro-removal confirmation', async () => {
    await run({
      path: 'report.docm',
      expectedChecksum: sha256(OOXML_HEADER),
      outputPath: 'safe/report.docx',
      expectedAbsent: true,
      confirmMacroRemoval: true
    })

    expect(safeCopy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFormat: 'docm',
        outputRelativePath: 'safe/report.docx',
        confirmMacroRemoval: true
      })
    )
  })

  it('rejects missing macro confirmation before delegation', async () => {
    await expect(run({
      path: 'report.docm',
      expectedChecksum: sha256(OOXML_HEADER),
      outputPath: 'report.docx',
      expectedAbsent: true
    })).rejects.toMatchObject({
      code: 'macro_removal_confirmation_required'
    })
    expect(safeCopy.create).not.toHaveBeenCalled()
  })

  it('rejects unsupported input, invalid confirmation, and escaped output', async () => {
    await expect(run({
      path: 'notes.txt',
      expectedChecksum: sha256('not Office'),
      outputPath: 'notes.docx',
      expectedAbsent: true
    })).rejects.toThrow(
      'Office safe copy requires a supported template or macro file'
    )
    await expect(
      run({
        path: 'template.dotx',
        expectedChecksum: sha256(OOXML_HEADER),
        outputPath: 'template.docx',
        expectedAbsent: true,
        confirmMacroRemoval: 'yes'
      })
    ).rejects.toThrow('Office safe copy confirmMacroRemoval is invalid')
    await expect(
      run({
        path: 'template.dotx',
        expectedChecksum: sha256(OOXML_HEADER),
        outputPath: '../template.docx',
        expectedAbsent: true
      })
    ).rejects.toThrow('Path is outside the bound workspace')
    expect(safeCopy.create).not.toHaveBeenCalled()
  })

  async function run(arguments_: JsonObject) {
    const handler = createOfficeSafeCopyToolHandlers({ safeCopy })[0]
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

const OOXML_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04])

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
