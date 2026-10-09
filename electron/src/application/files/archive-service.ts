import { createHash } from 'node:crypto'
import type {
  ArchiveAdapter,
  ArchiveFormat,
  ArchiveListing,
  ArchiveSourceEntry
} from './archive-adapter'
import { ArchiveError } from './archive-adapter'

export type ArchiveStorage = {
  read(canonicalPath: string): Promise<Uint8Array>
  checksum(canonicalPath: string): Promise<string>
  exists(canonicalPath: string): Promise<boolean>
  createStagingDirectory(outputCanonicalPath: string): Promise<string>
  commitDirectory(input: {
    stagingPath: string
    outputCanonicalPath: string
  }): Promise<void>
  commitNew(input: {
    canonicalPath: string
    content: Uint8Array
  }): Promise<void>
  remove(canonicalPath: string): Promise<void>
}

type ArchiveReadResult = ArchiveListing & {
  sourcePath: string
  sourceChecksum: string
}

type ArchiveExtractResult = ArchiveReadResult & {
  outputPath: string
}

type ArchiveCreateResult = ArchiveListing & {
  outputPath: string
  outputChecksum: string
}

export class ArchiveService {
  constructor(
    private readonly dependencies: {
      adapter: Pick<ArchiveAdapter, 'list' | 'extract' | 'create'>
      storage: ArchiveStorage
    }
  ) {}

  async list(input: {
    sourceCanonicalPath: string
    sourceRelativePath: string
    format: ArchiveFormat
    signal: AbortSignal
  }): Promise<ArchiveReadResult> {
    assertNotAborted(input.signal)
    const source = Buffer.from(
      await this.dependencies.storage.read(input.sourceCanonicalPath)
    )
    const sourceChecksum = digest(source)
    await assertCurrentChecksum(
      this.dependencies.storage,
      input.sourceCanonicalPath,
      sourceChecksum
    )
    const listing = await this.dependencies.adapter.list({
      format: input.format,
      archiveName: input.sourceRelativePath,
      content: source
    })
    assertNotAborted(input.signal)
    return {
      ...listing,
      sourcePath: input.sourceRelativePath,
      sourceChecksum
    }
  }

  async extract(input: {
    sourceCanonicalPath: string
    sourceRelativePath: string
    expectedSourceChecksum: string
    outputCanonicalPath: string
    outputRelativePath: string
    format: ArchiveFormat
    signal: AbortSignal
  }): Promise<ArchiveExtractResult> {
    assertNotAborted(input.signal)
    if (await this.dependencies.storage.exists(input.outputCanonicalPath)) {
      throw outputConflict()
    }
    const source = Buffer.from(
      await this.dependencies.storage.read(input.sourceCanonicalPath)
    )
    const sourceChecksum = digest(source)
    if (sourceChecksum !== input.expectedSourceChecksum) {
      throw new ArchiveError('file_conflict', 'Archive source changed')
    }
    await assertCurrentChecksum(
      this.dependencies.storage,
      input.sourceCanonicalPath,
      sourceChecksum
    )
    const stagingPath =
      await this.dependencies.storage.createStagingDirectory(
        input.outputCanonicalPath
      )
    try {
      const listing = await this.dependencies.adapter.extract({
        format: input.format,
        archiveName: input.sourceRelativePath,
        content: source,
        destinationPath: stagingPath
      })
      assertNotAborted(input.signal)
      await assertCurrentChecksum(
        this.dependencies.storage,
        input.sourceCanonicalPath,
        sourceChecksum
      )
      await this.dependencies.storage.commitDirectory({
        stagingPath,
        outputCanonicalPath: input.outputCanonicalPath
      })
      return {
        ...listing,
        sourcePath: input.sourceRelativePath,
        sourceChecksum,
        outputPath: input.outputRelativePath
      }
    } catch (error) {
      await this.dependencies.storage.remove(stagingPath)
      if (isAlreadyExists(error)) throw outputConflict()
      throw error
    }
  }

  async create(input: {
    outputCanonicalPath: string
    outputRelativePath: string
    format: ArchiveFormat
    entries: ArchiveSourceEntry[]
    sourceChecksums: Array<{
      canonicalPath: string
      expectedChecksum: string
    }>
    signal: AbortSignal
  }): Promise<ArchiveCreateResult> {
    assertNotAborted(input.signal)
    if (await this.dependencies.storage.exists(input.outputCanonicalPath)) {
      throw outputConflict()
    }
    await assertSourceChecksums(
      this.dependencies.storage,
      input.sourceChecksums
    )
    const candidate = await this.dependencies.adapter.create({
      format: input.format,
      archiveName: input.outputRelativePath,
      entries: input.entries
    })
    assertNotAborted(input.signal)
    const listing = await this.dependencies.adapter.list({
      format: input.format,
      archiveName: input.outputRelativePath,
      content: candidate
    })
    await assertSourceChecksums(
      this.dependencies.storage,
      input.sourceChecksums
    )
    try {
      await this.dependencies.storage.commitNew({
        canonicalPath: input.outputCanonicalPath,
        content: candidate
      })
    } catch (error) {
      if (isAlreadyExists(error)) throw outputConflict()
      throw error
    }
    return {
      ...listing,
      outputPath: input.outputRelativePath,
      outputChecksum: digest(candidate)
    }
  }
}

async function assertSourceChecksums(
  storage: ArchiveStorage,
  sources: Array<{ canonicalPath: string; expectedChecksum: string }>
): Promise<void> {
  for (const source of sources) {
    await assertCurrentChecksum(
      storage,
      source.canonicalPath,
      source.expectedChecksum
    )
  }
}

async function assertCurrentChecksum(
  storage: ArchiveStorage,
  path: string,
  expectedChecksum: string
): Promise<void> {
  if ((await storage.checksum(path)) !== expectedChecksum) {
    throw new ArchiveError('file_conflict', 'Archive source changed')
  }
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Archive operation was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function outputConflict(): ArchiveError {
  return new ArchiveError(
    'archive_output_conflict',
    'Archive output already exists'
  )
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
