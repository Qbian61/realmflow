import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeSpreadsheetSessionStorage } from './node-spreadsheet-session-storage'

describe('NodeSpreadsheetSessionStorage', () => {
  let root: string
  let file: string
  let storage: NodeSpreadsheetSessionStorage

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'realmflow-sheet-storage-'))
    file = join(root, 'workspace', 'data.xlsx')
    await mkdir(join(root, 'workspace'))
    await writeFile(file, 'original')
    storage = new NodeSpreadsheetSessionStorage({
      metadataPath: join(root, 'state', 'spreadsheet-revisions.json'),
      snapshotsRoot: join(root, 'snapshots')
    })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('atomically commits bytes and persists only matching revisions', async () => {
    await storage.commit({
      canonicalPath: file,
      content: Buffer.from('updated')
    })
    const checksum = sha256('updated')
    await storage.saveRevision(file, checksum, 4)

    expect(await readFile(file, 'utf8')).toBe('updated')
    expect(await storage.loadRevision(file, checksum)).toBe(4)
    expect(await storage.loadRevision(file, sha256('other'))).toBe(0)
  })

  it('stores an immutable checksum-addressed source snapshot', async () => {
    const checksum = sha256('original')

    await storage.snapshot({
      canonicalPath: file,
      checksum,
      content: Buffer.from('original')
    })
    await storage.snapshot({
      canonicalPath: file,
      checksum,
      content: Buffer.from('original')
    })

    expect(
      await readFile(join(root, 'snapshots', `${checksum}.xlsx`), 'utf8')
    ).toBe('original')
  })
})

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
