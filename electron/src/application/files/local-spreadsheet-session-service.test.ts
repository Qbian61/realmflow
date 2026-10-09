import { describe, expect, it, vi } from 'vitest'
import type {
  SpreadsheetComputeInput,
  SpreadsheetComputeResult
} from '../../sidecar/client'
import {
  LocalSpreadsheetSessionService,
  SpreadsheetSessionError,
  type SpreadsheetSessionStorage
} from './local-spreadsheet-session-service'

describe('LocalSpreadsheetSessionService', () => {
  it('keeps mutations in a revisioned Main-owned session until save', async () => {
    const storage = memoryStorage(Buffer.from('name,count\nOld,1\n'))
    const compute = computePort()
    const service = new LocalSpreadsheetSessionService({
      compute,
      storage,
      recalculate: vi.fn()
    })

    const opened = await service.open({
      canonicalPath: '/workspace/data.csv',
      relativePath: 'data.csv',
      format: 'csv',
      mode: 'edit',
      signal: signal()
    })
    expect(service.getCanonicalPath(opened.sessionId)).toBe(
      '/workspace/data.csv'
    )
    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'write_range',
      parameters: {
        range: 'A2:B2',
        values: [['RealmFlow', 12]]
      },
      signal: signal()
    })

    expect(changed.revision).toBe(1)
    expect(changed.status).toBe('dirty')
    expect(storage.readCurrent()).toEqual(Buffer.from('name,count\nOld,1\n'))
    await expect(
      service.execute({
        sessionId: opened.sessionId,
        expectedRevision: 0,
        operation: 'insert_rows',
        parameters: { startRow: 2, count: 1 },
        signal: signal()
      })
    ).rejects.toMatchObject({
      code: 'spreadsheet_revision_conflict'
    })
  })

  it('atomically saves a candidate and restores its committed revision', async () => {
    const storage = memoryStorage(Buffer.from('old'))
    const service = new LocalSpreadsheetSessionService({
      compute: computePort(),
      storage,
      recalculate: vi.fn()
    })
    const opened = await service.open({
      canonicalPath: '/workspace/data.csv',
      relativePath: 'data.csv',
      format: 'csv',
      mode: 'edit',
      signal: signal()
    })
    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'write_range',
      parameters: { range: 'A1:A1', values: [['new']] },
      signal: signal()
    })

    const saved = await service.save({
      sessionId: opened.sessionId,
      expectedRevision: changed.revision,
      signal: signal()
    })

    expect(saved.status).toBe('ready')
    expect(storage.readCurrent()).toEqual(Buffer.from('changed'))
    expect(storage.snapshot).toHaveBeenCalledWith({
      canonicalPath: '/workspace/data.csv',
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      content: Buffer.from('old')
    })
    const restarted = new LocalSpreadsheetSessionService({
      compute: computePort(),
      storage,
      recalculate: vi.fn()
    })
    await expect(
      restarted.open({
        canonicalPath: '/workspace/data.csv',
        relativePath: 'data.csv',
        format: 'csv',
        mode: 'edit',
        signal: signal()
      })
    ).resolves.toMatchObject({ revision: 1 })
  })

  it('does not overwrite a file modified outside the session', async () => {
    const storage = memoryStorage(Buffer.from('old'))
    const service = new LocalSpreadsheetSessionService({
      compute: computePort(),
      storage,
      recalculate: vi.fn()
    })
    const opened = await service.open({
      canonicalPath: '/workspace/data.xlsx',
      relativePath: 'data.xlsx',
      format: 'xlsx',
      mode: 'edit',
      signal: signal()
    })
    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'write_range',
      parameters: { sheet: 'Sheet1', range: 'A1:A1', values: [[1]] },
      signal: signal()
    })
    storage.replaceExternally(Buffer.from('external'))

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: changed.revision,
        signal: signal()
      })
    ).rejects.toEqual(
      new SpreadsheetSessionError(
        'spreadsheet_file_conflict',
        'Spreadsheet file changed outside this session'
      )
    )
    expect(storage.readCurrent()).toEqual(Buffer.from('external'))
  })

  it('keeps the original file when formula recalculation is unavailable', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const recalculate = vi.fn().mockRejectedValue(
      new SpreadsheetSessionError(
        'spreadsheet_recalculation_unavailable',
        'LibreOffice recalculation is unavailable'
      )
    )
    const compute = computePort({ requiresRecalculation: true })
    const service = new LocalSpreadsheetSessionService({
      compute,
      storage,
      recalculate
    })
    const opened = await service.open({
      canonicalPath: '/workspace/data.xlsx',
      relativePath: 'data.xlsx',
      format: 'xlsx',
      mode: 'edit',
      signal: signal()
    })
    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'set_formula',
      parameters: {
        sheet: 'Sheet1',
        range: 'A1:A1',
        formulas: [['=1+1']]
      },
      signal: signal()
    })

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: changed.revision,
        signal: signal()
      })
    ).rejects.toMatchObject({
      code: 'spreadsheet_recalculation_unavailable'
    })
    expect(storage.commit).not.toHaveBeenCalled()
    expect(storage.readCurrent()).toEqual(Buffer.from('original'))
  })
})

function signal(): AbortSignal {
  return new AbortController().signal
}

function computePort(
  override: Partial<SpreadsheetComputeResult> = {}
): (input: SpreadsheetComputeInput, signal: AbortSignal) => Promise<SpreadsheetComputeResult> {
  return vi.fn(async (input) => ({
    documentBase64:
      input.operation === 'inspect'
        ? input.documentBase64
        : Buffer.from('changed').toString('base64'),
    result:
      input.operation === 'inspect'
        ? { format: input.format, sheets: [] }
        : { operation: input.operation },
    modified: input.operation !== 'inspect' && input.operation !== 'read_range',
    requiresRecalculation: false,
    ...override
  }))
}

function memoryStorage(initial: Buffer): SpreadsheetSessionStorage & {
  readCurrent(): Buffer
  replaceExternally(content: Buffer): void
  snapshot: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
} {
  let current = Buffer.from(initial)
  const revisions = new Map<string, { checksum: string; revision: number }>()
  const snapshot = vi.fn().mockResolvedValue(undefined)
  const commit = vi.fn(async ({ content }: { content: Uint8Array }) => {
    current = Buffer.from(content)
  })
  return {
    read: vi.fn(async () => Buffer.from(current)),
    checksum: vi.fn(async () =>
      import('node:crypto').then(({ createHash }) =>
        createHash('sha256').update(current).digest('hex')
      )
    ),
    snapshot,
    commit,
    loadRevision: vi.fn(async (canonicalPath, checksum) => {
      const saved = revisions.get(canonicalPath)
      return saved && saved.checksum === checksum ? saved.revision : 0
    }),
    saveRevision: vi.fn(async (canonicalPath, checksum, revision) => {
      revisions.set(canonicalPath, { checksum, revision })
    }),
    readCurrent: () => Buffer.from(current),
    replaceExternally: (content) => {
      current = Buffer.from(content)
    }
  }
}
