import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SecurePathError, SecurePathService } from './secure-path-service'

describe('SecurePathService', () => {
  let temporaryDirectory: string
  let rootPath: string
  let service: SecurePathService

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-secure-path-'))
    rootPath = join(temporaryDirectory, 'root')
    await mkdir(rootPath)
    service = new SecurePathService()
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('returns canonical structured paths for an existing descendant', async () => {
    await mkdir(join(rootPath, 'docs'))
    await writeFile(join(rootPath, 'docs', 'scope.md'), '# Scope')
    const canonicalRoot = await service.canonicalizeDirectory(rootPath)

    await expect(
      service.resolveExistingPath(rootPath, 'docs/scope.md')
    ).resolves.toMatchObject({
      rootPath: canonicalRoot,
      targetPath: join(canonicalRoot, 'docs', 'scope.md'),
      relativePath: 'docs/scope.md'
    })
  })

  it('accepts dot as the authorized root only when root access is allowed', async () => {
    const canonicalRoot = await service.canonicalizeDirectory(rootPath)

    await expect(
      service.resolveExistingPath(rootPath, '.', true)
    ).resolves.toEqual({
      rootPath: canonicalRoot,
      targetPath: canonicalRoot,
      relativePath: ''
    })
    await expect(
      service.resolveExistingPath(rootPath, '.')
    ).rejects.toMatchObject({
      code: 'INVALID_PATH'
    })
  })

  it.each([
    '../outside.md',
    'docs/../outside.md',
    String.raw`docs\..\outside.md`,
    '/tmp/outside.md',
    String.raw`C:\outside.md`,
    'bad\u0000name.md',
    'bad\u001fname.md'
  ])('rejects invalid or traversing input before filesystem access: %s', async (path) => {
    await expect(service.resolveExistingPath(rootPath, path)).rejects.toMatchObject({
      name: 'SecurePathError',
      code: 'INVALID_PATH'
    })
  })

  it('rejects a symbolic link that resolves outside the authorized root', async () => {
    const outsideFile = join(temporaryDirectory, 'outside.md')
    await writeFile(outsideFile, 'private')
    await symlink(outsideFile, join(rootPath, 'outside-link.md'))

    await expect(
      service.resolveExistingPath(rootPath, 'outside-link.md')
    ).rejects.toEqual(
      expect.objectContaining<Partial<SecurePathError>>({
        code: 'PATH_OUTSIDE_ROOT'
      })
    )
  })

  it('rejects a creation path whose parent symlink escapes the root', async () => {
    const outsideDirectory = join(temporaryDirectory, 'outside')
    await mkdir(outsideDirectory)
    await symlink(outsideDirectory, join(rootPath, 'linked-directory'))

    await expect(
      service.resolvePathForCreation(rootPath, 'linked-directory/new.md')
    ).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT'
    })
    await expect(
      stat(join(outsideDirectory, 'new.md'))
    ).rejects.toThrow()
  })

  it.each(['req/escape', 'req\\escape', 'req escape', '.', 'CON', ''])(
    'rejects unsafe stable identifiers without rewriting them: %s',
    (id) => {
      expect(() => service.validateStableId(id)).toThrow(
        expect.objectContaining<Partial<SecurePathError>>({
          code: 'INVALID_NAME'
        })
      )
    }
  )

  it('accepts stable identifiers used by managed entities', () => {
    expect(service.validateStableId('req_d4e5f6-01')).toBe('req_d4e5f6-01')
  })
})
