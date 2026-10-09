import { createRequire } from 'node:module'
import { join } from 'node:path'
import type {
  ImageOcrPort,
  ImageOcrResult
} from './local-image-session-service'

type RawWord = {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

type RawRecognition = {
  data: {
    text: string
    confidence: number
    words: RawWord[]
  }
}

export type TesseractWorkerPort = {
  recognize(content: Buffer): Promise<RawRecognition>
  terminate(): Promise<unknown>
}

export class LocalTesseractOcrAdapter implements ImageOcrPort {
  constructor(
    private readonly dependencies: {
      createWorker?: (language: string) => Promise<TesseractWorkerPort>
      packageRoot?: string
    } = {}
  ) {}

  async recognize(
    input: {
      content: Buffer
      sourcePath: string
      language?: string
    },
    signal: AbortSignal
  ): Promise<ImageOcrResult> {
    assertNotAborted(signal)
    const language = normalizeLanguage(input.language)
    const worker = await (
      this.dependencies.createWorker ??
      ((selectedLanguage) =>
        createLocalWorker(
          selectedLanguage,
          this.dependencies.packageRoot ?? process.cwd()
        ))
    )(language)
    let terminated = false
    const terminate = async () => {
      if (terminated) return
      terminated = true
      await worker.terminate()
    }
    if (signal.aborted) {
      await terminate()
      throw abortError()
    }
    const abort = new Promise<never>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          void terminate()
          reject(abortError())
        },
        { once: true }
      )
    })
    try {
      const recognized = await Promise.race([
        worker.recognize(Buffer.from(input.content)),
        abort
      ])
      return {
        language,
        blocks: recognized.data.words
          .filter(({ text }) => text.trim().length > 0)
          .map(({ text, confidence, bbox }) => ({
            text,
            confidence: clampConfidence(confidence / 100),
            bounds: {
              x: bbox.x0,
              y: bbox.y0,
              width: bbox.x1 - bbox.x0,
              height: bbox.y1 - bbox.y0
            }
          }))
      }
    } finally {
      await terminate()
    }
  }
}

async function createLocalWorker(
  language: string,
  packageRoot: string
): Promise<TesseractWorkerPort> {
  const packageRequire = createRequire(join(packageRoot, 'package.json'))
  const tesseract = packageRequire(
    'tesseract.js'
  ) as typeof import('tesseract.js')
  const languagePackageName =
    language === 'chi_sim' ? 'chi_sim' : 'eng'
  const languagePackageRoot = join(
    packageRoot,
    'node_modules',
    '@tesseract.js-data',
    languagePackageName,
    '4.0.0'
  )
  const worker = await tesseract.createWorker(
    language,
    tesseract.OEM.LSTM_ONLY,
    {
      langPath: languagePackageRoot,
      gzip: true,
      cacheMethod: 'none',
      workerPath: join(
        packageRoot,
        'node_modules',
        'tesseract.js',
        'src',
        'worker-script',
        'node',
        'index.js'
      )
    }
  )
  return {
    recognize: async (content) => {
      const result = await worker.recognize(
        content,
        {},
        { text: true, blocks: true }
      )
      const words =
        result.data.blocks?.flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) => line.words)
          )
        ) ?? []
      return {
        data: {
          text: result.data.text,
          confidence: result.data.confidence,
          words
        }
      }
    },
    terminate: () => worker.terminate()
  }
}

function normalizeLanguage(language: string | undefined): 'eng' | 'chi_sim' {
  const normalized = language?.trim().toLowerCase() || 'eng'
  if (normalized === 'eng' || normalized === 'chi_sim') return normalized
  throw new Error('Local OCR language must be eng or chi_sim')
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError()
  }
}

function abortError(): Error {
  const error = new Error('Image OCR was cancelled')
  error.name = 'AbortError'
  return error
}
