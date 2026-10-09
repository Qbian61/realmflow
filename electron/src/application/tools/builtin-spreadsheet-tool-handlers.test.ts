import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalSpreadsheetSessionService } from '../files/local-spreadsheet-session-service'
import { createSpreadsheetToolHandlers } from './builtin-spreadsheet-tool-handlers'

describe('builtin spreadsheet Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let sessions: Pick<
    LocalSpreadsheetSessionService,
    'open' | 'execute' | 'save'
  >

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-sheets-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(join(rootPath, 'report.csv'), 'name,count\nRealmFlow,12\n')
    sessions = {
      open: vi.fn().mockResolvedValue({
        sessionId: '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
        path: 'report.csv',
        format: 'csv',
        mode: 'edit',
        revision: 0,
        status: 'ready',
        sourceChecksum: 'a'.repeat(64),
        inspection: { sheets: [{ name: 'Sheet1' }] }
      }),
      execute: vi.fn().mockResolvedValue({
        sessionId: '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
        path: 'report.csv',
        format: 'csv',
        mode: 'edit',
        revision: 1,
        status: 'dirty',
        sourceChecksum: 'a'.repeat(64),
        result: { cellsWritten: 2 }
      }),
      save: vi.fn().mockResolvedValue({
        sessionId: '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
        path: 'report.csv',
        format: 'csv',
        mode: 'edit',
        revision: 1,
        status: 'ready',
        sourceChecksum: 'b'.repeat(64)
      })
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('registers every spreadsheet operation as a dedicated handler', () => {
    expect(
      createSpreadsheetToolHandlers({ sessions }).map(({ name }) => name)
    ).toEqual([
      'spreadsheet.inspect',
      'spreadsheet.read_range',
      'spreadsheet.insert_rows',
      'spreadsheet.delete_rows',
      'spreadsheet.write_range',
      'spreadsheet.set_style',
      'spreadsheet.set_formula',
      'spreadsheet.sort',
      'spreadsheet.filter',
      'spreadsheet.chart',
      'spreadsheet.save'
    ])
  })

  it('opens only an authorized spreadsheet path', async () => {
    await run('spreadsheet.inspect', {
      path: 'report.csv',
      mode: 'edit'
    })

    expect(sessions.open).toHaveBeenCalledWith({
      canonicalPath: await realpath(join(rootPath, 'report.csv')),
      relativePath: 'report.csv',
      format: 'csv',
      mode: 'edit',
      signal: expect.any(AbortSignal)
    })
    await expect(
      run('spreadsheet.inspect', { path: '../report.csv' })
    ).rejects.toThrow('Path is outside the bound workspace')
  })

  it('forwards mutation parameters with the expected revision', async () => {
    await run('spreadsheet.write_range', {
      sessionId: '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
      expectedRevision: 0,
      sheet: 'Sheet1',
      range: 'A1:B1',
      values: [['RealmFlow', 12]]
    })

    expect(sessions.execute).toHaveBeenCalledWith({
      sessionId: '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
      expectedRevision: 0,
      operation: 'write_range',
      parameters: {
        sheet: 'Sheet1',
        range: 'A1:B1',
        values: [['RealmFlow', 12]]
      },
      signal: expect.any(AbortSignal)
    })
  })

  it('saves the exact session revision', async () => {
    await run('spreadsheet.save', {
      sessionId: '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
      expectedRevision: 1
    })

    expect(sessions.save).toHaveBeenCalledWith({
      sessionId: '66b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
      expectedRevision: 1,
      signal: expect.any(AbortSignal)
    })
  })

  async function run(name: string, arguments_: JsonObject) {
    const handler = createSpreadsheetToolHandlers({ sessions }).find(
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
