import { randomUUID } from 'node:crypto'
import {
  link,
  lstat,
  mkdtemp,
  open,
  readFile,
  rename,
  rm
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { ArchiveStorage } from './archive-service'
import { checksumPath } from './path-checksum'

export class NodeArchiveStorage implements ArchiveStorage {
  read(canonicalPath: string): Promise<Buffer> {
    return readFile(canonicalPath)
  }

  async checksum(canonicalPath: string): Promise<string> {
    return checksumPath(canonicalPath)
  }

  async exists(canonicalPath: string): Promise<boolean> {
    try {
      await lstat(canonicalPath)
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  createStagingDirectory(outputCanonicalPath: string): Promise<string> {
    return mkdtemp(
      join(
        dirname(outputCanonicalPath),
        `.${basename(outputCanonicalPath)}.realmflow-`
      )
    )
  }

  async commitDirectory(input: {
    stagingPath: string
    outputCanonicalPath: string
  }): Promise<void> {
    const lockPath = `${input.outputCanonicalPath}.realmflow-lock`
    const lock = await open(lockPath, 'wx', 0o600)
    try {
      if (await this.exists(input.outputCanonicalPath)) {
        throw Object.assign(new Error('Archive output exists'), {
          code: 'EEXIST'
        })
      }
      await rename(input.stagingPath, input.outputCanonicalPath)
    } finally {
      await lock.close()
      await rm(lockPath, { force: true })
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

  async remove(canonicalPath: string): Promise<void> {
    await rm(canonicalPath, { recursive: true, force: true })
  }
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
