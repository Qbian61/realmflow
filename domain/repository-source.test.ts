import {
  MAX_REPOSITORY_FILE_BYTES,
  createRepositorySnapshot,
  createRepositorySnapshotFile,
  createRepositorySource,
  isForcedRepositoryExclusion,
  normalizeRepositoryBranch,
  normalizeRepositoryPath,
  parseRemoteRepositoryManifest
} from './repository-source'

describe('repository source domain', () => {
  it('creates local sources without exposing their absolute path', () => {
    expect(
      createRepositorySource({
        sourceId: 'repo-1',
        workspaceId: 'space-1',
        mode: 'local',
        localPath: '/Users/example/private-repository',
        selectedBranch: ' main ',
        at: 10
      })
    ).toEqual({
      sourceId: 'repo-1',
      workspaceId: 'space-1',
      mode: 'local',
      localPath: '/Users/example/private-repository',
      selectedBranch: 'main',
      locator: 'local-repository:repo-1',
      currentVersion: 0,
      fileCount: 0,
      totalBytes: 0,
      createdAt: 10,
      updatedAt: 10
    })
  })

  it('creates remote sources from Connector-relative paths', () => {
    expect(
      createRepositorySource({
        sourceId: 'repo-1',
        workspaceId: 'space-1',
        mode: 'remote',
        connectorId: 'connector-git',
        path: '/repositories/realmflow',
        managedRelativePath: '.realmflow/knowledge/repositories/repo-1',
        selectedBranch: 'feature/docs',
        at: 10
      })
    ).toMatchObject({
      connectorId: 'connector-git',
      path: '/repositories/realmflow',
      selectedBranch: 'feature/docs',
      locator: 'connector:connector-git/repositories/realmflow',
      currentVersion: 0
    })
  })

  it('normalizes a selected repository branch', () => {
    expect(normalizeRepositoryBranch(' feature/docs ')).toBe('feature/docs')
  })

  it.each([
    '',
    ' ',
    'refs/heads/main',
    'refs/remotes/origin/main',
    '/main',
    'main/',
    'feature//docs',
    'feature/../main',
    'main\u0000hidden',
    '-main',
    'main.lock'
  ])('rejects unsafe repository branch %j', (branch) => {
    expect(() => normalizeRepositoryBranch(branch)).toThrow(
      'Repository branch is invalid'
    )
  })

  it.each([
    '',
    '/absolute.ts',
    '../outside.ts',
    'src/../secret.ts',
    'src\\index.ts',
    'src//index.ts',
    'src/./index.ts'
  ])('rejects unsafe repository path %j', (path) => {
    expect(() => normalizeRepositoryPath(path)).toThrow(
      'Repository path is invalid'
    )
  })

  it.each([
    '.git/config',
    '.realmflow/state.db',
    'node_modules/pkg/index.js',
    'packages/app/dist/index.js',
    'build/output.txt',
    'coverage/report.json',
    '.next/cache/data',
    'target/release/app',
    'vendor/package/code.ts',
    '.env',
    '.env.production',
    'server.pem',
    'private.key',
    'config/credentials.json',
    '.npmrc',
    '.pypirc'
  ])('forces exclusion of %s', (path) => {
    expect(isForcedRepositoryExclusion(path)).toBe(true)
  })

  it('does not force-exclude ordinary source files', () => {
    expect(isForcedRepositoryExclusion('src/index.ts')).toBe(false)
    expect(isForcedRepositoryExclusion('docs/environment.md')).toBe(false)
  })

  it('parses a strict UTF-8 remote repository manifest', () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        revision: 'main@abc123',
        files: [
          { path: 'src/index.ts', content: 'export const value = 1\n' },
          { path: '.gitignore', content: 'dist/\n' }
        ]
      })
    )

    expect(
      parseRemoteRepositoryManifest({
        mediaType: 'application/vnd.realmflow.repository+json; charset=utf-8',
        body
      })
    ).toEqual({
      revision: 'main@abc123',
      files: [
        { path: '.gitignore', content: 'dist/\n' },
        { path: 'src/index.ts', content: 'export const value = 1\n' }
      ]
    })
  })

  it.each([
    {
      label: 'unsupported media type',
      mediaType: 'application/json',
      value: { revision: 'main', files: [] }
    },
    {
      label: 'duplicate paths',
      mediaType: 'application/vnd.realmflow.repository+json',
      value: {
        revision: 'main',
        files: [
          { path: 'src/index.ts', content: 'one' },
          { path: 'src/index.ts', content: 'two' }
        ]
      }
    },
    {
      label: 'unknown fields',
      mediaType: 'application/vnd.realmflow.repository+json',
      value: { revision: 'main', files: [], credential: 'secret' }
    }
  ])('rejects remote manifests with $label', ({ mediaType, value }) => {
    expect(() =>
      parseRemoteRepositoryManifest({
        mediaType,
        body: new TextEncoder().encode(JSON.stringify(value))
      })
    ).toThrow('Remote repository manifest is invalid')
  })

  it('creates immutable file metadata and a deterministic snapshot', () => {
    const files = [
      createRepositorySnapshotFile({
        relativePath: 'src/index.ts',
        content: new TextEncoder().encode('export {}\n')
      }),
      createRepositorySnapshotFile({
        relativePath: 'README.md',
        content: new TextEncoder().encode('# RealmFlow\n')
      })
    ]

    expect(
      createRepositorySnapshot({
        id: 'snapshot-1',
        sourceId: 'repo-1',
        version: 1,
        branch: 'main',
        revisionLabel: 'main@abc123',
        files,
        scannedAt: 20
      })
    ).toMatchObject({
      id: 'snapshot-1',
      sourceId: 'repo-1',
      version: 1,
      branch: 'main',
      revisionLabel: 'main@abc123',
      fileCount: 2,
      totalBytes: 22,
      files: [
        {
          relativePath: 'README.md',
          content: '# RealmFlow\n',
          contentChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
        },
        {
          relativePath: 'src/index.ts',
          content: 'export {}\n',
          contentChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
        }
      ]
    })
  })

  it('rejects binary and oversized repository files', () => {
    expect(() =>
      createRepositorySnapshotFile({
        relativePath: 'asset.bin',
        content: new Uint8Array([1, 0, 2])
      })
    ).toThrow('Repository file is binary')

    expect(() =>
      createRepositorySnapshotFile({
        relativePath: 'large.txt',
        content: new Uint8Array(MAX_REPOSITORY_FILE_BYTES + 1)
      })
    ).toThrow('Repository file is too large')
  })
})
