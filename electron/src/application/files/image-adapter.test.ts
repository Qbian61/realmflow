import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  ImageAdapterError,
  SharpImageAdapter,
  sanitizeSvg
} from './image-adapter'

describe('SharpImageAdapter', () => {
  it('reports normalized dimensions and metadata after applying EXIF orientation', async () => {
    const source = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: '#dd3344'
      }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()

    await expect(new SharpImageAdapter().inspect(source, 'jpeg')).resolves.toMatchObject({
      format: 'jpeg',
      width: 2,
      height: 3,
      orientation: 1,
      colorSpace: expect.any(String),
      hasAlpha: false,
      animated: false,
      exif: { orientation: 6 }
    })
  })

  it('resizes, crops, rotates, compresses, and converts deterministic candidates', async () => {
    const adapter = new SharpImageAdapter()
    const source = await samplePng(80, 60)

    const resized = await adapter.transform(source, 'resize', {
      width: 40,
      height: 30,
      fit: 'fill'
    })
    const cropped = await adapter.transform(resized.content, 'crop', {
      left: 5,
      top: 4,
      width: 20,
      height: 10
    })
    const rotated = await adapter.transform(cropped.content, 'rotate', {
      angle: 90
    })
    const converted = await adapter.transform(rotated.content, 'convert', {
      format: 'webp',
      quality: 80
    })
    const compressed = await adapter.transform(source, 'compress', {
      format: 'jpeg',
      quality: 35
    })

    await expect(sharp(resized.content).metadata()).resolves.toMatchObject({
      width: 40,
      height: 30
    })
    await expect(sharp(cropped.content).metadata()).resolves.toMatchObject({
      width: 20,
      height: 10
    })
    await expect(sharp(rotated.content).metadata()).resolves.toMatchObject({
      width: 10,
      height: 20
    })
    await expect(sharp(converted.content).metadata()).resolves.toMatchObject({
      format: 'webp'
    })
    await expect(sharp(compressed.content).metadata()).resolves.toMatchObject({
      format: 'jpeg'
    })
  })

  it('composites images, redacts regions, and removes EXIF metadata', async () => {
    const adapter = new SharpImageAdapter()
    const source = await samplePng(40, 30)
    const overlay = await samplePng(8, 6, '#22aa66')

    const composited = await adapter.transform(source, 'composite', {
      overlays: [
        {
          contentBase64: overlay.toString('base64'),
          left: 2,
          top: 3
        }
      ]
    })
    const redacted = await adapter.transform(composited.content, 'redact', {
      regions: [{ left: 0, top: 0, width: 10, height: 5 }],
      color: '#000000'
    })
    const metadataSource = await sharp(source)
      .jpeg()
      .withMetadata({ orientation: 6, density: 144 })
      .toBuffer()
    const stripped = await adapter.transform(metadataSource, 'remove_exif', {})

    expect(redacted.summary).toMatchObject({ operation: 'redact', regions: 1 })
    const metadata = await sharp(stripped.content).metadata()
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
  })

  it('rejects unsafe SVG scripts, event handlers, and external resources', () => {
    const unsafe = [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>'
    ]

    for (const svg of unsafe) {
      expect(() => sanitizeSvg(Buffer.from(svg))).toThrowError(
        expect.objectContaining<Partial<ImageAdapterError>>({
          code: 'image_svg_unsafe'
        })
      )
    }
    expect(
      sanitizeSvg(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
        )
      ).toString('utf8')
    ).toContain('<rect')
  })
})

async function samplePng(
  width: number,
  height: number,
  background = '#3366aa'
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background }
  })
    .png()
    .toBuffer()
}
