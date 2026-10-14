import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import {
  CONTENT_EXTRACTION_LIMITS,
  type ExtractedContentBundle
} from '../../../../domain/content-extraction'
import { classifyLocalFileCapability } from '../../../../domain/local-file-capability'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'
import type { BuiltinToolHandlerInput } from './builtin-tool-adapter'
import {
  assertNotAborted,
  normalizeRelative,
  requireInteger,
  requireString,
  resolveExisting
} from './builtin-file-tool-support'

const MAX_SEARCH_RESULTS = 200
const MAX_SEARCH_FILE_BYTES = 1024 * 1024
const MAX_SEARCH_CHARACTERS = 1_000_000

export async function searchFiles(
  input: BuiltinToolHandlerInput,
  contentExtractor: Pick<
    LocalContentExtractionService,
    'extract' | 'getCached'
  >
): Promise<JsonObject> {
  const resolved = await resolveExisting(
    input.scopeRoots,
    input.arguments,
    'path',
    true
  )
  const query = requireString(input.arguments, 'query')!
  const mode =
    requireString(input.arguments, 'mode', { optional: true }) ?? 'name'
  if (mode !== 'name' && mode !== 'content') {
    throw new Error('File Tool search mode is invalid')
  }
  const contentMode =
    requireString(input.arguments, 'contentMode', { optional: true }) ??
    'text_only'
  if (
    contentMode !== 'text_only' &&
    contentMode !== 'structured_cached' &&
    contentMode !== 'structured_extract'
  ) {
    throw new Error('File Tool contentMode is invalid')
  }
  const maximum = requireInteger(
    input.arguments,
    'maxResults',
    50,
    MAX_SEARCH_RESULTS
  )
  const matches: JsonObject[] = []
  await walkSearch({
    absolutePath: resolved.targetPath,
    relativePath: resolved.relativePath,
    query,
    mode,
    contentMode,
    contentExtractor,
    maximum,
    matches,
    signal: input.signal
  })
  return { matches, truncated: matches.length >= maximum }
}

async function walkSearch(input: {
  absolutePath: string
  relativePath: string
  query: string
  mode: 'name' | 'content'
  contentMode: 'text_only' | 'structured_cached' | 'structured_extract'
  contentExtractor: Pick<
    LocalContentExtractionService,
    'extract' | 'getCached'
  >
  maximum: number
  matches: JsonObject[]
  signal: AbortSignal
}): Promise<void> {
  assertNotAborted(input.signal)
  const entries = await readdir(input.absolutePath, { withFileTypes: true })
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (input.matches.length >= input.maximum) return
    if (entry.isSymbolicLink()) continue
    const absolutePath = `${input.absolutePath}/${entry.name}`
    const relativePath = normalizeRelative(input.relativePath, entry.name)
    if (
      input.mode === 'name' &&
      entry.name.toLowerCase().includes(input.query.toLowerCase())
    ) {
      input.matches.push({ path: relativePath })
    }
    if (entry.isDirectory()) {
      await walkSearch({ ...input, absolutePath, relativePath })
    } else if (entry.isFile() && input.mode === 'content') {
      await searchFileContent(input, absolutePath, relativePath)
    }
  }
}

async function searchFileContent(
  input: Parameters<typeof walkSearch>[0],
  absolutePath: string,
  relativePath: string
): Promise<void> {
  const metadata = await stat(absolutePath)
  if (metadata.size > CONTENT_EXTRACTION_LIMITS.maxSourceBytes) return
  const bytes = await readFile(absolutePath)
  const capability = classifyLocalFileCapability({
    fileName: relativePath,
    head: bytes.subarray(0, Math.min(bytes.byteLength, 8 * 1024))
  })
  if (capability.readMode === 'text') {
    if (metadata.size > MAX_SEARCH_FILE_BYTES || bytes.includes(0)) return
    searchText(input, relativePath, bytes.toString('utf8'))
    return
  }
  if (
    input.contentMode === 'text_only' ||
    capability.readMode === 'unsupported'
  ) {
    return
  }
  const sourceChecksum = `sha256:${createHash('sha256')
    .update(bytes)
    .digest('hex')}`
  const extractionInput = {
    bytes: Uint8Array.from(bytes),
    fileName: relativePath,
    sourceChecksum,
    signal: input.signal,
    depth: 0,
    policy: {
      consumer: 'file_search' as const,
      allowLocalOcr: input.contentMode === 'structured_extract',
      allowLocalConversion: input.contentMode === 'structured_extract',
      maxCharacters: MAX_SEARCH_CHARACTERS,
      maxUnits: CONTENT_EXTRACTION_LIMITS.maxArchiveEntries
    }
  }
  const bundle =
    input.contentMode === 'structured_cached'
      ? await input.contentExtractor.getCached(extractionInput)
      : await input.contentExtractor.extract(extractionInput)
  if (bundle) searchStructured(input, relativePath, bundle)
}

function searchText(
  input: Parameters<typeof walkSearch>[0],
  relativePath: string,
  text: string
): void {
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (input.matches.length >= input.maximum) return
    if (line.toLowerCase().includes(input.query.toLowerCase())) {
      input.matches.push({
        path: relativePath,
        line: index + 1,
        preview: line.slice(0, 500)
      })
    }
  }
}

function searchStructured(
  input: Parameters<typeof walkSearch>[0],
  relativePath: string,
  bundle: ExtractedContentBundle
): void {
  for (const unit of bundle.units) {
    for (const [index, line] of unit.text.split(/\r?\n/).entries()) {
      if (input.matches.length >= input.maximum) return
      if (line.toLowerCase().includes(input.query.toLowerCase())) {
        input.matches.push({
          path: relativePath,
          unitKey: unit.key,
          title: unit.title,
          line: index + 1,
          preview: line.slice(0, 500)
        })
      }
    }
  }
}
