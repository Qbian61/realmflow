import { createHash } from 'node:crypto'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ToolArtifactReference } from './tool-adapter'

const ARTIFACT_PATTERN = /^temporary-tool-(\d+)-([a-f0-9]{32})$/

export class TemporaryToolArtifactStore {
  constructor(
    private readonly rootPath: string,
    private readonly now: () => number = Date.now
  ) {}

  async createTemporary(input: {
    executionId: string
    mediaType: string
    bytes: Uint8Array
    expiresAt: number
  }): Promise<ToolArtifactReference> {
    if (
      !input.executionId.trim() ||
      !input.mediaType.trim() ||
      !Number.isSafeInteger(input.expiresAt) ||
      input.expiresAt < 0
    ) {
      throw new Error('Temporary Tool Artifact input is invalid')
    }
    const checksum = createHash('sha256').update(input.bytes).digest('hex')
    const suffix = createHash('sha256')
      .update(`${input.executionId}\0${input.expiresAt}\0${checksum}`)
      .digest('hex')
      .slice(0, 32)
    const artifactId = `temporary-tool-${input.expiresAt}-${suffix}`
    await mkdir(this.rootPath, { recursive: true, mode: 0o700 })
    try {
      await writeFile(this.resolvePath(artifactId), input.bytes, {
        flag: 'wx',
        mode: 0o600
      })
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') throw error
    }
    return {
      artifactId,
      mediaType: input.mediaType,
      byteLength: input.bytes.byteLength,
      checksum
    }
  }

  resolvePath(artifactId: string): string {
    if (!ARTIFACT_PATTERN.test(artifactId)) {
      throw new Error('Temporary Tool Artifact ID is invalid')
    }
    return join(this.rootPath, artifactId)
  }

  async removeExpired(): Promise<number> {
    let names: string[]
    try {
      names = await readdir(this.rootPath)
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return 0
      throw error
    }
    let removed = 0
    for (const name of names) {
      const match = ARTIFACT_PATTERN.exec(name)
      if (!match || Number(match[1]) > this.now()) continue
      await rm(join(this.rootPath, name), { force: true })
      removed += 1
    }
    return removed
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
