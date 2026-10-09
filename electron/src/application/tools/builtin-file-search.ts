import { readFile, readdir, stat } from 'node:fs/promises'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
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

export async function searchFiles(
  input: BuiltinToolHandlerInput
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
  if (metadata.size > MAX_SEARCH_FILE_BYTES) return
  const bytes = await readFile(absolutePath)
  if (bytes.includes(0)) return
  const lines = bytes.toString('utf8').split(/\r?\n/)
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
