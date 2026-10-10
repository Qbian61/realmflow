// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BrowserArtifacts, browserUrl, publicBrowserUrl } from './browser-artifacts'

describe('browser artifact boundary', () => {
  let root: string
  let outside: string
  const artifacts = new BrowserArtifacts()
  const provenance = { sessionId: 'session', executionId: 'execution', sourceUrl: 'https://example.test/?token=secret' }
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'browser-artifacts-')))
    outside = await realpath(await mkdtemp(join(tmpdir(), 'browser-outside-')))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it('rejects non-web navigation and embedded credentials', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,test', 'https://u:p@example.test']) {
      expect(() => browserUrl(url)).toThrow('URL')
    }
    expect(browserUrl('http://localhost:8123/form')).toBe('http://localhost:8123/form')
    expect(publicBrowserUrl(provenance.sourceUrl)).not.toContain('secret')
  })

  it('rejects upload and output paths escaping through symlinks', async () => {
    await writeFile(join(outside, 'private'), 'private')
    await symlink(outside, join(root, 'link'))
    await expect(artifacts.upload('link/private', [root])).rejects.toThrow('scope')
    await expect(artifacts.save('link/output.png', Buffer.from('png'), [root], provenance)).rejects.toThrow('scope')
    expect(await readdir(outside)).toEqual(['private'])
  })

  it('accepts a local upload only if it is a regular bounded file', async () => {
    await writeFile(join(root, 'input.txt'), 'hello')
    expect(await artifacts.upload('input.txt', [root])).toBe(join(root, 'input.txt'))
    await expect(artifacts.upload(root, [root])).rejects.toThrow('regular')
    await expect(artifacts.upload(join(root, 'input.txt'), [])).rejects.toThrow('scope')
  })

  it('publishes a file with hash and sanitized local provenance', async () => {
    const result = await artifacts.save('shot.png', Buffer.from('png'), [root], provenance)
    expect(result).toMatchObject({ path: join(root, 'shot.png'), bytes: 3, sessionId: 'session', executionId: 'execution' })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    const metadata = JSON.parse(await readFile(`${result.path}.realmflow-browser.json`, 'utf8'))
    expect(metadata).toEqual(result)
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('does not overwrite existing files', async () => {
    await writeFile(join(root, 'shot.png'), 'original')
    await expect(artifacts.save('shot.png', Buffer.from('new'), [root], provenance)).rejects.toThrow()
    expect(await readFile(join(root, 'shot.png'), 'utf8')).toBe('original')
  })

  it('rolls back the new artifact if provenance publication fails', async () => {
    await mkdir(join(root, 'shot.png.realmflow-browser.json'))
    await expect(artifacts.save('shot.png', Buffer.from('new'), [root], provenance)).rejects.toThrow()
    expect(await readdir(root)).toEqual(['shot.png.realmflow-browser.json'])
  })

  it('does not publish an artifact after cancellation', async () => {
    await expect(artifacts.save('cancelled.png', Buffer.from('new'), [root], provenance, AbortSignal.abort()))
      .rejects.toThrow()
    expect(await readdir(root)).toEqual([])
  })
})
