import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ArchiveAdapter,
  ArchiveError
} from './archive-adapter'

describe('ArchiveAdapter', () => {
  const temporaryDirectories: string[] = []
  const adapter = new ArchiveAdapter()

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((path) =>
        rm(path, { recursive: true, force: true })
      )
    )
  })

  it.each([
    ['zip', () => zip({ 'docs/readme.txt': 'hello' })],
    ['tar', () => tar([{ path: 'docs/readme.txt', content: 'hello' }])],
    ['tgz', () => gzip(tar([{ path: 'docs/readme.txt', content: 'hello' }]))],
    ['gz', () => gzip(Buffer.from('hello'))]
  ] as const)(
    'lists %s entries from memory without writing output',
    async (format, fixture) => {
      const output = await tempPath('missing-output')

      const listing = await adapter.list({
        format,
        archiveName: `bundle.${format}`,
        content: await fixture()
      })

      expect(listing.entries).toEqual(
        expect.arrayContaining([
        expect.objectContaining({
          path: format === 'gz' ? 'bundle' : 'docs/readme.txt',
          type: 'file',
          size: 5
        })
        ])
      )
      await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it.each([
    '../escape.txt',
    '/absolute.txt',
    'C:\\escape.txt',
    '\\\\server\\share\\escape.txt'
  ])('rejects unsafe entry path %s', async (path) => {
    await expect(
      adapter.list({
        format: 'zip',
        archiveName: 'unsafe.zip',
        content: await zip({ [path]: 'blocked' })
      })
    ).rejects.toEqual(
      new ArchiveError('archive_unsafe_path', 'Archive entry path is unsafe')
    )
  })

  it.each([
    ['zip', () => zipSymlink('link', '../outside')],
    [
      'tar',
      () =>
        Promise.resolve(
          tar([{ path: 'link', type: '2', linkPath: '../outside' }])
        )
    ],
    [
      'tar',
      () =>
        Promise.resolve(
          tar([{ path: 'hard-link', type: '1', linkPath: 'target' }])
        )
    ]
  ] as const)('rejects links in %s archives', async (format, fixture) => {
    await expect(
      adapter.list({
        format,
        archiveName: `unsafe.${format}`,
        content: await fixture()
      })
    ).rejects.toMatchObject({
      code: 'archive_unsupported_entry'
    })
  })

  it('rejects entry count, per-entry size, expanded size, and ratio limits', async () => {
    const fixtures = [
      {
        limits: { maxEntries: 1 },
        content: await zip({ 'one.txt': '1', 'two.txt': '2' }),
        code: 'archive_entry_limit_exceeded'
      },
      {
        limits: { maxEntryBytes: 3 },
        content: await zip({ 'large.txt': '1234' }),
        code: 'archive_expanded_size_exceeded'
      },
      {
        limits: { maxExpandedBytes: 3 },
        content: await zip({ 'one.txt': '12', 'two.txt': '34' }),
        code: 'archive_expanded_size_exceeded'
      },
      {
        limits: { maxCompressionRatio: 2 },
        content: await zip({ 'repeat.txt': 'a'.repeat(10_000) }),
        code: 'archive_compression_ratio_exceeded'
      }
    ] as const

    for (const fixture of fixtures) {
      await expect(
        adapter.list({
          format: 'zip',
          archiveName: 'limited.zip',
          content: fixture.content,
          limits: fixture.limits
        })
      ).rejects.toMatchObject({ code: fixture.code })
    }
  })

  it('rejects ZIP metadata limits before opening a corrupted entry body', async () => {
    const content = corruptFirstZipEntryBody(
      await zip({ 'large.txt': 'a'.repeat(10_000) })
    )

    await expect(
      adapter.list({
        format: 'zip',
        archiveName: 'corrupted-bomb.zip',
        content,
        limits: {
          maxEntryBytes: 100,
          maxExpandedBytes: 100,
          maxCompressionRatio: 10_000
        }
      })
    ).rejects.toMatchObject({
      code: 'archive_expanded_size_exceeded'
    })
  })

  it.each(['tar', 'tgz'] as const)(
    'stops %s parsing at the first safety violation',
    async (format) => {
      const invalidTail = Buffer.alloc(512, 0xff)
      const oversizedTar = Buffer.concat([
        tar([{ path: 'large.txt', content: '1234' }]).subarray(0, -1024),
        invalidTail
      ])

      await expect(
        adapter.list({
          format,
          archiveName: `oversized.${format}`,
          content: format === 'tgz' ? await gzip(oversizedTar) : oversizedTar,
          limits: {
            maxEntryBytes: 3,
            maxExpandedBytes: 100,
            maxCompressionRatio: 10_000
          }
        })
      ).rejects.toMatchObject({
        code: 'archive_expanded_size_exceeded'
      })
    }
  )

  it('bounds GZ expansion while decompressing', async () => {
    await expect(
      adapter.list({
        format: 'gz',
        archiveName: 'large.txt.gz',
        content: await gzip(Buffer.from('a'.repeat(10_000))),
        limits: {
          maxEntryBytes: 100,
          maxExpandedBytes: 100,
          maxCompressionRatio: 10_000
        }
      })
    ).rejects.toMatchObject({
      code: 'archive_expanded_size_exceeded'
    })
  })

  it('extracts only validated regular files beneath staging', async () => {
    const destinationPath = await tempPath('extracted')

    const result = await adapter.extract({
      format: 'zip',
      archiveName: 'bundle.zip',
      content: await zip({
        'docs/readme.txt': 'hello',
        'assets/icon.txt': 'icon'
      }),
      destinationPath
    })

    expect(result.fileCount).toBe(2)
    expect(await readFile(join(destinationPath, 'docs/readme.txt'), 'utf8')).toBe(
      'hello'
    )
    expect(await readFile(join(destinationPath, 'assets/icon.txt'), 'utf8')).toBe(
      'icon'
    )
  })

  it.each(['tar', 'tgz'] as const)(
    'extracts validated regular files from %s streams',
    async (format) => {
      const destinationPath = await tempPath(`extracted-${format}`)
      const tarContent = tar([
        { path: 'docs/readme.txt', content: 'hello' },
        { path: 'assets/icon.txt', content: 'icon' }
      ])

      const result = await adapter.extract({
        format,
        archiveName: `bundle.${format}`,
        content: format === 'tgz' ? await gzip(tarContent) : tarContent,
        destinationPath
      })

      expect(result.fileCount).toBe(2)
      expect(
        await readFile(join(destinationPath, 'docs/readme.txt'), 'utf8')
      ).toBe('hello')
      expect(
        await readFile(join(destinationPath, 'assets/icon.txt'), 'utf8')
      ).toBe('icon')
    }
  )

  it('removes ZIP output when streamed entry decompression fails', async () => {
    const destinationPath = await tempPath('corrupted-output')

    await expect(
      adapter.extract({
        format: 'zip',
        archiveName: 'corrupted.zip',
        content: corruptFirstZipEntryBody(
          await zip({ 'docs/readme.txt': 'hello' })
        ),
        destinationPath
      })
    ).rejects.toMatchObject({
      code: 'file_parse_failed'
    })
    await expect(stat(destinationPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['zip', 'tar', 'tgz', 'gz'] as const)(
    'creates and reopens a valid %s candidate',
    async (format) => {
      const sourcePath = await tempPath('source')
      await writeFile(sourcePath, 'candidate')

      const candidate = await adapter.create({
        format,
        archiveName: `created.${format}`,
        entries: [
          {
            path: format === 'gz' ? 'source' : 'nested/source.txt',
            canonicalPath: sourcePath,
            type: 'file'
          }
        ]
      })
      const listing = await adapter.list({
        format,
        archiveName: `created.${format}`,
        content: candidate
      })

      expect(listing.entries).toEqual(
        expect.arrayContaining([
        expect.objectContaining({
          path: format === 'gz' ? 'created' : 'nested/source.txt',
          size: 9,
          type: 'file'
        })
        ])
      )
    }
  )

  async function tempPath(name: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-archive-'))
    temporaryDirectories.push(directory)
    return join(directory, name)
  }
})

async function zip(files: Record<string, string>): Promise<Buffer> {
  const archive = new JSZip()
  for (const [path, content] of Object.entries(files)) archive.file(path, content)
  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    platform: 'UNIX'
  })
}

async function zipSymlink(path: string, target: string): Promise<Buffer> {
  const archive = new JSZip()
  archive.file(path, target, { unixPermissions: 0o120777 })
  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    platform: 'UNIX'
  })
}

function corruptFirstZipEntryBody(content: Buffer): Buffer {
  const corrupted = Buffer.from(content)
  const fileNameLength = corrupted.readUInt16LE(26)
  const extraFieldLength = corrupted.readUInt16LE(28)
  const bodyOffset = 30 + fileNameLength + extraFieldLength
  corrupted[bodyOffset] ^= 0xff
  return corrupted
}

function gzip(content: Buffer): Promise<Buffer> {
  return import('node:zlib').then(
    ({ gzip: gzipCallback }) =>
      new Promise((resolve, reject) => {
        gzipCallback(content, (error, result) =>
          error ? reject(error) : resolve(result)
        )
      })
  )
}

function tar(
  entries: Array<{
    path: string
    content?: string
    type?: '0' | '1' | '2'
    linkPath?: string
  }>
): Buffer {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const content = Buffer.from(entry.content ?? '')
    const header = Buffer.alloc(512)
    writeTarText(header, 0, 100, entry.path)
    writeTarOctal(header, 100, 8, entry.type === '2' ? 0o777 : 0o644)
    writeTarOctal(header, 108, 8, 0)
    writeTarOctal(header, 116, 8, 0)
    writeTarOctal(header, 124, 12, content.byteLength)
    writeTarOctal(header, 136, 12, 0)
    header.fill(0x20, 148, 156)
    header[156] = (entry.type ?? '0').charCodeAt(0)
    writeTarText(header, 157, 100, entry.linkPath ?? '')
    writeTarText(header, 257, 6, 'ustar')
    writeTarText(header, 263, 2, '00')
    writeTarOctal(
      header,
      148,
      8,
      header.reduce((sum, byte) => sum + byte, 0)
    )
    chunks.push(header, content)
    const padding = (512 - (content.byteLength % 512)) % 512
    if (padding > 0) chunks.push(Buffer.alloc(padding))
  }
  chunks.push(Buffer.alloc(1024))
  return Buffer.concat(chunks)
}

function writeTarText(
  target: Buffer,
  offset: number,
  length: number,
  value: string
): void {
  target.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf8')
}

function writeTarOctal(
  target: Buffer,
  offset: number,
  length: number,
  value: number
): void {
  const encoded = value.toString(8).padStart(length - 1, '0')
  target.write(encoded, offset, length - 1, 'ascii')
  target[offset + length - 1] = 0
}
