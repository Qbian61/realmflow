import { createHash, randomUUID } from 'node:crypto'
import {
  access,
  mkdir,
  link,
  open,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { SpreadsheetSessionStorage } from './local-spreadsheet-session-service'

type RevisionIndex = {
  version: 1
  files: Record<string, { checksum: string; revision: number }>
}

export class NodeSpreadsheetSessionStorage
  implements SpreadsheetSessionStorage
{
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly options: {
      metadataPath: string
      snapshotsRoot: string
    }
  ) {}

  read(canonicalPath: string): Promise<Buffer> {
    return readFile(canonicalPath)
  }

  async checksum(canonicalPath: string): Promise<string> {
    return digest(await readFile(canonicalPath))
  }

  async snapshot(input: {
    canonicalPath: string
    checksum: string
    content: Uint8Array
  }): Promise<void> {
    if (digest(input.content) !== input.checksum) {
      throw new Error('Spreadsheet snapshot checksum is invalid')
    }
    await mkdir(this.options.snapshotsRoot, { recursive: true })
    const extension = extname(input.canonicalPath).toLowerCase()
    const target = join(
      this.options.snapshotsRoot,
      `${input.checksum}${extension}`
    )
    try {
      await writeFile(target, input.content, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
  }

  async commit(input: {
    canonicalPath: string
    content: Uint8Array
  }): Promise<void> {
    const temporaryPath = join(
      dirname(input.canonicalPath),
      `.${basename(input.canonicalPath)}.${randomUUID()}.tmp`
    )
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(input.content)
      await handle.sync()
      await handle.close()
      await rename(temporaryPath, input.canonicalPath)
    } catch (error) {
      await handle.close().catch(() => undefined)
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  async commitNew(input: {
    canonicalPath: string
    content: Uint8Array
  }): Promise<void> {
    const temporaryPath = join(
      dirname(input.canonicalPath),
      `.${basename(input.canonicalPath)}.${randomUUID()}.tmp`
    )
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(input.content)
      await handle.sync()
      await handle.close()
      await link(temporaryPath, input.canonicalPath)
      await rm(temporaryPath)
    } catch (error) {
      await handle.close().catch(() => undefined)
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  remove(canonicalPath: string): Promise<void> {
    return rm(canonicalPath, { force: true })
  }

  async exists(canonicalPath: string): Promise<boolean> {
    try {
      await access(canonicalPath)
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  async loadRevision(
    canonicalPath: string,
    checksum: string
  ): Promise<number> {
    const index = await this.readIndex()
    const saved = index.files[canonicalPath]
    return saved?.checksum === checksum ? saved.revision : 0
  }

  saveRevision(
    canonicalPath: string,
    checksum: string,
    revision: number
  ): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const index = await this.readIndex()
      index.files[canonicalPath] = { checksum, revision }
      await mkdir(dirname(this.options.metadataPath), { recursive: true })
      await atomicWrite(
        this.options.metadataPath,
        Buffer.from(`${JSON.stringify(index, null, 2)}\n`)
      )
    })
    this.writeQueue = operation.catch(() => undefined)
    return operation
  }

  private async readIndex(): Promise<RevisionIndex> {
    try {
      const parsed = JSON.parse(
        await readFile(this.options.metadataPath, 'utf8')
      ) as unknown
      if (
        !isRecord(parsed) ||
        parsed.version !== 1 ||
        !isRecord(parsed.files)
      ) {
        throw new Error('Spreadsheet revision index is invalid')
      }
      return parsed as RevisionIndex
    } catch (error) {
      if (isMissing(error)) return { version: 1, files: {} }
      throw error
    }
  }
}

async function atomicWrite(path: string, content: Uint8Array): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  const handle = await open(temporaryPath, 'wx', 0o600)
  try {
    await handle.writeFile(content)
    await handle.sync()
    await handle.close()
    await rename(temporaryPath, path)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
