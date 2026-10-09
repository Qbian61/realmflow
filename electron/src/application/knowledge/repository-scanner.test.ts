import { execFile } from 'node:child_process'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach } from 'vitest'
import { RepositoryScanner } from './repository-scanner'

const execute = promisify(execFile)

describe('RepositoryScanner', () => {
  let directory: string
  let repositoryPath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-repository-scanner-'))
    repositoryPath = join(directory, 'repository')
    await mkdir(join(repositoryPath, 'src'), { recursive: true })
    await execute('git', ['init', '--quiet', repositoryPath])
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('uses Git ignore rules and RealmFlow exclusions without changing the repository', async () => {
    await writeFile(join(repositoryPath, '.gitignore'), 'dist/\n')
    await writeFile(join(repositoryPath, 'README.md'), '# RealmFlow\n')
    await writeFile(join(repositoryPath, '.env'), 'SECRET=value\n')
    await writeFile(join(repositoryPath, 'src', '.gitignore'), '*.log\n')
    await writeFile(join(repositoryPath, 'src', 'index.ts'), 'export {}\n')
    await writeFile(join(repositoryPath, 'src', 'debug.log'), 'ignored\n')
    await mkdir(join(repositoryPath, 'dist'), { recursive: true })
    await writeFile(join(repositoryPath, 'dist', 'bundle.js'), 'ignored\n')
    await mkdir(join(repositoryPath, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(
      join(repositoryPath, 'node_modules', 'pkg', 'index.js'),
      'ignored\n'
    )
    await writeFile(join(repositoryPath, 'binary.dat'), new Uint8Array([1, 0, 2]))
    await writeFile(
      join(repositoryPath, 'large.txt'),
      new Uint8Array(1024 * 1024 + 1)
    )
    await symlink('README.md', join(repositoryPath, 'readme-link.md'))
    const gitBefore = await lstat(join(repositoryPath, '.git'))

    const scanner = new RepositoryScanner({
      now: () => 20,
      createId: () => 'snapshot-1'
    })
    const snapshot = await scanner.scan(repositoryPath, {
      sourceId: 'repo-1',
      version: 1
    })

    expect(snapshot).toMatchObject({
      id: 'snapshot-1',
      sourceId: 'repo-1',
      version: 1,
      revisionLabel: 'worktree',
      fileCount: 4,
      files: [
        { relativePath: '.gitignore', content: 'dist/\n' },
        { relativePath: 'README.md', content: '# RealmFlow\n' },
        { relativePath: 'src/.gitignore', content: '*.log\n' },
        { relativePath: 'src/index.ts', content: 'export {}\n' }
      ],
      scannedAt: 20
    })
    await expect(readFile(join(repositoryPath, '.env'), 'utf8')).resolves.toBe(
      'SECRET=value\n'
    )
    expect((await lstat(join(repositoryPath, '.git'))).ino).toBe(gitBefore.ino)
  })

  it('uses the current commit as the revision label when HEAD exists', async () => {
    await writeFile(join(repositoryPath, 'README.md'), '# Revision\n')
    await execute('git', ['-C', repositoryPath, 'add', 'README.md'])
    await execute('git', [
      '-C',
      repositoryPath,
      '-c',
      'user.name=RealmFlow Test',
      '-c',
      'user.email=realmflow@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'initial'
    ])
    const { stdout } = await execute('git', [
      '-C',
      repositoryPath,
      'rev-parse',
      'HEAD'
    ])

    const snapshot = await new RepositoryScanner({
      now: () => 20,
      createId: () => 'snapshot-1'
    }).scan(repositoryPath, { sourceId: 'repo-1', version: 1 })

    expect(snapshot.revisionLabel).toBe(stdout.trim())
  })

  it('lists branches and scans another branch without changing the checkout', async () => {
    await writeFile(join(repositoryPath, 'README.md'), '# Main\n')
    await execute('git', ['-C', repositoryPath, 'add', 'README.md'])
    await commit(repositoryPath, 'main')
    await execute('git', ['-C', repositoryPath, 'branch', '-M', 'main'])
    await execute('git', ['-C', repositoryPath, 'switch', '-c', 'feature/docs'])
    await writeFile(join(repositoryPath, 'README.md'), '# Feature\n')
    await execute('git', ['-C', repositoryPath, 'add', 'README.md'])
    await commit(repositoryPath, 'feature')
    await execute('git', ['-C', repositoryPath, 'switch', 'main'])
    const scanner = new RepositoryScanner({
      now: () => 20,
      createId: () => 'snapshot-branch'
    })

    await expect(scanner.listBranches(repositoryPath)).resolves.toEqual([
      { name: 'feature/docs', current: false },
      { name: 'main', current: true }
    ])
    await expect(
      scanner.scanBranch(repositoryPath, {
        sourceId: 'repo-1',
        version: 2,
        branch: 'feature/docs'
      })
    ).resolves.toMatchObject({
      id: 'snapshot-branch',
      branch: 'feature/docs',
      files: [{ relativePath: 'README.md', content: '# Feature\n' }]
    })
    await expect(
      execute('git', ['-C', repositoryPath, 'branch', '--show-current'])
    ).resolves.toMatchObject({ stdout: 'main\n' })
  }, 15_000)

  it('validates a Git work tree without constructing a snapshot', async () => {
    await expect(
      new RepositoryScanner().validate(repositoryPath)
    ).resolves.toBeUndefined()
  })

  it('probes HEAD and worktree cleanliness without reading file contents', async () => {
    await writeFile(join(repositoryPath, 'README.md'), '# Revision\n')
    await execute('git', ['-C', repositoryPath, 'add', 'README.md'])
    await execute('git', [
      '-C',
      repositoryPath,
      '-c',
      'user.name=RealmFlow Test',
      '-c',
      'user.email=realmflow@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'initial'
    ])
    const scanner = new RepositoryScanner()

    await expect(scanner.probe(repositoryPath)).resolves.toMatchObject({
      revisionLabel: expect.stringMatching(/^[a-f0-9]{40}$/),
      clean: true
    })

    await writeFile(join(repositoryPath, 'README.md'), '# Changed\n')
    await expect(scanner.probe(repositoryPath)).resolves.toMatchObject({
      clean: false
    })
  })

  it('observes branch, HEAD, tracked and untracked repository changes', async () => {
    await writeFile(join(repositoryPath, 'README.md'), '# Main\n')
    await execute('git', ['-C', repositoryPath, 'add', 'README.md'])
    await commit(repositoryPath, 'main')
    const scanner = new RepositoryScanner()
    const main = await scanner.probe(repositoryPath)

    await execute('git', ['-C', repositoryPath, 'switch', '-c', 'feature'])
    await writeFile(join(repositoryPath, 'README.md'), '# Feature\n')
    await execute('git', ['-C', repositoryPath, 'add', 'README.md'])
    await commit(repositoryPath, 'feature')
    const feature = await scanner.probe(repositoryPath)
    expect(feature).toMatchObject({ clean: true })
    expect(feature.revisionLabel).not.toBe(main.revisionLabel)

    await writeFile(join(repositoryPath, 'README.md'), '# Tracked change\n')
    await expect(scanner.probe(repositoryPath)).resolves.toMatchObject({
      revisionLabel: feature.revisionLabel,
      clean: false
    })

    await execute('git', ['-C', repositoryPath, 'restore', 'README.md'])
    await writeFile(join(repositoryPath, 'untracked.md'), '# Untracked\n')
    await expect(scanner.probe(repositoryPath)).resolves.toMatchObject({
      revisionLabel: feature.revisionLabel,
      clean: false
    })

    await rm(join(repositoryPath, 'untracked.md'))
    await execute('git', [
      '-C',
      repositoryPath,
      'switch',
      '--detach',
      main.revisionLabel
    ])
    await expect(scanner.probe(repositoryPath)).resolves.toMatchObject({
      revisionLabel: main.revisionLabel,
      clean: true
    })
  }, 15_000)

  it('rejects a repository file that changes while it is being scanned', async () => {
    const path = join(repositoryPath, 'README.md')
    await writeFile(path, '# Before\n')
    await execute('git', ['-C', repositoryPath, 'add', 'README.md'])
    await commit(repositoryPath, 'initial')
    let reads = 0
    const scanner = new RepositoryScanner({
      readBytes: async (targetPath) => {
        const content = await readFile(targetPath)
        reads += 1
        if (reads === 1) await writeFile(path, '# Changed during scan\n')
        return content
      }
    })

    await expect(
      scanner.scan(repositoryPath, { sourceId: 'repo-1', version: 2 })
    ).rejects.toThrow('Repository changed during scan')
    expect(reads).toBe(1)
  })

  it('uses an explicit revision label for a materialized remote repository', async () => {
    await writeFile(join(repositoryPath, 'README.md'), '# Remote\n')

    const snapshot = await new RepositoryScanner({
      now: () => 20,
      createId: () => 'snapshot-1'
    }).scan(repositoryPath, {
      sourceId: 'repo-1',
      version: 1,
      revisionLabel: 'main@abc123'
    })

    expect(snapshot.revisionLabel).toBe('main@abc123')
  })

  it('rejects directories that are not Git work trees', async () => {
    const plainDirectory = join(directory, 'plain')
    await mkdir(plainDirectory)

    await expect(
      new RepositoryScanner().validate(plainDirectory)
    ).rejects.toThrow('Repository is not a Git work tree')
  })

  it('rejects aggregate text overflow instead of returning a partial snapshot', async () => {
    await writeFile(join(repositoryPath, 'one.txt'), '123')
    await writeFile(join(repositoryPath, 'two.txt'), '456')

    await expect(
      new RepositoryScanner({ maxTotalBytes: 5 }).scan(repositoryPath, {
        sourceId: 'repo-1',
        version: 1
      })
    ).rejects.toThrow('Repository text exceeds the size limit')
  })
})

async function commit(repositoryPath: string, message: string): Promise<void> {
  await execute('git', [
    '-C',
    repositoryPath,
    '-c',
    'user.name=RealmFlow Test',
    '-c',
    'user.email=realmflow@example.invalid',
    'commit',
    '--quiet',
    '-m',
    message
  ])
}
