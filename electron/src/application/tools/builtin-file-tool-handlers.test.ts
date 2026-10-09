import { createHash } from 'node:crypto'
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  createFileToolHandlers,
  type FileToolDependencies
} from './builtin-file-tool-handlers'

describe('builtin file Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let dependencies: FileToolDependencies

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-tools-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    dependencies = {
      trashItem: vi.fn().mockResolvedValue(undefined)
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('lists, reads, searches, and inspects files inside one scope', async () => {
    await mkdir(join(rootPath, 'docs'))
    await writeFile(join(rootPath, 'docs', 'guide.md'), 'RealmFlow guide')

    await expect(run('files.list', { path: 'docs' })).resolves.toEqual({
      path: 'docs',
      entries: [
        {
          name: 'guide.md',
          path: 'docs/guide.md',
          type: 'file',
          size: 15,
          format: 'md',
          readMode: 'text',
          writable: true,
          preferredTool: 'files.read',
          conversionRequired: false
        }
      ]
    })
    await expect(
      run('files.read', { path: 'docs/guide.md', offset: 5, limit: 4 })
    ).resolves.toMatchObject({
      content: 'Flow',
      offset: 5,
      nextOffset: 9,
      truncated: true
    })
    await expect(
      run('files.search', {
        path: 'docs',
        query: 'realmflow',
        mode: 'content'
      })
    ).resolves.toEqual({
      matches: [{ path: 'docs/guide.md', line: 1, preview: 'RealmFlow guide' }],
      truncated: false
    })
    await expect(
      run('files.stat', { path: 'docs/guide.md' })
    ).resolves.toMatchObject({
      path: 'docs/guide.md',
      type: 'file',
      size: 15,
      readMode: 'text',
      checksum: sha256('RealmFlow guide')
    })
  })

  it('inspects multiple files in one stat call', async () => {
    await mkdir(join(rootPath, 'docs'))
    await writeFile(join(rootPath, 'docs', 'first.md'), 'first')
    await writeFile(join(rootPath, 'docs', 'second.md'), 'second')

    await expect(
      run('files.stat', {
        paths: ['docs/first.md', 'docs/second.md']
      })
    ).resolves.toMatchObject({
      files: [
        {
          path: 'docs/first.md',
          type: 'file',
          size: 5,
          checksum: sha256('first')
        },
        {
          path: 'docs/second.md',
          type: 'file',
          size: 6,
          checksum: sha256('second')
        }
      ]
    })
  })

  it('accepts absolute paths that stay inside the authorized root', async () => {
    await mkdir(join(rootPath, 'docs'))
    await writeFile(join(rootPath, 'docs', 'guide.md'), 'RealmFlow guide')

    await expect(
      run('files.stat', { path: join(rootPath, 'docs', 'guide.md') })
    ).resolves.toMatchObject({
      path: 'docs/guide.md',
      type: 'file',
      checksum: sha256('RealmFlow guide')
    })
    await expect(
      run('files.list', { path: join(rootPath, 'docs') })
    ).resolves.toMatchObject({
      path: 'docs',
      entries: [
        expect.objectContaining({
          name: 'guide.md',
          path: 'docs/guide.md'
        })
      ]
    })
  })

  it('uses absolute in-root paths when the model supplies an unauthorized parent scopeRoot', async () => {
    await mkdir(join(rootPath, 'docs'))
    await writeFile(join(rootPath, 'docs', 'guide.md'), 'RealmFlow guide')

    await expect(
      run('files.list', {
        path: join(rootPath, 'docs'),
        scopeRoot: temporaryDirectory
      })
    ).resolves.toMatchObject({
      path: 'docs',
      entries: [
        expect.objectContaining({
          name: 'guide.md',
          path: 'docs/guide.md'
        })
      ]
    })
  })

  it('returns per-path results for mixed batch stat requests', async () => {
    await mkdir(join(rootPath, 'docs'))
    await writeFile(join(rootPath, 'docs', 'first.md'), 'first')

    await expect(
      run('files.stat', {
        paths: ['docs/first.md', 'docs/missing.md']
      })
    ).resolves.toMatchObject({
      files: [
        {
          path: 'docs/first.md',
          type: 'file',
          checksum: sha256('first')
        },
        {
          path: 'docs/missing.md',
          error: {
            code: 'file_not_found',
            message: 'File does not exist'
          }
        }
      ]
    })
  })

  it('identifies the correct reader for documents and images', async () => {
    await writeFile(join(rootPath, 'resume.pdf'), '%PDF-1.7')
    await writeFile(
      join(rootPath, 'resume.docx'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04])
    )
    await writeFile(join(rootPath, 'Dockerfile'), 'FROM node:20\n')
    await writeFile(join(rootPath, 'photo.png'), Buffer.from([0x89, 0x50]))

    await expect(run('files.list', { path: '' })).resolves.toMatchObject({
      entries: [
        expect.objectContaining({
          name: 'Dockerfile',
          format: 'text',
          readMode: 'text',
          writable: true,
          preferredTool: 'files.read',
          conversionRequired: false
        }),
        expect.objectContaining({
          name: 'photo.png',
          format: 'png',
          readMode: 'preview',
          writable: true,
          preferredTool: 'image.inspect'
        }),
        expect.objectContaining({
          name: 'resume.docx',
          format: 'docx',
          readMode: 'structured',
          writable: true,
          preferredTool: 'document.inspect',
          conversionRequired: false
        }),
        expect.objectContaining({
          name: 'resume.pdf',
          format: 'pdf',
          readMode: 'structured',
          writable: true,
          preferredTool: 'pdf.inspect',
          conversionRequired: false
        })
      ]
    })
    await expect(
      run('files.stat', { path: 'resume.pdf' })
    ).resolves.toMatchObject({
      format: 'pdf',
      readMode: 'structured',
      writable: true,
      preferredTool: 'pdf.inspect',
      conversionRequired: false
    })
  })

  it('rejects an extension that conflicts with the detected file signature', async () => {
    await writeFile(
      join(rootPath, 'not-a-document.pdf'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )

    await expect(run('files.stat', { path: 'not-a-document.pdf' })).rejects.toThrow(
      'File format conflicts with its extension or MIME type'
    )
  })

  it('rejects traversal and symbolic-link escapes', async () => {
    await writeFile(join(temporaryDirectory, 'secret.txt'), 'private')
    await symlink(
      join(temporaryDirectory, 'secret.txt'),
      join(rootPath, 'secret-link.txt')
    )

    await expect(
      run('files.read', { path: '../secret.txt' })
    ).rejects.toThrow('Path is outside the bound workspace')
    await expect(
      run('files.read', { path: 'secret-link.txt' })
    ).rejects.toThrow('Path is outside the bound workspace')
  })

  it('atomically writes only when the expected checksum matches', async () => {
    await writeFile(join(rootPath, 'note.md'), 'old')

    await expect(
      run('files.write', {
        path: 'note.md',
        mode: 'replace',
        content: 'new',
        expectedChecksum: sha256('wrong')
      })
    ).rejects.toMatchObject({
      code: 'file_conflict',
      message: 'File checksum conflict'
    })
    expect(await readFile(join(rootPath, 'note.md'), 'utf8')).toBe('old')

    await expect(
      run('files.write', {
        path: 'note.md',
        mode: 'replace',
        content: 'new',
        expectedChecksum: sha256('old')
      })
    ).resolves.toMatchObject({
      path: 'note.md',
      bytesWritten: 3,
      checksum: sha256('new')
    })
    expect(await readFile(join(rootPath, 'note.md'), 'utf8')).toBe('new')
  })

  it('keeps UTF-8 code points intact across bounded reads', async () => {
    await writeFile(join(rootPath, 'unicode.txt'), 'A你B')

    await expect(
      run('files.read', { path: 'unicode.txt', offset: 1, limit: 2 })
    ).resolves.toMatchObject({
      content: '你',
      offset: 1,
      nextOffset: 4,
      truncated: true,
      totalBytes: 5
    })
  })

  it('rejects structured documents from the plain text reader', async () => {
    await writeFile(join(rootPath, 'report.pdf'), '%PDF-1.7')

    await expect(
      run('files.read', { path: 'report.pdf' })
    ).rejects.toThrow('Use pdf.inspect for this file')
  })

  it('requires explicit create and replace modes', async () => {
    await writeFile(join(rootPath, 'existing.txt'), 'old')

    await expect(
      run('files.write', {
        path: 'existing.txt',
        mode: 'create',
        content: 'new',
        expectedAbsent: true
      })
    ).rejects.toThrow('File already exists')
    await expect(
      run('files.write', {
        path: 'missing.txt',
        mode: 'replace',
        content: 'new',
        expectedChecksum: sha256('old')
      })
    ).rejects.toThrow('File does not exist')
  })

  it.each([
    ['config.json', '{"broken":', 'JSON'],
    ['config.yaml', 'key: [', 'YAML'],
    ['config.xml', '<root>', 'XML'],
    ['config.toml', 'key = [', 'TOML']
  ])(
    'validates %s before replacing the original file',
    async (fileName, invalidContent, format) => {
      await writeFile(join(rootPath, fileName), 'key = "old"')

      await expect(
        run('files.write', {
          path: fileName,
          mode: 'replace',
          content: invalidContent,
          expectedChecksum: sha256('key = "old"')
        })
      ).rejects.toThrow(`File content is invalid ${format}`)
      expect(await readFile(join(rootPath, fileName), 'utf8')).toBe(
        'key = "old"'
      )
    }
  )

  it('applies structured replacements with prior-content validation', async () => {
    await writeFile(join(rootPath, 'note.md'), 'alpha beta beta')

    await expect(
      run('files.apply_patch', {
        path: 'note.md',
        expectedChecksum: sha256('alpha beta beta'),
        edits: [{ oldText: 'beta', newText: 'release', replaceAll: true }]
      })
    ).resolves.toMatchObject({
      path: 'note.md',
      replacements: 2,
      checksum: sha256('alpha release release')
    })
    expect(await readFile(join(rootPath, 'note.md'), 'utf8')).toBe(
      'alpha release release'
    )
  })

  it('does not apply a patch that would invalidate structured text', async () => {
    const original = '{"enabled":true}'
    await writeFile(join(rootPath, 'config.json'), original)

    await expect(
      run('files.apply_patch', {
        path: 'config.json',
        expectedChecksum: sha256(original),
        edits: [{ oldText: 'true', newText: '[' }]
      })
    ).rejects.toThrow('File content is invalid JSON')
    expect(await readFile(join(rootPath, 'config.json'), 'utf8')).toBe(original)
  })

  it('creates, copies, moves, and permanently deletes authorized paths', async () => {
    await run('files.create_directory', {
      path: 'docs',
      expectedAbsent: true
    })
    await run('files.write', {
      path: 'docs/a.txt',
      mode: 'create',
      content: 'a',
      expectedAbsent: true
    })
    await run('files.copy', {
      sourcePath: 'docs/a.txt',
      targetPath: 'docs/b.txt',
      expectedChecksum: sha256('a'),
      expectedAbsent: true
    })
    await run('files.move', {
      sourcePath: 'docs/b.txt',
      targetPath: 'moved.txt',
      expectedChecksum: sha256('a'),
      expectedAbsent: true
    })

    expect(await readFile(join(rootPath, 'moved.txt'), 'utf8')).toBe('a')
    await expect(stat(join(rootPath, 'docs', 'b.txt'))).rejects.toThrow()
    await run('files.delete_permanently', {
      path: 'moved.txt',
      expectedChecksum: sha256('a')
    })
    await expect(stat(join(rootPath, 'moved.txt'))).rejects.toThrow()
  })

  it('rejects copy, move, trash, and delete when the source checksum is stale', async () => {
    await writeFile(join(rootPath, 'current.txt'), 'current')
    const stale = sha256('stale')

    for (const [name, arguments_] of [
      [
        'files.copy',
        {
          sourcePath: 'current.txt',
          targetPath: 'copy.txt',
          expectedChecksum: stale,
          expectedAbsent: true
        }
      ],
      [
        'files.move',
        {
          sourcePath: 'current.txt',
          targetPath: 'moved.txt',
          expectedChecksum: stale,
          expectedAbsent: true
        }
      ],
      ['files.trash', { path: 'current.txt', expectedChecksum: stale }],
      [
        'files.delete_permanently',
        { path: 'current.txt', expectedChecksum: stale }
      ]
    ] as const) {
      await expect(run(name, arguments_)).rejects.toMatchObject({
        code: 'file_conflict'
      })
    }

    expect(await readFile(join(rootPath, 'current.txt'), 'utf8')).toBe('current')
    expect(dependencies.trashItem).not.toHaveBeenCalled()
  })

  it('delegates trash to the system trash port with a canonical path', async () => {
    await writeFile(join(rootPath, 'obsolete.txt'), 'old')

    await expect(
      run('files.trash', {
        path: 'obsolete.txt',
        expectedChecksum: sha256('old')
      })
    ).resolves.toEqual({ path: 'obsolete.txt', trashed: true })
    expect(dependencies.trashItem).toHaveBeenCalledWith(
      join(await realpath(rootPath), 'obsolete.txt')
    )
  })

  it('requires a direct user request for permanent deletion', async () => {
    await writeFile(join(rootPath, 'protected.txt'), 'keep')

    await expect(
      run(
        'files.delete_permanently',
        { path: 'protected.txt' },
        { type: 'skill', id: 'skill-1' }
      )
    ).rejects.toThrow('Permanent deletion requires a local user request')
    expect(await readFile(join(rootPath, 'protected.txt'), 'utf8')).toBe('keep')
  })

  async function run(
    name: string,
    arguments_: JsonObject,
    requestedBy: {
      type: 'user' | 'model' | 'workflow' | 'schedule' | 'skill'
      id: string
    } = { type: 'user', id: 'local-user' }
  ) {
    const handler = createFileToolHandlers(dependencies).find(
      (candidate) => candidate.name === name
    )
    if (!handler) throw new Error(`Missing handler: ${name}`)
    return handler.execute({
      arguments: arguments_,
      requestedBy,
      context: {
        owner: { type: 'application', id: 'realmflow' },
        correlationId: 'correlation-1',
        causationId: 'command-1'
      },
      scopeRoots: [rootPath],
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }
})

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
