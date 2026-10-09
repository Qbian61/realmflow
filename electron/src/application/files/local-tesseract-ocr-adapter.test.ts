// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import {
  LocalTesseractOcrAdapter,
  type TesseractWorkerPort
} from './local-tesseract-ocr-adapter'

describe('LocalTesseractOcrAdapter', () => {
  it('maps local OCR words to stable image coordinates', async () => {
    const worker = fakeWorker({
      text: 'Realm Flow',
      confidence: 92,
      words: [
        {
          text: 'Realm',
          confidence: 94,
          bbox: { x0: 4, y0: 6, x1: 34, y1: 18 }
        },
        {
          text: 'Flow',
          confidence: 90,
          bbox: { x0: 38, y0: 6, x1: 62, y1: 18 }
        }
      ]
    })
    const adapter = new LocalTesseractOcrAdapter({
      createWorker: vi.fn().mockResolvedValue(worker)
    })

    await expect(
      adapter.recognize(
        {
          content: Buffer.from('image'),
          sourcePath: 'photo.png',
          language: 'eng'
        },
        new AbortController().signal
      )
    ).resolves.toEqual({
      language: 'eng',
      blocks: [
        {
          text: 'Realm',
          confidence: 0.94,
          bounds: { x: 4, y: 6, width: 30, height: 12 }
        },
        {
          text: 'Flow',
          confidence: 0.9,
          bounds: { x: 38, y: 6, width: 24, height: 12 }
        }
      ]
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('terminates local OCR work when the request is aborted', async () => {
    const worker = fakeWorker({ text: '', confidence: 0, words: [] })
    let resolveRecognition:
      | ((
          value: Awaited<ReturnType<TesseractWorkerPort['recognize']>>
        ) => void)
      | undefined
    worker.recognize = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<TesseractWorkerPort['recognize']>>>((resolve) => {
          resolveRecognition = resolve
        })
    )
    const controller = new AbortController()
    const adapter = new LocalTesseractOcrAdapter({
      createWorker: vi.fn().mockResolvedValue(worker)
    })

    const pending = adapter.recognize(
      { content: Buffer.from('image'), sourcePath: 'photo.png' },
      controller.signal
    )
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    resolveRecognition?.({
      data: { text: '', confidence: 0, words: [] }
    })
  })

  it(
    'recognizes text using only the bundled local language data',
    async () => {
      const image = await sharp(
        Buffer.from(
          '<svg width="600" height="140" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="140" fill="white"/><text x="24" y="98" font-family="Arial" font-size="72" fill="black">REALMFLOW</text></svg>'
        )
      )
        .png()
        .toBuffer()

      const result = await new LocalTesseractOcrAdapter().recognize(
        { content: image, sourcePath: 'realmflow.png', language: 'eng' },
        new AbortController().signal
      )

      expect(result.blocks.map(({ text }) => text).join(' ')).toContain(
        'REALMFLOW'
      )
    },
    30_000
  )
})

function fakeWorker(data: {
  text: string
  confidence: number
  words: Array<{
    text: string
    confidence: number
    bbox: { x0: number; y0: number; x1: number; y1: number }
  }>
}): TesseractWorkerPort {
  return {
    recognize: vi.fn().mockResolvedValue({ data }),
    terminate: vi.fn().mockResolvedValue(undefined)
  }
}
