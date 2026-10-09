import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach } from 'vitest'
import { createRepositorySource } from '../../../../domain/repository-source'
import type { RemoteRepositorySource } from '../../../../domain/repository-source'
import { RepositoryMaterializer } from './repository-materializer'
import { RepositoryScanner } from './repository-scanner'

describe('RepositoryMaterializer', () => {
  let directory: string
  let workspacePath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-repository-materializer-'))
    workspacePath = join(directory, 'space')
    await mkdir(workspacePath)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('stages a manifest as a private Git work tree for unified scanning', async () => {
    const prepared = await new RepositoryMaterializer().prepare({
      workspacePath,
      repository: repository(),
      manifest: {
        revision: 'main@abc123',
        files: [
          { path: '.gitignore', content: 'ignored.txt\n' },
          { path: 'README.md', content: '# Remote\n' },
          { path: 'ignored.txt', content: 'ignored\n' }
        ]
      }
    })

    const snapshot = await new RepositoryScanner({
      now: () => 20,
      createId: () => 'snapshot-1'
    }).scan(prepared.stagingPath, {
      sourceId: 'repo-1',
      version: 1,
      revisionLabel: 'main@abc123'
    })

    expect(snapshot.files.map((file) => file.relativePath)).toEqual([
      '.gitignore',
      'README.md'
    ])
    await expect(stat(join(prepared.stagingPath, '.git'))).resolves.toMatchObject(
      {}
    )
    await prepared.discard()
  })

  it('restores the previous managed tree when a committed replacement rolls back', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'repositories',
      'repo-1'
    )
    await mkdir(managedPath, { recursive: true })
    await writeFile(join(managedPath, 'README.md'), '# Previous\n')
    const prepared = await new RepositoryMaterializer().prepare({
      workspacePath,
      repository: repository(),
      manifest: {
        revision: 'main@next',
        files: [{ path: 'README.md', content: '# Next\n' }]
      }
    })

    const committed = await prepared.commit()
    await expect(readFile(join(managedPath, 'README.md'), 'utf8')).resolves.toBe(
      '# Next\n'
    )
    await expect(stat(join(managedPath, '.git'))).rejects.toMatchObject({
      code: 'ENOENT'
    })

    await committed.rollback()

    await expect(readFile(join(managedPath, 'README.md'), 'utf8')).resolves.toBe(
      '# Previous\n'
    )
  })

  it('finalizes a replacement without private staging or backup residue', async () => {
    const materializer = new RepositoryMaterializer()
    const prepared = await materializer.prepare({
      workspacePath,
      repository: repository(),
      manifest: {
        revision: 'main@next',
        files: [{ path: 'README.md', content: '# Next\n' }]
      }
    })
    const committed = await prepared.commit()

    await committed.finalize()

    await expect(
      readFile(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'repositories',
          'repo-1',
          'README.md'
        ),
        'utf8'
      )
    ).resolves.toBe('# Next\n')
    await expect(
      stat(
        join(
          workspacePath,
          '.realmflow',
          'tmp',
          'repository-ingestion',
          'repo-1'
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('restores a backup left by an interrupted pre-database replacement', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'repositories',
      'repo-1'
    )
    await mkdir(managedPath, { recursive: true })
    await writeFile(join(managedPath, 'README.md'), '# Previous\n')
    const materializer = new RepositoryMaterializer()
    const prepared = await materializer.prepare({
      workspacePath,
      repository: repository(),
      manifest: {
        revision: 'main@next',
        files: [{ path: 'README.md', content: '# Next\n' }]
      }
    })
    await prepared.commit()

    await expect(
      materializer.recoverWorkspace({
        workspacePath,
        repositories: [repository()]
      })
    ).resolves.toBe(true)

    await expect(readFile(join(managedPath, 'README.md'), 'utf8')).resolves.toBe(
      '# Previous\n'
    )
  })

  it('keeps a committed initial tree when its database version is current', async () => {
    const materializer = new RepositoryMaterializer()
    const prepared = await materializer.prepare({
      workspacePath,
      repository: repository(),
      manifest: {
        revision: 'main@next',
        files: [{ path: 'README.md', content: '# Next\n' }]
      }
    })
    await prepared.commit()
    const current = { ...repository(), currentVersion: 1 }

    await materializer.recoverWorkspace({
      workspacePath,
      repositories: [current]
    })

    await expect(
      readFile(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'repositories',
          'repo-1',
          'README.md'
        ),
        'utf8'
      )
    ).resolves.toBe('# Next\n')
  })

  function repository(): RemoteRepositorySource {
    const source = createRepositorySource({
      sourceId: 'repo-1',
      workspaceId: 'space-1',
      mode: 'remote',
      connectorId: 'connector-git',
      path: '/repositories/realmflow',
      managedRelativePath: '.realmflow/knowledge/repositories/repo-1',
      selectedBranch: 'main',
      at: 10
    })
    if (source.mode !== 'remote') throw new Error('Expected remote repository')
    return source
  }
})
