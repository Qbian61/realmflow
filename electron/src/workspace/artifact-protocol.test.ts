import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createArtifactProtocolHandler,
  parseArtifactUrl
} from './artifact-protocol'

describe('artifact protocol', () => {
  it('parses encoded requirement ids and relative file paths', () => {
    expect(
      parseArtifactUrl(
        'realmflow-artifact://preview/requirement-1/docs/design%20preview.html'
      )
    ).toEqual({
      requirementId: 'requirement-1',
      path: 'docs/design preview.html'
    })
  })

  it('serves HTML with scripts and network access disabled', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-preview-'))
    const htmlPath = join(temporaryDirectory, 'preview.html')
    await writeFile(htmlPath, '<h1>Preview</h1><script>alert(1)</script>')
    const handler = createArtifactProtocolHandler({
      resolvePreviewPath: async () => htmlPath
    })

    const response = await handler({
      url: 'realmflow-artifact://preview/requirement-1/preview.html'
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
    expect(await response.text()).toContain('<h1>Preview</h1>')
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('serves OFD bytes with a fixed-layout MIME type', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-preview-'))
    const ofdPath = join(temporaryDirectory, 'invoice.ofd')
    const content = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    await writeFile(ofdPath, content)
    const handler = createArtifactProtocolHandler({
      resolvePreviewPath: async () => ofdPath
    })

    const response = await handler({
      url: 'realmflow-artifact://preview/requirement-1/invoice.ofd'
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/ofd')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(content)
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('serves PDF bytes with the PDF MIME type', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-preview-'))
    const pdfPath = join(temporaryDirectory, 'resume.pdf')
    const content = Buffer.from('%PDF-1.3\n')
    await writeFile(pdfPath, content)
    const handler = createArtifactProtocolHandler({
      resolvePreviewPath: async () => pdfPath
    })

    const response = await handler({
      url: 'realmflow-artifact://preview/requirement-1/resume.pdf'
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(content)
    await rm(temporaryDirectory, { recursive: true, force: true })
  })
})
