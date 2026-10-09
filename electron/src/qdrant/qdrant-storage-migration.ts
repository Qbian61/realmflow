import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const INDEX_MARKER = '.realmflow-vector-index-v1'

export async function prepareQdrantIndexStorageUpgrade(input: {
  userDataPath: string
}): Promise<{ migrated: boolean }> {
  const root = join(input.userDataPath, 'qdrant')
  const marker = join(root, INDEX_MARKER)
  if (await exists(marker)) return { migrated: false }

  await Promise.all([
    rm(join(root, 'storage'), { recursive: true, force: true }),
    rm(join(root, 'snapshots'), { recursive: true, force: true })
  ])
  await mkdir(root, { recursive: true })
  const temporaryMarker = `${marker}.${process.pid}.tmp`
  await writeFile(temporaryMarker, '1\n', {
    encoding: 'utf8',
    mode: 0o600
  })
  await rename(temporaryMarker, marker)
  return { migrated: true }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
