import { createHash } from 'node:crypto'
import { open, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { ScopePathResolver } from '../tools/scope-path-resolver'

export const MAX_BROWSER_ARTIFACT_BYTES = 32 * 1024 * 1024

export function browserUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Browser URL is invalid') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Browser URL must use HTTP(S) without embedded credentials')
  }
  return url.toString()
}

export function publicBrowserUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''; url.password = ''; url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/password|secret|token|key|auth|credential|signature|code/i.test(key)) url.searchParams.set(key, '[redacted]')
    }
    return url.toString()
  } catch { return '[invalid URL]' }
}

export class BrowserArtifacts {
  private readonly paths = new ScopePathResolver()

  async upload(path: string, roots: string[]): Promise<string> {
    const { canonicalPath } = await this.paths.resolve({ path, roots, operation: 'read' })
    const file = await open(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (!stat.isFile()) throw new Error('Browser upload requires a regular file')
      if (stat.size > MAX_BROWSER_ARTIFACT_BYTES) throw new Error('Browser upload exceeds size limit')
    } finally { await file.close() }
    return canonicalPath
  }

  async save(
    path: string, bytes: Buffer, roots: string[],
    provenance: { sessionId: string; executionId: string; sourceUrl: string },
    signal?: AbortSignal
  ) {
    signal?.throwIfAborted()
    if (bytes.byteLength > MAX_BROWSER_ARTIFACT_BYTES) throw new Error('Browser artifact exceeds size limit')
    const { canonicalPath } = await this.paths.resolve({ path, roots, operation: 'write' })
    const metadataPath = `${canonicalPath}.realmflow-browser.json`
    await this.paths.resolve({ path: metadataPath, roots, operation: 'write' })
    signal?.throwIfAborted()
    const result = {
      ...provenance, sourceUrl: publicBrowserUrl(provenance.sourceUrl),
      path: canonicalPath, bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex')
    }
    const file = await open(canonicalPath, 'wx', 0o600)
    let metadataCreated = false
    try {
      signal?.throwIfAborted()
      await file.writeFile(bytes)
      await file.sync()
      signal?.throwIfAborted()
      const metadata = await open(metadataPath, 'wx', 0o600)
      metadataCreated = true
      try {
        await metadata.writeFile(JSON.stringify(result))
        await metadata.sync()
      } finally { await metadata.close() }
      signal?.throwIfAborted()
      return result
    } catch (error) {
      await unlink(canonicalPath)
      if (metadataCreated) await unlink(metadataPath)
      throw error
    } finally { await file.close() }
  }
}
