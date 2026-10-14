import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { CONTENT_EXTRACTION_LIMITS } from '../../../../../domain/content-extraction'
import { PresentationContentExtractor } from './presentation-content-extractor'

describe('PresentationContentExtractor', () => {
  it('creates one stable unit per slide with text, tables, charts, and notes', async () => {
    const port = {
      extractText: vi.fn().mockResolvedValue({
        slides: [
          {
            number: 1,
            title: 'Overview',
            text: ['Overview', 'Quarterly results'],
            tables: [['Region', 'Revenue'], ['APAC', '42']],
            chartLabels: ['Progress', 'Read', 'Write', 'Coverage'],
            notes: 'Presenter notes'
          },
          {
            number: 2,
            title: '',
            text: ['Next steps'],
            tables: [],
            chartLabels: [],
            notes: ''
          }
        ]
      })
    }

    const result = await new PresentationContentExtractor(port).extract(input())

    expect(result.units.map(({ key }) => key)).toEqual([
      'slide/000001',
      'slide/000002'
    ])
    expect(result.units[0]).toMatchObject({
      title: 'Overview',
      text: expect.stringContaining('Quarterly results'),
      metadata: { slide: 1, extraction: 'presentation' }
    })
    expect(result.units[0]?.text).toContain('Region\tRevenue')
    expect(result.units[0]?.text).toContain('Progress')
    expect(result.units[0]?.text).toContain('Presenter notes')
    expect(result.units[1]?.title).toBe('Slide 2')
  })

  it('enforces the slide limit', async () => {
    const slides = Array.from(
      { length: CONTENT_EXTRACTION_LIMITS.maxSlides + 1 },
      (_, index) => ({
        number: index + 1,
        title: `Slide ${index + 1}`,
        text: ['x'],
        tables: [],
        chartLabels: [],
        notes: ''
      })
    )

    await expect(
      new PresentationContentExtractor({
        extractText: vi.fn().mockResolvedValue({ slides })
      }).extract(input())
    ).rejects.toMatchObject({ code: 'extraction_limit_exceeded' })
  })
})

function input() {
  const bytes = Uint8Array.from(Buffer.from('PK\u0003\u0004'))
  return {
    bytes,
    fileName: 'briefing.pptx',
    sourceChecksum: digest(bytes),
    policy: {
      consumer: 'knowledge_index' as const,
      allowLocalOcr: false,
      allowLocalConversion: false,
      maxCharacters: 1_000_000,
      maxUnits: 10_000
    },
    signal: new AbortController().signal,
    depth: 0
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
