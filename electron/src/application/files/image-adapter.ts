import sharp from 'sharp'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'svg'

export type ImageTransformOperation =
  | 'resize'
  | 'crop'
  | 'rotate'
  | 'compress'
  | 'convert'
  | 'composite'
  | 'redact'
  | 'remove_exif'

export type ImageInspection = {
  format: ImageFormat
  width: number
  height: number
  orientation: 1
  colorSpace: string
  hasAlpha: boolean
  animated: boolean
  pages: number
  exif: {
    orientation?: number
    density?: number
  }
}

export type ImageTransformResult = {
  content: Buffer
  inspection: ImageInspection
  summary: Record<string, string | number | boolean>
}

export class ImageAdapterError extends Error {
  readonly name = 'ImageAdapterError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class SharpImageAdapter {
  async inspect(
    content: Uint8Array,
    declaredFormat?: ImageFormat
  ): Promise<ImageInspection> {
    const source = Buffer.from(content)
    if (declaredFormat === 'svg' || looksLikeSvg(source)) sanitizeSvg(source)
    const metadata = await sharp(source, { animated: true }).metadata()
    const format = normalizeFormat(metadata.format)
    if (declaredFormat && format !== declaredFormat) {
      throw new ImageAdapterError(
        'image_format_conflict',
        'Image content does not match its declared format'
      )
    }
    const orientation = metadata.orientation
    const swapsDimensions =
      orientation === 5 ||
      orientation === 6 ||
      orientation === 7 ||
      orientation === 8
    const width = swapsDimensions ? metadata.height : metadata.width
    const height = swapsDimensions ? metadata.width : metadata.height
    if (!width || !height) {
      throw new ImageAdapterError(
        'image_metadata_invalid',
        'Image dimensions are unavailable'
      )
    }
    return {
      format,
      width,
      height,
      orientation: 1,
      colorSpace: metadata.space ?? 'unknown',
      hasAlpha: metadata.hasAlpha ?? false,
      animated: (metadata.pages ?? 1) > 1,
      pages: metadata.pages ?? 1,
      exif: {
        ...(orientation === undefined ? {} : { orientation }),
        ...(metadata.density === undefined ? {} : { density: metadata.density })
      }
    }
  }

  async transform(
    content: Uint8Array,
    operation: ImageTransformOperation,
    parameters: Record<string, unknown>
  ): Promise<ImageTransformResult> {
    const source = Buffer.from(content)
    const sourceMetadata = await sharp(source, { animated: false }).metadata()
    const sourceFormat = normalizeFormat(sourceMetadata.format)
    if (sourceFormat === 'svg') sanitizeSvg(source)
    let pipeline = sharp(source, { animated: false }).autoOrient()
    const summary: Record<string, string | number | boolean> = { operation }

    if (operation === 'resize') {
      const width = positiveInteger(parameters.width, 'width')
      const height = positiveInteger(parameters.height, 'height')
      const fit = optionalEnum(parameters.fit, 'fit', [
        'cover',
        'contain',
        'fill',
        'inside',
        'outside'
      ] as const)
      pipeline = pipeline.resize({ width, height, fit: fit ?? 'inside' })
      Object.assign(summary, { width, height, fit: fit ?? 'inside' })
    } else if (operation === 'crop') {
      const region = rectangle(parameters)
      pipeline = pipeline.extract(region)
      Object.assign(summary, region)
    } else if (operation === 'rotate') {
      const angle = finiteNumber(parameters.angle, 'angle')
      pipeline = pipeline.rotate(angle)
      summary.angle = angle
    } else if (operation === 'composite') {
      const overlays = arrayParameter(parameters.overlays, 'overlays').map(
        (value, index) => {
          const overlay = recordParameter(value, `overlays[${index}]`)
          const overlayContent = base64Parameter(
            overlay.contentBase64,
            `overlays[${index}].contentBase64`
          )
          return {
            input: overlayContent,
            left: nonNegativeInteger(overlay.left, `overlays[${index}].left`),
            top: nonNegativeInteger(overlay.top, `overlays[${index}].top`)
          }
        }
      )
      pipeline = pipeline.composite(overlays)
      summary.overlays = overlays.length
    } else if (operation === 'redact') {
      const regions = arrayParameter(parameters.regions, 'regions').map(
        (value, index) =>
          rectangle(recordParameter(value, `regions[${index}]`))
      )
      const color =
        typeof parameters.color === 'string' ? parameters.color : '#000000'
      pipeline = pipeline.composite(
        regions.map((region) => ({
          input: {
            create: {
              width: region.width,
              height: region.height,
              channels: 4 as const,
              background: color
            }
          },
          left: region.left,
          top: region.top
        }))
      )
      summary.regions = regions.length
    } else if (operation !== 'compress' && operation !== 'convert' && operation !== 'remove_exif') {
      throw new ImageAdapterError(
        'image_operation_unsupported',
        'Image operation is unsupported'
      )
    }

    const targetFormat =
      operation === 'convert' || operation === 'compress'
        ? optionalEnum(parameters.format, 'format', [
            'png',
            'jpeg',
            'webp'
          ] as const) ?? rasterOutputFormat(sourceFormat)
        : rasterOutputFormat(sourceFormat)
    const quality =
      operation === 'compress' || operation === 'convert'
        ? optionalQuality(parameters.quality)
        : undefined
    pipeline = encode(pipeline, targetFormat, quality)
    const candidate = await pipeline.toBuffer()
    const inspection = await this.inspect(candidate, targetFormat)
    return {
      content: candidate,
      inspection,
      summary: {
        ...summary,
        format: targetFormat,
        bytes: candidate.byteLength
      }
    }
  }
}

export function sanitizeSvg(content: Uint8Array): Buffer {
  const source = Buffer.from(content)
  const text = source.toString('utf8')
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw unsafeSvg()
  }
  if (XMLValidator.validate(text) !== true) {
    throw new ImageAdapterError('image_svg_invalid', 'SVG is not valid XML')
  }
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false
  }).parse(text) as unknown
  inspectSvgNode(parsed)
  return source
}

function inspectSvgNode(value: unknown): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach(inspectSvgNode)
    return
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase()
    const localName = normalized.split(':').at(-1) ?? normalized
    if (localName === 'script' || normalized.startsWith('@_on')) {
      throw unsafeSvg()
    }
    if (
      (localName === '@_href' ||
        localName === '@_src' ||
        localName === '@_style') &&
      typeof child === 'string' &&
      containsExternalReference(child)
    ) {
      throw unsafeSvg()
    }
    inspectSvgNode(child)
  }
}

function containsExternalReference(value: string): boolean {
  return /(?:https?:|file:|\/\/|url\s*\(\s*['"]?(?:https?:|file:|\/\/))/i.test(
    value
  )
}

function unsafeSvg(): ImageAdapterError {
  return new ImageAdapterError(
    'image_svg_unsafe',
    'SVG contains executable or external content'
  )
}

function looksLikeSvg(content: Buffer): boolean {
  return /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(content.toString('utf8'))
}

function normalizeFormat(format: keyof sharp.FormatEnum | undefined): ImageFormat {
  if (
    format === 'png' ||
    format === 'jpeg' ||
    format === 'webp' ||
    format === 'gif' ||
    format === 'svg'
  ) {
    return format
  }
  throw new ImageAdapterError(
    'image_format_unsupported',
    'Image format is unsupported'
  )
}

function rasterOutputFormat(format: ImageFormat): 'png' | 'jpeg' | 'webp' {
  if (format === 'jpeg' || format === 'webp') return format
  return 'png'
}

function encode(
  pipeline: sharp.Sharp,
  format: 'png' | 'jpeg' | 'webp',
  quality: number | undefined
): sharp.Sharp {
  if (format === 'jpeg') return pipeline.jpeg({ quality: quality ?? 80 })
  if (format === 'webp') return pipeline.webp({ quality: quality ?? 80 })
  return pipeline.png({
    ...(quality === undefined
      ? {}
      : { compressionLevel: Math.round((100 - quality) / 11.2) })
  })
}

function rectangle(value: Record<string, unknown>): {
  left: number
  top: number
  width: number
  height: number
} {
  return {
    left: nonNegativeInteger(value.left, 'left'),
    top: nonNegativeInteger(value.top, 'top'),
    width: positiveInteger(value.width, 'width'),
    height: positiveInteger(value.height, 'height')
  }
}

function recordParameter(
  value: unknown,
  name: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidParameter(name)
  }
  return value as Record<string, unknown>
}

function arrayParameter(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw invalidParameter(name)
  }
  return value
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw invalidParameter(name)
  }
  return value as number
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidParameter(name)
  }
  return value as number
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidParameter(name)
  }
  return value
}

function optionalQuality(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw invalidParameter('quality')
  }
  return value as number
}

function optionalEnum<const T extends readonly string[]>(
  value: unknown,
  name: string,
  values: T
): T[number] | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !values.includes(value)) {
    throw invalidParameter(name)
  }
  return value
}

function base64Parameter(value: unknown, name: string): Buffer {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidParameter(name)
  }
  const result = Buffer.from(value, 'base64')
  if (result.byteLength === 0) throw invalidParameter(name)
  return result
}

function invalidParameter(name: string): ImageAdapterError {
  return new ImageAdapterError(
    'image_parameter_invalid',
    `Image parameter ${name} is invalid`
  )
}
