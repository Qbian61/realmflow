import { posix } from 'node:path'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import JSZip, { type JSZipObject } from 'jszip'
import sharp from 'sharp'

export type FixedLayoutLimits = {
  maxSourceBytes: number
  maxEntries: number
  maxXmlBytes: number
  maxPages: number
  maxCharacters: number
}

export type FixedLayoutPage = {
  pageNumber: number
  sourcePath: string
  widthMm?: number
  heightMm?: number
  text: string
  characterCount: number
  ocrRequired: boolean
}

export type FixedLayoutInspection = {
  format: 'ofd'
  metadata: {
    title?: string
    author?: string
    creator?: string
    creationDate?: string
  }
  pages: FixedLayoutPage[]
  pageCount: number
  characterCount: number
  ocrRequired: boolean
}

export type FixedLayoutRenderedPage = {
  sourcePage: number
  mimeType: 'image/png'
  width: number
  height: number
  content: Buffer
}

export class FixedLayoutError extends Error {
  readonly name = 'FixedLayoutError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export const DEFAULT_FIXED_LAYOUT_LIMITS: FixedLayoutLimits = {
  maxSourceBytes: 20 * 1024 * 1024,
  maxEntries: 10_000,
  maxXmlBytes: 8 * 1024 * 1024,
  maxPages: 2_000,
  maxCharacters: 200_000
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false
})

export class FixedLayoutAdapter {
  async inspect(input: {
    content: Uint8Array
    limits?: Partial<FixedLayoutLimits>
  }): Promise<FixedLayoutInspection> {
    const limits = {
      ...DEFAULT_FIXED_LAYOUT_LIMITS,
      ...input.limits
    }
    if (input.content.byteLength > limits.maxSourceBytes) throw tooLarge()

    try {
      const archive = await JSZip.loadAsync(input.content, {
        checkCRC32: true,
        createFolders: false
      })
      const entries = Object.values(archive.files)
      if (entries.length > limits.maxEntries) throw tooLarge()
      for (const entry of entries) validateEntry(entry)

      const root = await readXml(archive, 'OFD.xml', limits)
      const body = firstRecord(asRecord(root.OFD)?.DocBody)
      if (!body) throw invalid()
      const docRoot = scalar(body.DocRoot)
      if (!docRoot) throw invalid()
      const documentPath = safePackagePath(docRoot)
      const documentXml = await readXml(archive, documentPath, limits)
      const document = asRecord(documentXml.Document)
      if (!document) throw invalid()

      const pagesContainer = asRecord(document.Pages)
      const pageReferences = toArray(pagesContainer?.Page)
      if (pageReferences.length === 0) throw invalid()
      if (pageReferences.length > limits.maxPages) throw tooLarge()
      const inheritedBox = physicalBox(
        asRecord(asRecord(document.CommonData)?.PageArea)?.PhysicalBox
      )
      const documentDirectory = posix.dirname(documentPath)
      const pages: FixedLayoutPage[] = []
      let characterCount = 0

      for (const [index, referenceValue] of pageReferences.entries()) {
        const reference = asRecord(referenceValue)
        const baseLocation = scalar(reference?.['@_BaseLoc'])
        if (!baseLocation) throw invalid()
        const sourcePath = safePackagePath(
          posix.join(documentDirectory, baseLocation)
        )
        const pageXml = await readXml(archive, sourcePath, limits)
        const page = asRecord(pageXml.Page)
        if (!page) throw invalid()
        const text = collectText(page).join('\n')
        characterCount += text.length
        if (characterCount > limits.maxCharacters) throw tooLarge()
        const pageBox =
          physicalBox(asRecord(page.PageArea)?.PhysicalBox) ?? inheritedBox
        pages.push({
          pageNumber: index + 1,
          sourcePath,
          ...(pageBox
            ? { widthMm: pageBox.widthMm, heightMm: pageBox.heightMm }
            : {}),
          text,
          characterCount: text.length,
          ocrRequired: text.length === 0
        })
      }

      const docInfo = firstRecord(body.DocInfo)
      return {
        format: 'ofd',
        metadata: {
          ...optionalScalar('title', docInfo?.Title),
          ...optionalScalar('author', docInfo?.Author),
          ...optionalScalar('creator', docInfo?.Creator),
          ...optionalScalar('creationDate', docInfo?.CreationDate)
        },
        pages,
        pageCount: pages.length,
        characterCount,
        ocrRequired: pages.some(({ ocrRequired }) => ocrRequired)
      }
    } catch (error) {
      if (error instanceof FixedLayoutError) throw error
      throw invalid()
    }
  }

  async renderPage(input: {
    content: Uint8Array
    pageNumber: number
    maxDimension?: number
    limits?: Partial<FixedLayoutLimits>
  }): Promise<FixedLayoutRenderedPage> {
    const limits = {
      ...DEFAULT_FIXED_LAYOUT_LIMITS,
      ...input.limits
    }
    if (input.content.byteLength > limits.maxSourceBytes) throw tooLarge()
    if (!Number.isSafeInteger(input.pageNumber) || input.pageNumber < 1) {
      throw invalidPage()
    }
    try {
      const archive = await JSZip.loadAsync(input.content, {
        checkCRC32: true,
        createFolders: false
      })
      const entries = Object.values(archive.files)
      if (entries.length > limits.maxEntries) throw tooLarge()
      for (const entry of entries) validateEntry(entry)

      const root = await readXml(archive, 'OFD.xml', limits)
      const body = firstRecord(asRecord(root.OFD)?.DocBody)
      const documentPath = safePackagePath(scalar(body?.DocRoot) ?? '')
      const documentXml = await readXml(archive, documentPath, limits)
      const document = asRecord(documentXml.Document)
      const commonData = asRecord(document?.CommonData)
      const pages = toArray(asRecord(document?.Pages)?.Page)
      const reference = asRecord(pages[input.pageNumber - 1])
      if (!document || !commonData || !reference) throw invalidPage()
      const pageSource = safePackagePath(
        posix.join(
          posix.dirname(documentPath),
          scalar(reference['@_BaseLoc']) ?? ''
        )
      )
      const pageXml = await readXml(archive, pageSource, limits)
      const page = asRecord(pageXml.Page)
      if (!page) throw invalid()
      const pageBox =
        box(asRecord(page.PageArea)?.PhysicalBox) ??
        box(asRecord(commonData.PageArea)?.PhysicalBox)
      if (!pageBox) throw renderUnsupported()
      const resources = await readImageResources(
        archive,
        documentPath,
        commonData,
        limits
      )
      const imageObjects = collectRecords(page, 'ImageObject')
      if (imageObjects.length === 0) throw renderUnsupported()

      const maxDimension = normalizeRenderDimension(input.maxDimension)
      const scale = Math.min(
        maxDimension / pageBox.width,
        maxDimension / pageBox.height
      )
      const width = Math.max(1, Math.round(pageBox.width * scale))
      const height = Math.max(1, Math.round(pageBox.height * scale))
      const composites: sharp.OverlayOptions[] = []
      for (const imageObject of imageObjects) {
        const resourceId = scalar(imageObject['@_ResourceID'])
        const boundary = box(imageObject['@_Boundary'])
        const resource = resourceId ? resources.get(resourceId) : undefined
        if (!resource || !boundary) throw renderUnsupported()
        const entry = archive.file(resource.path)
        if (!entry || entry.dir || !isSupportedRaster(resource)) {
          throw renderUnsupported()
        }
        const image = await entry.async('nodebuffer')
        const targetWidth = Math.max(1, Math.round(boundary.width * scale))
        const targetHeight = Math.max(1, Math.round(boundary.height * scale))
        composites.push({
          input: await sharp(image)
            .resize(targetWidth, targetHeight, { fit: 'fill' })
            .png()
            .toBuffer(),
          left: Math.max(0, Math.round((boundary.x - pageBox.x) * scale)),
          top: Math.max(0, Math.round((boundary.y - pageBox.y) * scale))
        })
      }
      return {
        sourcePage: input.pageNumber,
        mimeType: 'image/png',
        width,
        height,
        content: await sharp({
          create: {
            width,
            height,
            channels: 3,
            background: '#ffffff'
          }
        })
          .composite(composites)
          .withMetadata({ density: 144 })
          .png()
          .toBuffer()
      }
    } catch (error) {
      if (error instanceof FixedLayoutError) throw error
      throw renderUnsupported()
    }
  }
}

type ImageResource = {
  path: string
  format?: string
}

async function readImageResources(
  archive: JSZip,
  documentPath: string,
  commonData: Record<string, unknown>,
  limits: FixedLayoutLimits
): Promise<Map<string, ImageResource>> {
  const resources = new Map<string, ImageResource>()
  for (const key of ['PublicRes', 'DocumentRes']) {
    for (const reference of toArray(commonData[key])) {
      const location = resourceLocation(reference)
      if (!location) continue
      const resourcePath = safePackagePath(
        posix.join(posix.dirname(documentPath), location)
      )
      const resourceXml = await readXml(archive, resourcePath, limits)
      const root = asRecord(resourceXml.Res)
      if (!root) throw invalid()
      const baseLocation = scalar(root['@_BaseLoc']) ?? ''
      const media = toArray(asRecord(root.MultiMedias)?.MultiMedia)
      for (const item of media) {
        const record = asRecord(item)
        const id = scalar(record?.['@_ID'])
        const mediaFile = scalar(record?.MediaFile)
        if (!id || !mediaFile) continue
        resources.set(id, {
          path: safePackagePath(
            posix.join(
              posix.dirname(resourcePath),
              baseLocation,
              mediaFile
            )
          ),
          ...optionalScalar('format', record?.['@_Format'])
        })
      }
    }
  }
  return resources
}

function resourceLocation(value: unknown): string | undefined {
  return scalar(value) ?? scalar(asRecord(value)?.['@_BaseLoc'])
}

function collectRecords(
  value: unknown,
  key: string,
  output: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, key, output)
    return output
  }
  const record = asRecord(value)
  if (!record) return output
  for (const [childKey, child] of Object.entries(record)) {
    if (childKey === key) {
      for (const candidate of toArray(child)) {
        const normalized = asRecord(candidate)
        if (normalized) output.push(normalized)
      }
    } else {
      collectRecords(child, key, output)
    }
  }
  return output
}

function isSupportedRaster(resource: ImageResource): boolean {
  const format = resource.format?.toLowerCase()
  const extension = posix.extname(resource.path).toLowerCase()
  return (
    format === 'png' ||
    format === 'jpg' ||
    format === 'jpeg' ||
    extension === '.png' ||
    extension === '.jpg' ||
    extension === '.jpeg'
  )
}

function normalizeRenderDimension(value: number | undefined): number {
  const dimension = value ?? 2_000
  if (!Number.isSafeInteger(dimension) || dimension < 64 || dimension > 2_400) {
    throw new FixedLayoutError(
      'fixed_layout_render_limit_invalid',
      'OFD render dimension is invalid'
    )
  }
  return dimension
}

async function readXml(
  archive: JSZip,
  path: string,
  limits: FixedLayoutLimits
): Promise<Record<string, unknown>> {
  const entry = archive.file(path)
  if (!entry || entry.dir) throw invalid()
  const metadata = entry as JSZipObject & {
    _data?: { uncompressedSize?: number }
  }
  if ((metadata._data?.uncompressedSize ?? 0) > limits.maxXmlBytes) {
    throw tooLarge()
  }
  const xml = await entry.async('string')
  if (Buffer.byteLength(xml) > limits.maxXmlBytes) throw tooLarge()
  if (XMLValidator.validate(xml) !== true) throw invalid()
  const value = parser.parse(xml) as unknown
  const record = asRecord(value)
  if (!record) throw invalid()
  return record
}

function validateEntry(entry: JSZipObject): void {
  const candidate =
    (entry as JSZipObject & { unsafeOriginalName?: string })
      .unsafeOriginalName ?? entry.name
  safePackagePath(candidate)
  const mode = entry.unixPermissions
  if (typeof mode !== 'number') return
  const fileType = mode & 0o170000
  if (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
    throw invalid()
  }
}

function safePackagePath(value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(value)
  ) {
    throw unsafePath()
  }
  const normalized = posix.normalize(value.replaceAll('\\', '/'))
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw unsafePath()
  }
  return normalized.replace(/\/+$/, '')
}

function collectText(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output)
    return output
  }
  const record = asRecord(value)
  if (!record) return output
  for (const [key, child] of Object.entries(record)) {
    if (key === 'TextCode') {
      for (const candidate of toArray(child)) {
        const text = scalar(candidate)
        if (text) output.push(text)
      }
    } else {
      collectText(child, output)
    }
  }
  return output
}

function physicalBox(
  value: unknown
): { widthMm: number; heightMm: number } | undefined {
  const parsed = box(value)
  return parsed
    ? { widthMm: parsed.width, heightMm: parsed.height }
    : undefined
}

function box(
  value: unknown
): { x: number; y: number; width: number; height: number } | undefined {
  const text = scalar(value)
  if (!text) return undefined
  const numbers = text
    .trim()
    .split(/\s+/u)
    .map(Number)
  if (
    numbers.length !== 4 ||
    numbers.some((number) => !Number.isFinite(number))
  ) {
    throw invalid()
  }
  if (numbers[2]! <= 0 || numbers[3]! <= 0) throw invalid()
  return {
    x: numbers[0]!,
    y: numbers[1]!,
    width: numbers[2]!,
    height: numbers[3]!
  }
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return asRecord(toArray(value)[0])
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function scalar(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim()
    return normalized || undefined
  }
  const record = asRecord(value)
  return record ? scalar(record['#text']) : undefined
}

function optionalScalar(
  key: string,
  value: unknown
): Record<string, string> {
  const normalized = scalar(value)
  return normalized ? { [key]: normalized } : {}
}

function invalid(): FixedLayoutError {
  return new FixedLayoutError(
    'fixed_layout_invalid',
    'OFD structure is invalid'
  )
}

function unsafePath(): FixedLayoutError {
  return new FixedLayoutError(
    'fixed_layout_unsafe_path',
    'OFD package path is unsafe'
  )
}

function tooLarge(): FixedLayoutError {
  return new FixedLayoutError(
    'fixed_layout_too_large',
    'OFD exceeds a fixed-layout safety limit'
  )
}

function invalidPage(): FixedLayoutError {
  return new FixedLayoutError(
    'fixed_layout_page_invalid',
    'OFD page number is invalid'
  )
}

function renderUnsupported(): FixedLayoutError {
  return new FixedLayoutError(
    'fixed_layout_ocr_render_unsupported',
    'OFD page cannot be rendered for local OCR'
  )
}
