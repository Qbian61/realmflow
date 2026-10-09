import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type {
  FixedLayoutAdapter,
  FixedLayoutInspection,
  FixedLayoutRenderedPage
} from './fixed-layout-adapter'
import { FixedLayoutError } from './fixed-layout-adapter'
import type {
  ImageOcrPort,
  ImageOcrResult
} from './local-image-session-service'

export type FixedLayoutStorage = {
  read(canonicalPath: string): Promise<Uint8Array>
  checksum(canonicalPath: string): Promise<string>
}

export type FixedLayoutInspectionResult = FixedLayoutInspection & {
  sourcePath: string
  sourceChecksum: string
}

export class FixedLayoutService {
  constructor(
    private readonly dependencies: {
      adapter: Pick<FixedLayoutAdapter, 'inspect' | 'renderPage'>
      storage: FixedLayoutStorage
      localOcr?: ImageOcrPort
    }
  ) {}

  async inspect(input: {
    sourceCanonicalPath: string
    sourceRelativePath: string
    signal: AbortSignal
  }): Promise<FixedLayoutInspectionResult> {
    assertNotAborted(input.signal)
    const source = Buffer.from(
      await this.dependencies.storage.read(input.sourceCanonicalPath)
    )
    const sourceChecksum = digest(source)
    await assertChecksum(
      this.dependencies.storage,
      input.sourceCanonicalPath,
      sourceChecksum
    )
    const inspection = await this.dependencies.adapter.inspect({
      content: source
    })
    assertNotAborted(input.signal)
    await assertChecksum(
      this.dependencies.storage,
      input.sourceCanonicalPath,
      sourceChecksum
    )
    return {
      sourcePath: input.sourceRelativePath,
      sourceChecksum,
      ...inspection
    }
  }

  async ocr(input: {
    sourceCanonicalPath: string
    sourceRelativePath: string
    pageNumber: number
    language?: string
    maxDimension?: number
    signal: AbortSignal
  }): Promise<{
    sourceOfd: string
    sourcePage: number
    provider: 'local'
    language: string
    blocks: ImageOcrResult['blocks']
  }> {
    assertNotAborted(input.signal)
    const source = Buffer.from(
      await this.dependencies.storage.read(input.sourceCanonicalPath)
    )
    const sourceChecksum = digest(source)
    await assertChecksum(
      this.dependencies.storage,
      input.sourceCanonicalPath,
      sourceChecksum
    )
    const inspection = await this.dependencies.adapter.inspect({
      content: source
    })
    const page = inspection.pages[input.pageNumber - 1]
    if (!page || page.pageNumber !== input.pageNumber) {
      throw new FixedLayoutError(
        'fixed_layout_page_invalid',
        'OFD page number is invalid'
      )
    }
    if (!page.ocrRequired) {
      throw new FixedLayoutError(
        'fixed_layout_ocr_not_required',
        'OFD page already contains native text'
      )
    }
    if (!this.dependencies.localOcr) {
      throw new FixedLayoutError(
        'fixed_layout_ocr_unavailable',
        'Local OFD OCR is unavailable'
      )
    }
    const rendered = await this.dependencies.adapter.renderPage({
      content: source,
      pageNumber: input.pageNumber,
      maxDimension: input.maxDimension
    })
    const recognized = await this.dependencies.localOcr.recognize(
      {
        content: rendered.content,
        sourcePath: `${input.sourceRelativePath}#page=${input.pageNumber}`,
        language: input.language
      },
      input.signal
    )
    validateOcr(recognized, rendered)
    assertNotAborted(input.signal)
    await assertChecksum(
      this.dependencies.storage,
      input.sourceCanonicalPath,
      sourceChecksum
    )
    return {
      sourceOfd: input.sourceRelativePath,
      sourcePage: input.pageNumber,
      provider: 'local',
      language: recognized.language,
      blocks: recognized.blocks.map((block) => ({
        ...block,
        bounds: { ...block.bounds }
      }))
    }
  }
}

export class NodeFixedLayoutStorage implements FixedLayoutStorage {
  read(canonicalPath: string): Promise<Buffer> {
    return readFile(canonicalPath)
  }

  async checksum(canonicalPath: string): Promise<string> {
    return digest(await readFile(canonicalPath))
  }
}

async function assertChecksum(
  storage: FixedLayoutStorage,
  path: string,
  expected: string
): Promise<void> {
  if ((await storage.checksum(path)) !== expected) {
    throw new FixedLayoutError('file_conflict', 'OFD source changed')
  }
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Fixed-layout inspection was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function validateOcr(
  result: ImageOcrResult,
  page: FixedLayoutRenderedPage
): void {
  for (const block of result.blocks) {
    const { bounds } = block
    if (
      !block.text.trim() ||
      !Number.isFinite(block.confidence) ||
      block.confidence < 0 ||
      block.confidence > 1 ||
      !coordinate(bounds.x, true) ||
      !coordinate(bounds.y, true) ||
      !coordinate(bounds.width, false) ||
      !coordinate(bounds.height, false) ||
      bounds.x + bounds.width > page.width ||
      bounds.y + bounds.height > page.height
    ) {
      throw new FixedLayoutError(
        'fixed_layout_ocr_invalid',
        'OFD OCR returned invalid coordinates'
      )
    }
  }
}

function coordinate(value: number, allowZero: boolean): boolean {
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)
}
