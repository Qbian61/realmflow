import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { CONTENT_EXTRACTION_LIMITS } from '../../../../../domain/content-extraction'
import { SpreadsheetContentExtractor } from './spreadsheet-content-extractor'

describe('SpreadsheetContentExtractor', () => {
  it.each([
    ['csv', 'orders.csv'],
    ['tsv', 'orders.tsv']
  ])('maps %s rows to one stable sheet unit', async (format, fileName) => {
    const port = extractionPort([
      {
        name: 'Sheet1',
        rows: [
          ['Name', 'Amount'],
          ['A\nB', '12']
        ],
        nonEmptyCellCount: 4
      }
    ])

    await expect(
      new SpreadsheetContentExtractor(port).extract(input(fileName))
    ).resolves.toMatchObject({
      format,
      units: [
        {
          key: 'sheet/sheet1',
          title: 'Sheet1',
          text: 'Name\tAmount\nA\\nB\t12',
          metadata: { format, extraction: 'spreadsheet', sheet: 'Sheet1' }
        }
      ]
    })
  })

  it('preserves sheet order, visible values, and formulas from XLSX', async () => {
    const port = extractionPort([
      {
        name: 'Summary',
        rows: [
          ['Metric', 'Value', 'Formula'],
          ['Count', '12', '=B2*2']
        ],
        nonEmptyCellCount: 6
      },
      {
        name: 'Raw Data',
        rows: [['Region', 'Revenue']],
        nonEmptyCellCount: 2
      }
    ])

    const result = await new SpreadsheetContentExtractor(port).extract(
      input('report.xlsx')
    )

    expect(result.units.map(({ key }) => key)).toEqual([
      'sheet/summary',
      'sheet/raw-data'
    ])
    expect(result.units[0]?.text).toContain('=B2*2')
    expect(port.extractText).toHaveBeenCalledWith({
      bytes: expect.any(Uint8Array),
      format: 'xlsx',
      signal: expect.any(AbortSignal)
    })
  })

  it('rejects sheet and non-empty cell limits', async () => {
    const sheets = Array.from(
      { length: CONTENT_EXTRACTION_LIMITS.maxSheets + 1 },
      (_, index) => ({
        name: `Sheet${index + 1}`,
        rows: [['x']],
        nonEmptyCellCount: 1
      })
    )
    await expect(
      new SpreadsheetContentExtractor(extractionPort(sheets)).extract(
        input('large.xlsx')
      )
    ).rejects.toMatchObject({ code: 'extraction_limit_exceeded' })

    await expect(
      new SpreadsheetContentExtractor(
        extractionPort([
          {
            name: 'Large',
            rows: [['x']],
            nonEmptyCellCount:
              CONTENT_EXTRACTION_LIMITS.maxNonEmptyCells + 1
          }
        ])
      ).extract(input('large.xlsx'))
    ).rejects.toMatchObject({ code: 'extraction_limit_exceeded' })
  })
})

function input(fileName: string) {
  const bytes = Uint8Array.from(
    Buffer.from(fileName.endsWith('xlsx') ? 'PK\u0003\u0004' : 'a,b\n1,2')
  )
  return {
    bytes,
    fileName,
    sourceChecksum: digest(bytes),
    policy: {
      consumer: 'knowledge_index' as const,
      allowLocalOcr: false,
      allowLocalConversion: false,
      maxCharacters: 1_000_000,
      maxUnits: 200
    },
    signal: new AbortController().signal,
    depth: 0
  }
}

function extractionPort(
  sheets: Array<{
    name: string
    rows: string[][]
    nonEmptyCellCount: number
  }>
) {
  return {
    extractText: vi.fn().mockResolvedValue({ sheets })
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
