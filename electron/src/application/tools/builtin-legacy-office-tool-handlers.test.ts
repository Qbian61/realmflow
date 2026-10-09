import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LegacyOfficeImportService } from '../files/legacy-office-import-service'
import { createLegacyOfficeToolHandlers } from './builtin-legacy-office-tool-handlers'

describe('builtin legacy Office Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let importer: Pick<LegacyOfficeImportService, 'import'>

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'realmflow-legacy-office-')
    )
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(join(rootPath, 'report.doc'), LEGACY_OFFICE_HEADER)
    await writeFile(join(rootPath, 'notes.txt'), 'not Office')
    importer = {
      import: vi.fn().mockResolvedValue({
        sourcePath: 'report.doc',
        sourceFormat: 'doc',
        sourceChecksum: 'a'.repeat(64),
        outputPath: 'report.docx',
        outputFormat: 'docx',
        outputChecksum: 'b'.repeat(64),
        converter: 'LibreOffice',
        converted: true,
        session: {
          sessionId: '77b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
          path: 'report.docx',
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

  it('registers one explicit legacy Office import handler', () => {
    expect(
      createLegacyOfficeToolHandlers({ importer }).map(({ name }) => name)
    ).toEqual(['office.import_legacy'])
  })

  it('delegates an authorized input to an explicit modern output', async () => {
    await run({
      path: 'report.doc',
      expectedChecksum: sha256(LEGACY_OFFICE_HEADER),
      outputPath: 'report.docx',
      expectedAbsent: true
    })

    expect(importer.import).toHaveBeenCalledWith({
      sourceCanonicalPath: await realpath(join(rootPath, 'report.doc')),
      sourceRelativePath: 'report.doc',
      expectedSourceChecksum: sha256(LEGACY_OFFICE_HEADER),
      outputCanonicalPath: join(await realpath(rootPath), 'report.docx'),
      outputRelativePath: 'report.docx',
      sourceFormat: 'doc',
      signal: expect.any(AbortSignal)
    })
  })

  it('accepts a custom authorized output path with the required format', async () => {
    await run({
      path: 'report.doc',
      expectedChecksum: sha256(LEGACY_OFFICE_HEADER),
      outputPath: 'imports/converted.docx',
      expectedAbsent: true
    })

    expect(importer.import).toHaveBeenCalledWith(
      expect.objectContaining({
        outputCanonicalPath: join(
          await realpath(rootPath),
          'imports/converted.docx'
        ),
        outputRelativePath: 'imports/converted.docx'
      })
    )
    await expect(
      run({
        path: 'report.doc',
        expectedChecksum: sha256(LEGACY_OFFICE_HEADER),
        outputPath: '../converted.docx',
        expectedAbsent: true
      })
    ).rejects.toThrow('Path is outside the bound workspace')
  })

  it('rejects unsupported inputs and mismatched output extensions', async () => {
    await expect(run({
      path: 'notes.txt',
      expectedChecksum: sha256('not Office'),
      outputPath: 'notes.docx',
      expectedAbsent: true
    })).rejects.toThrow(
      'Legacy Office import requires a supported legacy Office file'
    )
    await expect(
      run({
        path: 'report.doc',
        expectedChecksum: sha256(LEGACY_OFFICE_HEADER),
        outputPath: 'report.xlsx',
        expectedAbsent: true
      })
    ).rejects.toThrow('Legacy Office output must use .docx')
    expect(importer.import).not.toHaveBeenCalled()
  })

  async function run(arguments_: JsonObject) {
    const handler = createLegacyOfficeToolHandlers({ importer })[0]
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

const LEGACY_OFFICE_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1
])

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
