import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersistenceService } from './persistence-service'

const temporaryDirectories: string[] = []

async function createService(
  onChanged = vi.fn()
): Promise<{
  filePath: string
  onChanged: ReturnType<typeof vi.fn>
  service: PersistenceService
}> {
  const directory = await mkdtemp(join(tmpdir(), 'realmflow-persistence-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, 'renderer-state.json')
  return {
    filePath,
    onChanged,
    service: new PersistenceService(filePath, onChanged)
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('PersistenceService', () => {
  it('allows only one concurrent save for the same revision', async () => {
    const { service } = await createService()

    const results = await Promise.all([
      service.save('workspaceNavigation', { owner: 'first' }, 0),
      service.save('workspaceNavigation', { owner: 'second' }, 0)
    ])

    expect(results.map((result) => result.status).sort()).toEqual([
      'conflict',
      'saved'
    ])
    const loaded = await service.load('workspaceNavigation')
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') return
    expect(loaded.snapshot.revision).toBe(1)
    expect(['first', 'second']).toContain(
      (loaded.snapshot.value as { owner: string }).owner
    )
  })

  it('returns unavailable when the persisted store cannot be decoded', async () => {
    const { filePath, service } = await createService()
    await writeFile(filePath, '{', 'utf8')

    await expect(service.load('chatSessions')).resolves.toEqual({
      status: 'unavailable'
    })
    await expect(service.save('chatSessions', [], 0)).resolves.toEqual({
      status: 'unavailable'
    })
  })

  it('notifies subscribers only after a successful save', async () => {
    const onChanged = vi.fn()
    const { service } = await createService(onChanged)

    await service.save('spaceResources', { resourcesBySpace: {} }, 0)
    await service.save('spaceResources', { resourcesBySpace: {} }, 0)

    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalledWith({
      dataset: 'spaceResources',
      revision: 1
    })
  })
})
