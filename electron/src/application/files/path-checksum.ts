import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export async function checksumPath(path: string): Promise<string> {
  const metadata = await lstat(path)
  if (metadata.isSymbolicLink()) {
    throw fileTypeError('File mutation source links are not supported')
  }
  if (metadata.isFile()) {
    return createHash('sha256').update(await readFile(path)).digest('hex')
  }
  if (!metadata.isDirectory()) {
    throw fileTypeError('File mutation source type is not supported')
  }

  const digest = createHash('sha256')
  const entries = await readdir(path, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    digest.update(entry.isDirectory() ? 'directory\0' : 'file\0')
    digest.update(entry.name)
    digest.update('\0')
    digest.update(await checksumPath(join(path, entry.name)))
    digest.update('\0')
  }
  return digest.digest('hex')
}

function fileTypeError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'file_unsupported' })
}
