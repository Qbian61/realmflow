import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentDeliveryService } from './document-delivery-service'
import { NodeSpreadsheetSessionStorage } from './node-spreadsheet-session-storage'
import { openRealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteDocumentDeliveryRepository } from '../../infrastructure/sqlite/document-delivery-repository'

describe('DocumentDeliveryService', () => {
  let directory: string
  let root: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-delivery-'))
    root = join(directory, 'workspace')
    await mkdir(root)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('creates, exports, and verifies real temporary files', async () => {
    const docx = Buffer.from('deterministic-docx')
    const pdf = Buffer.from('%PDF-1.7 deterministic-pdf')
    const engine = {
      createDocument: vi.fn().mockResolvedValue(
        sidecarArtifact('docx', docx, null)
      ),
      exportDocumentPdf: vi.fn().mockResolvedValue(
        sidecarArtifact('pdf', pdf, 1, {
          converter: 'cupsfilter_text',
          quality: 'degraded_text',
          warnings: [
            'PDF was generated from extracted plain text; original DOCX layout was not preserved.'
          ]
        })
      ),
      verifyDocumentArtifact: vi.fn(async ({ documentBase64, format }) => {
        const bytes = Buffer.from(documentBase64, 'base64')
        return {
          valid: true as const,
          format,
          byteSize: bytes.byteLength,
          checksum: checksum(bytes),
          pageCount: format === 'pdf' ? 1 : null
        }
      })
    }
    const service = new DocumentDeliveryService({
      engine,
      storage: storage(directory)
    })
    const signal = new AbortController().signal
    const docxPath = join(root, 'report.docx')
    const pdfPath = join(root, 'report.pdf')

    const created = await service.create({
      outputCanonicalPath: docxPath,
      outputRelativePath: 'report.docx',
      document: {
        title: 'Delivery report',
        blocks: [{ kind: 'paragraph', text: 'Ready.' }]
      },
      signal
    })
    const exported = await service.exportPdf({
      sourceCanonicalPath: docxPath,
      sourceRelativePath: 'report.docx',
      sourceChecksum: created.checksum,
      outputCanonicalPath: pdfPath,
      outputRelativePath: 'report.pdf',
      signal
    })
    const verified = await service.verify({
      canonicalPath: pdfPath,
      relativePath: 'report.pdf',
      format: 'pdf',
      expectedChecksum: exported.checksum,
      minimumByteSize: pdf.byteLength,
      minimumPageCount: 1,
      signal
    })

    expect(await readFile(docxPath)).toEqual(docx)
    expect(await readFile(pdfPath)).toEqual(pdf)
    expect(created).toEqual({
      path: 'report.docx',
      format: 'docx',
      byteSize: docx.byteLength,
      checksum: checksum(docx)
    })
    expect(exported).toEqual({
      path: 'report.pdf',
      format: 'pdf',
      byteSize: pdf.byteLength,
      checksum: checksum(pdf),
      pageCount: 1,
      converter: 'cupsfilter_text',
      quality: 'degraded_text',
      warnings: [
        'PDF was generated from extracted plain text; original DOCX layout was not preserved.'
      ]
    })
    expect(verified).toEqual({
      path: 'report.pdf',
      format: 'pdf',
      byteSize: pdf.byteLength,
      checksum: checksum(pdf),
      pageCount: 1,
      verified: true
    })
    expect(engine.exportDocumentPdf).toHaveBeenCalledWith(
      { documentBase64: docx.toString('base64') },
      signal
    )
  })

  it('rejects source conflicts, occupied outputs, and failed acceptance', async () => {
    const source = Buffer.from('source')
    const pdf = Buffer.from('%PDF')
    const sourcePath = join(root, 'source.docx')
    const outputPath = join(root, 'result.pdf')
    await writeFile(sourcePath, source)
    await writeFile(outputPath, 'existing')
    const engine = {
      createDocument: vi.fn(),
      exportDocumentPdf: vi.fn().mockResolvedValue(
        sidecarArtifact('pdf', pdf, 1)
      ),
      verifyDocumentArtifact: vi.fn().mockResolvedValue({
        valid: true,
        format: 'pdf',
        byteSize: pdf.byteLength,
        checksum: checksum(pdf),
        pageCount: 1
      })
    }
    const service = new DocumentDeliveryService({
      engine,
      storage: storage(directory)
    })
    const signal = new AbortController().signal

    await expect(
      service.exportPdf({
        sourceCanonicalPath: sourcePath,
        sourceRelativePath: 'source.docx',
        sourceChecksum: `sha256:${'0'.repeat(64)}`,
        outputCanonicalPath: join(root, 'other.pdf'),
        outputRelativePath: 'other.pdf',
        signal
      })
    ).rejects.toMatchObject({ code: 'document_source_conflict' })
    await expect(
      service.exportPdf({
        sourceCanonicalPath: sourcePath,
        sourceRelativePath: 'source.docx',
        sourceChecksum: checksum(source),
        outputCanonicalPath: outputPath,
        outputRelativePath: 'result.pdf',
        signal
      })
    ).rejects.toMatchObject({ code: 'document_output_conflict' })
    await expect(
      service.verify({
        canonicalPath: sourcePath,
        relativePath: 'source.docx',
        format: 'docx',
        minimumByteSize: source.byteLength + 1,
        signal
      })
    ).rejects.toMatchObject({ code: 'artifact_verification_failed' })
    expect(engine.exportDocumentPdf).not.toHaveBeenCalled()
  })

  it('recovers a file committed before the verification receipt after restart', async () => {
    const bytes = Buffer.from('recoverable-docx')
    const databasePath = join(directory, 'realmflow.db')
    let database = openRealmFlowDatabase(databasePath)
    const journal = new SqliteDocumentDeliveryRepository(database)
    const engine = {
      createDocument: vi.fn().mockResolvedValue(
        sidecarArtifact('docx', bytes, null)
      ),
      exportDocumentPdf: vi.fn(),
      verifyDocumentArtifact: vi.fn(async ({ documentBase64, format }) => {
        const document = Buffer.from(documentBase64, 'base64')
        return {
          valid: true as const,
          format,
          byteSize: document.byteLength,
          checksum: checksum(document),
          pageCount: null
        }
      })
    }
    const service = new DocumentDeliveryService({
      engine,
      storage: storage(directory),
      journal,
      now: () => 20,
      afterFileCommit: vi.fn().mockRejectedValueOnce(
        new Error('simulated process interruption')
      )
    })
    const outputPath = join(root, 'recover.docx')
    const input = {
      outputCanonicalPath: outputPath,
      outputRelativePath: 'recover.docx',
      document: {
        title: 'Recovery',
        blocks: [{ kind: 'paragraph' as const, text: 'Recovered.' }]
      },
      operation: {
        requestId: 'request-recover',
        scopeRoot: root
      },
      signal: new AbortController().signal
    }

    await expect(service.create(input)).rejects.toThrow(
      'simulated process interruption'
    )
    await expect(readFile(outputPath)).resolves.toEqual(bytes)
    await expect(journal.listPending()).resolves.toHaveLength(1)
    database.close()

    database = openRealmFlowDatabase(databasePath)
    const reopenedJournal = new SqliteDocumentDeliveryRepository(database)
    const recovered = new DocumentDeliveryService({
      engine,
      storage: storage(directory),
      journal: reopenedJournal,
      now: () => 30
    })

    await recovered.recover()

    await expect(reopenedJournal.listPending()).resolves.toEqual([])
    await expect(
      reopenedJournal.getReceipt('request-recover')
    ).resolves.toMatchObject({
      receipt: {
        status: 'succeeded',
        artifact: {
          path: 'recover.docx',
          checksum: checksum(bytes)
        }
      }
    })
    await expect(recovered.create(input)).resolves.toMatchObject({
      path: 'recover.docx',
      checksum: checksum(bytes)
    })
    expect(engine.createDocument).toHaveBeenCalledTimes(1)
    database.close()
  })
})

function storage(directory: string) {
  return new NodeSpreadsheetSessionStorage({
    metadataPath: join(directory, 'unused-revisions.json'),
    snapshotsRoot: join(directory, 'unused-snapshots')
  })
}

function sidecarArtifact(
  format: 'docx' | 'pdf',
  bytes: Buffer,
  pageCount: number | null,
  metadata: {
    converter?: 'libreoffice' | 'cupsfilter_text'
    quality?: 'print' | 'degraded_text'
    warnings?: string[]
  } = {}
) {
  return {
    documentBase64: bytes.toString('base64'),
    format,
    byteSize: bytes.byteLength,
    checksum: checksum(bytes),
    pageCount,
    ...metadata
  }
}

function checksum(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}
