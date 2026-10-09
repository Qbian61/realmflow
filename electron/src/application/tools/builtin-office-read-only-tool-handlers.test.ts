import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { OfficeReadOnlySessionService } from '../files/office-read-only-session-service'
import { createOfficeReadOnlyToolHandlers } from './builtin-office-read-only-tool-handlers'

describe('builtin Office original read-only Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let sessions: Pick<OfficeReadOnlySessionService, 'open'>

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'realmflow-office-readonly-')
    )
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    await writeFile(
      join(rootPath, 'report.docm'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04])
    )
    await writeFile(join(rootPath, 'notes.txt'), 'not Office')
    sessions = {
      open: vi.fn().mockResolvedValue({
        sessionId: 'word-session',
        path: 'report.docm',
        format: 'docm',
        mode: 'read',
        revision: 0,
        status: 'ready',
        sourceChecksum: 'a'.repeat(64)
      })
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('opens an authorized macro document in its original read-only format', async () => {
    await expect(run({ path: 'report.docm' })).resolves.toMatchObject({
      format: 'docm',
      mode: 'read'
    })
    expect(sessions.open).toHaveBeenCalledWith({
      canonicalPath: await realpath(join(rootPath, 'report.docm')),
      relativePath: 'report.docm',
      sourceFormat: 'docm',
      signal: expect.any(AbortSignal)
    })
  })

  it('rejects files outside the template and macro format set', async () => {
    await expect(run({ path: 'notes.txt' })).rejects.toThrow(
      'Office original reader requires a template or macro file'
    )
    expect(sessions.open).not.toHaveBeenCalled()
  })

  async function run(arguments_: JsonObject) {
    const handler = createOfficeReadOnlyToolHandlers({ sessions })[0]
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
