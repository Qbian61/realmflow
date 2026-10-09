import { createWriteStream } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { gunzip, gzip } from 'node:zlib'
import JSZip from 'jszip'
import {
  create as createTar,
  extract as extractTar,
  list as listTar,
  type Parser,
  type Unpack
} from 'tar'
import {
  type Entry as ZipEntry,
  type ZipFile,
  fromBuffer as openZipFromBuffer
} from 'yauzl'

export type ArchiveFormat = 'zip' | 'tar' | 'tgz' | 'gz'

export type ArchiveSafetyLimits = {
  maxSourceBytes: number
  maxEntries: number
  maxExpandedBytes: number
  maxEntryBytes: number
  maxCompressionRatio: number
  maxPathBytes: number
}

export type ArchiveEntry = {
  path: string
  type: 'file' | 'directory'
  size: number
  compressedSize: number | null
}

export type ArchiveListing = {
  format: ArchiveFormat
  entries: ArchiveEntry[]
  entryCount: number
  fileCount: number
  expandedBytes: number
  compressedBytes: number
}

export type ArchiveSourceEntry = {
  path: string
  canonicalPath: string
  type: 'file' | 'directory'
}

export class ArchiveError extends Error {
  readonly name = 'ArchiveError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export const DEFAULT_ARCHIVE_SAFETY_LIMITS: ArchiveSafetyLimits = {
  maxSourceBytes: 100 * 1024 * 1024,
  maxEntries: 10_000,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxPathBytes: 1_024
}

type ArchiveReadInput = {
  format: ArchiveFormat
  archiveName: string
  content: Uint8Array
  limits?: Partial<ArchiveSafetyLimits>
}

export class ArchiveAdapter {
  async list(input: ArchiveReadInput): Promise<ArchiveListing> {
    const limits = resolveLimits(input.limits)
    assertSourceSize(input.content, limits)
    try {
      if (input.format === 'zip') return await listZip(input, limits)
      if (input.format === 'gz') return await listGzip(input, limits)
      return await listTarArchive(input, limits)
    } catch (error) {
      throw normalizeArchiveError(error)
    }
  }

  async extract(
    input: ArchiveReadInput & { destinationPath: string }
  ): Promise<ArchiveListing> {
    const listing = await this.list(input)
    await mkdir(input.destinationPath, { recursive: false })
    try {
      if (input.format === 'zip') {
        await extractZip(input, input.destinationPath)
      } else if (input.format === 'gz') {
        const limits = resolveLimits(input.limits)
        const content = await gunzipBuffer(
          input.content,
          Math.min(limits.maxEntryBytes, limits.maxExpandedBytes)
        )
        await writeFile(
          join(input.destinationPath, gzipEntryName(input.archiveName)),
          content,
          { flag: 'wx' }
        )
      } else {
        await extractTarArchive(input, input.destinationPath)
      }
      return listing
    } catch (error) {
      await rm(input.destinationPath, { recursive: true, force: true })
      throw normalizeArchiveError(error)
    }
  }

  async create(input: {
    format: ArchiveFormat
    archiveName: string
    entries: ArchiveSourceEntry[]
    limits?: Partial<ArchiveSafetyLimits>
  }): Promise<Buffer> {
    const limits = resolveLimits(input.limits)
    validateSourceEntries(input.entries, limits)
    if (input.format === 'gz') {
      if (input.entries.length !== 1 || input.entries[0].type !== 'file') {
        throw new ArchiveError(
          'archive_format_unsupported',
          'GZ creation requires exactly one regular file'
        )
      }
      const source = await readRegularFile(input.entries[0].canonicalPath)
      assertExpandedSize(source.byteLength, source.byteLength, limits)
      const candidate = await gzipBuffer(source)
      await this.list({
        format: 'gz',
        archiveName: input.archiveName,
        content: candidate,
        limits
      })
      return candidate
    }

    const stagingPath = await mkdtemp(join(tmpdir(), 'realmflow-archive-create-'))
    try {
      for (const entry of input.entries) {
        const relativePath = safeArchivePath(entry.path, limits)
        const destination = join(stagingPath, ...relativePath.split('/'))
        const sourceStat = await lstat(entry.canonicalPath)
        if (sourceStat.isSymbolicLink()) throw unsupportedEntry()
        if (entry.type === 'directory') {
          if (!sourceStat.isDirectory()) throw unsupportedEntry()
          await mkdir(destination, { recursive: true })
        } else {
          if (!sourceStat.isFile()) throw unsupportedEntry()
          assertEntrySize(sourceStat.size, limits)
          await mkdir(dirname(destination), { recursive: true })
          await copyFile(entry.canonicalPath, destination)
        }
      }

      const candidate =
        input.format === 'zip'
          ? await createZip(stagingPath, input.entries)
          : await createTarBuffer(
              stagingPath,
              input.entries,
              input.format === 'tgz'
            )
      await this.list({
        format: input.format,
        archiveName: input.archiveName,
        content: candidate,
        limits
      })
      return candidate
    } finally {
      await rm(stagingPath, { recursive: true, force: true })
    }
  }
}

async function listZip(
  input: ArchiveReadInput,
  limits: ArchiveSafetyLimits
): Promise<ArchiveListing> {
  const accumulator = createListingAccumulator(
    'zip',
    input.content.byteLength,
    limits
  )
  await visitZipEntries(input.content, (entry) => {
    accumulator.add(toZipArchiveEntry(entry, limits))
  })
  return accumulator.finish()
}

async function listTarArchive(
  input: ArchiveReadInput,
  limits: ArchiveSafetyLimits
): Promise<ArchiveListing> {
  const accumulator = createListingAccumulator(
    input.format,
    input.content.byteLength,
    limits
  )
  const source = Readable.from(Buffer.from(input.content))
  let validationError: Error | undefined
  let parser: Parser
  parser = listTar({
    gzip: input.format === 'tgz',
    strict: true,
    onentry: (entry) => {
      try {
        const type = tarEntryType(entry.type)
        accumulator.add({
          path: safeArchivePath(entry.path, limits),
          type,
          size: type === 'directory' ? 0 : entry.size,
          compressedSize: null
        })
        entry.resume()
      } catch (error) {
        const normalized = normalizeArchiveError(error)
        validationError ??= normalized
        entry.resume()
        parser.abort(normalized)
      }
    }
  }) as Parser
  try {
    await pipeline(source, parser)
  } catch (error) {
    throw validationError ?? error
  }
  return accumulator.finish()
}

async function listGzip(
  input: ArchiveReadInput,
  limits: ArchiveSafetyLimits
): Promise<ArchiveListing> {
  const content = await gunzipBuffer(
    input.content,
    Math.min(limits.maxEntryBytes, limits.maxExpandedBytes)
  )
  const path = safeArchivePath(gzipEntryName(input.archiveName), limits)
  return finalizeListing(
    'gz',
    [
      {
        path,
        type: 'file',
        size: content.byteLength,
        compressedSize: input.content.byteLength
      }
    ],
    input.content.byteLength,
    limits
  )
}

async function extractZip(
  input: ArchiveReadInput,
  destinationPath: string
): Promise<void> {
  const limits = resolveLimits(input.limits)
  const accumulator = createListingAccumulator(
    'zip',
    input.content.byteLength,
    limits
  )
  await visitZipEntries(input.content, async (entry, archive) => {
    const archiveEntry = toZipArchiveEntry(entry, limits)
    accumulator.add(archiveEntry)
    const relativePath = archiveEntry.path
    const destination = join(destinationPath, ...relativePath.split('/'))
    if (archiveEntry.type === 'directory') {
      await mkdir(destination, { recursive: true })
      return
    }
    await mkdir(dirname(destination), { recursive: true })
    const source = await openZipEntryStream(archive, entry)
    await pipeline(
      source,
      createExpandedByteLimiter(
        archiveEntry.size,
        input.content.byteLength,
        limits
      ),
      createWriteStream(destination, { flags: 'wx' })
    )
  })
}

async function extractTarArchive(
  input: ArchiveReadInput,
  destinationPath: string
): Promise<void> {
  const limits = resolveLimits(input.limits)
  const accumulator = createListingAccumulator(
    input.format,
    input.content.byteLength,
    limits
  )
  const source = Readable.from(Buffer.from(input.content))
  let validationError: Error | undefined
  let extractor: Unpack
  extractor = extractTar({
    cwd: destinationPath,
    gzip: input.format === 'tgz',
    strict: true,
    preservePaths: false,
    noChmod: true,
    noMtime: true,
    unlink: false,
    onentry: (entry) => {
      try {
        const type = tarEntryType(entry.type)
        accumulator.add({
          path: safeArchivePath(entry.path, limits),
          type,
          size: type === 'directory' ? 0 : entry.size,
          compressedSize: null
        })
      } catch (error) {
        const normalized = normalizeArchiveError(error)
        validationError ??= normalized
        entry.resume()
        extractor.abort(normalized)
      }
    }
  }) as Unpack
  try {
    await pipeline(source, extractor)
  } catch (error) {
    throw validationError ?? error
  }
}

function createListingAccumulator(
  format: ArchiveFormat,
  sourceBytes: number,
  limits: ArchiveSafetyLimits
): {
  add(entry: ArchiveEntry): void
  finish(): ArchiveListing
} {
  const entries: ArchiveEntry[] = []
  let expandedBytes = 0
  return {
    add(entry) {
      if (entries.length >= limits.maxEntries) {
        throw new ArchiveError(
          'archive_entry_limit_exceeded',
          'Archive contains too many entries'
        )
      }
      assertEntrySize(entry.size, limits)
      expandedBytes += entry.size
      assertExpandedSize(expandedBytes, sourceBytes, limits)
      if (
        entry.compressedSize !== null &&
        entry.size > 0 &&
        entry.size / Math.max(entry.compressedSize, 1) >
          limits.maxCompressionRatio
      ) {
        throw compressionRatioError()
      }
      entries.push(entry)
    },
    finish() {
      return {
        format,
        entries,
        entryCount: entries.length,
        fileCount: entries.filter(({ type }) => type === 'file').length,
        expandedBytes,
        compressedBytes: sourceBytes
      }
    }
  }
}

function toZipArchiveEntry(
  entry: ZipEntry,
  limits: ArchiveSafetyLimits
): ArchiveEntry {
  const path = safeArchivePath(entry.fileName, limits)
  const type = zipEntryType(entry)
  return {
    path,
    type,
    size: type === 'directory' ? 0 : entry.uncompressedSize,
    compressedSize: type === 'directory' ? 0 : entry.compressedSize
  }
}

async function visitZipEntries(
  content: Uint8Array,
  visitor: (entry: ZipEntry, archive: ZipFile) => void | Promise<void>
): Promise<void> {
  const archive = await openZip(Buffer.from(content))
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      archive.close()
      reject(error)
    }
    archive.once('error', fail)
    archive.once('end', () => {
      if (settled) return
      settled = true
      resolve()
    })
    archive.on('entry', (entry: ZipEntry) => {
      Promise.resolve().then(() => visitor(entry, archive)).then(
        () => archive.readEntry(),
        fail
      )
    })
    archive.readEntry()
  })
}

function openZip(content: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    openZipFromBuffer(
      content,
      {
        autoClose: true,
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: false
      },
      (error, archive) => (error ? reject(error) : resolve(archive))
    )
  })
}

function openZipEntryStream(
  archive: ZipFile,
  entry: ZipEntry
): Promise<Readable> {
  return new Promise((resolve, reject) => {
    archive.openReadStream(entry, (error, stream) =>
      error ? reject(error) : resolve(stream)
    )
  })
}

function createExpandedByteLimiter(
  declaredBytes: number,
  sourceBytes: number,
  limits: ArchiveSafetyLimits
): Transform {
  let expandedBytes = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      expandedBytes += chunk.byteLength
      try {
        assertEntrySize(expandedBytes, limits)
        assertExpandedSize(expandedBytes, sourceBytes, limits)
        if (expandedBytes > declaredBytes) {
          throw new ArchiveError(
            'file_parse_failed',
            'Archive entry size does not match its metadata'
          )
        }
        callback(null, chunk)
      } catch (error) {
        callback(normalizeArchiveError(error))
      }
    }
  })
}

function finalizeListing(
  format: ArchiveFormat,
  entries: ArchiveEntry[],
  sourceBytes: number,
  limits: ArchiveSafetyLimits
): ArchiveListing {
  if (entries.length > limits.maxEntries) {
    throw new ArchiveError(
      'archive_entry_limit_exceeded',
      'Archive contains too many entries'
    )
  }
  let expandedBytes = 0
  for (const entry of entries) {
    assertEntrySize(entry.size, limits)
    expandedBytes += entry.size
    assertExpandedSize(expandedBytes, sourceBytes, limits)
    if (
      entry.compressedSize !== null &&
      entry.size > 0 &&
      entry.size / Math.max(entry.compressedSize, 1) >
        limits.maxCompressionRatio
    ) {
      throw compressionRatioError()
    }
  }
  if (
    expandedBytes > 0 &&
    expandedBytes / Math.max(sourceBytes, 1) > limits.maxCompressionRatio
  ) {
    throw compressionRatioError()
  }
  return {
    format,
    entries,
    entryCount: entries.length,
    fileCount: entries.filter(({ type }) => type === 'file').length,
    expandedBytes,
    compressedBytes: sourceBytes
  }
}

function safeArchivePath(
  input: string,
  limits: ArchiveSafetyLimits
): string {
  if (
    !input ||
    input.includes('\0') ||
    Buffer.byteLength(input) > limits.maxPathBytes ||
    input.startsWith('/') ||
    input.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(input) ||
    input.startsWith('\\\\')
  ) {
    throw unsafePath()
  }
  const normalized = input.replaceAll('\\', '/').replace(/\/+$/, '')
  const segments = normalized.split('/')
  if (
    !normalized ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..'
    )
  ) {
    throw unsafePath()
  }
  return segments.join('/')
}

function zipEntryType(entry: ZipEntry): 'file' | 'directory' {
  const directory = entry.fileName.endsWith('/')
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff
  const fileType = mode & 0o170000
  if (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
    throw unsupportedEntry()
  }
  if (entry.isEncrypted()) throw unsupportedEntry()
  if (directory || fileType === 0o040000) return 'directory'
  return 'file'
}

function tarEntryType(type: string): 'file' | 'directory' {
  if (type === 'File' || type === 'OldFile' || type === 'ContiguousFile') {
    return 'file'
  }
  if (type === 'Directory') return 'directory'
  throw unsupportedEntry()
}

function validateSourceEntries(
  entries: ArchiveSourceEntry[],
  limits: ArchiveSafetyLimits
): void {
  if (entries.length === 0) {
    throw new ArchiveError(
      'archive_format_unsupported',
      'Archive creation requires at least one source'
    )
  }
  if (entries.length > limits.maxEntries) {
    throw new ArchiveError(
      'archive_entry_limit_exceeded',
      'Archive contains too many entries'
    )
  }
  const seen = new Set<string>()
  for (const entry of entries) {
    const path = safeArchivePath(entry.path, limits)
    if (seen.has(path)) {
      throw new ArchiveError(
        'archive_output_conflict',
        'Archive contains duplicate output paths'
      )
    }
    seen.add(path)
  }
}

async function createZip(
  stagingPath: string,
  entries: ArchiveSourceEntry[]
): Promise<Buffer> {
  const archive = new JSZip()
  for (const entry of entries) {
    if (entry.type === 'directory') {
      archive.folder(entry.path)
    } else {
      archive.file(
        entry.path,
        await readFile(join(stagingPath, ...entry.path.split('/'))),
        { createFolders: true }
      )
    }
  }
  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    platform: 'UNIX'
  })
}

async function createTarBuffer(
  stagingPath: string,
  entries: ArchiveSourceEntry[],
  compressed: boolean
): Promise<Buffer> {
  const stream = createTar(
    {
      cwd: stagingPath,
      gzip: compressed,
      portable: true,
      noMtime: true,
      noDirRecurse: true,
      strict: true
    },
    entries.map(({ path }) => path)
  )
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function readRegularFile(path: string): Promise<Buffer> {
  const sourceStat = await lstat(path)
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw unsupportedEntry()
  }
  return readFile(path)
}

function resolveLimits(
  override: Partial<ArchiveSafetyLimits> | undefined
): ArchiveSafetyLimits {
  return { ...DEFAULT_ARCHIVE_SAFETY_LIMITS, ...override }
}

function assertSourceSize(
  content: Uint8Array,
  limits: ArchiveSafetyLimits
): void {
  if (content.byteLength > limits.maxSourceBytes) {
    throw new ArchiveError('file_too_large', 'Archive source is too large')
  }
}

function assertEntrySize(
  size: number,
  limits: ArchiveSafetyLimits
): void {
  if (size > limits.maxEntryBytes) {
    throw new ArchiveError(
      'archive_expanded_size_exceeded',
      'Archive entry is too large'
    )
  }
}

function assertExpandedSize(
  expandedBytes: number,
  sourceBytes: number,
  limits: ArchiveSafetyLimits
): void {
  if (expandedBytes > limits.maxExpandedBytes) {
    throw new ArchiveError(
      'archive_expanded_size_exceeded',
      'Archive expanded size is too large'
    )
  }
  if (
    expandedBytes > 0 &&
    expandedBytes / Math.max(sourceBytes, 1) > limits.maxCompressionRatio
  ) {
    throw compressionRatioError()
  }
}

function gzipEntryName(archiveName: string): string {
  const fileName = basename(archiveName)
  return fileName.toLowerCase().endsWith('.gz')
    ? fileName.slice(0, -3)
    : `${fileName}.out`
}

function gzipBuffer(content: Uint8Array): Promise<Buffer> {
  return callbackBuffer(gzip, content)
}

async function gunzipBuffer(
  content: Uint8Array,
  maxOutputLength?: number
): Promise<Buffer> {
  try {
    return await new Promise((resolve, reject) => {
      gunzip(content, { maxOutputLength }, (error, result) =>
        error ? reject(error) : resolve(result)
      )
    })
  } catch (error) {
    if (
      error instanceof RangeError ||
      (error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE')
    ) {
      throw new ArchiveError(
        'archive_expanded_size_exceeded',
        'Archive expanded size is too large'
      )
    }
    throw error
  }
}

function callbackBuffer(
  operation: typeof gzip,
  content: Uint8Array
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    operation(content, (error, result) =>
      error ? reject(error) : resolve(result)
    )
  })
}

function unsafePath(): ArchiveError {
  return new ArchiveError('archive_unsafe_path', 'Archive entry path is unsafe')
}

function unsupportedEntry(): ArchiveError {
  return new ArchiveError(
    'archive_unsupported_entry',
    'Archive contains an unsupported entry type'
  )
}

function compressionRatioError(): ArchiveError {
  return new ArchiveError(
    'archive_compression_ratio_exceeded',
    'Archive compression ratio is too high'
  )
}

function normalizeArchiveError(error: unknown): Error {
  if (error instanceof ArchiveError) return error
  if (
    error instanceof Error &&
    /^(invalid relative path|absolute path):/.test(error.message)
  ) {
    return unsafePath()
  }
  return new ArchiveError('file_parse_failed', 'Archive could not be parsed')
}
