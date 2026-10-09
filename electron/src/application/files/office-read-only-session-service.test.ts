import { describe, expect, it, vi } from 'vitest'
import { OfficeReadOnlySessionService } from './office-read-only-session-service'

describe('OfficeReadOnlySessionService', () => {
  it.each([
    ['dotx', 'word', undefined],
    ['docm', 'word', undefined],
    ['xltx', 'spreadsheet', 'xlsx'],
    ['xlsm', 'spreadsheet', 'xlsx'],
    ['potx', 'presentation', undefined],
    ['pptm', 'presentation', undefined]
  ] as const)(
    'opens %s through the %s parser in read-only mode',
    async (sourceFormat, family, normalizedFormat) => {
      const sessions = sessionPorts()
      const service = new OfficeReadOnlySessionService(sessions)

      const result = await service.open({
        canonicalPath: `/workspace/source.${sourceFormat}`,
        relativePath: `source.${sourceFormat}`,
        sourceFormat,
        signal: new AbortController().signal
      })

      expect(sessions[family].open).toHaveBeenCalledWith({
        canonicalPath: `/workspace/source.${sourceFormat}`,
        relativePath: `source.${sourceFormat}`,
        mode: 'read',
        ...(normalizedFormat ? { format: normalizedFormat } : {}),
        signal: expect.any(AbortSignal)
      })
      expect(result).toMatchObject({
        sessionId: `${family}-session`,
        path: `source.${sourceFormat}`,
        format: sourceFormat,
        mode: 'read',
        sourceChecksum: 'a'.repeat(64)
      })
    }
  )

  it('rejects unsupported original formats', async () => {
    await expect(
      new OfficeReadOnlySessionService(sessionPorts()).open({
        canonicalPath: '/workspace/source.docx',
        relativePath: 'source.docx',
        sourceFormat: 'docx' as 'dotx',
        signal: new AbortController().signal
      })
    ).rejects.toMatchObject({ code: 'office_original_format_unsupported' })
  })
})

function sessionPorts() {
  return {
    word: {
      open: vi.fn().mockResolvedValue({
        sessionId: 'word-session',
        path: 'source.docx',
        format: 'docx',
        mode: 'read',
        revision: 0,
        status: 'ready',
        sourceChecksum: 'a'.repeat(64),
        preservationRisk: [],
        inspection: { blocks: [] }
      })
    },
    spreadsheet: {
      open: vi.fn().mockResolvedValue({
        sessionId: 'spreadsheet-session',
        path: 'source.xlsx',
        format: 'xlsx',
        mode: 'read',
        revision: 0,
        status: 'ready',
        sourceChecksum: 'a'.repeat(64),
        inspection: { sheets: [] }
      })
    },
    presentation: {
      open: vi.fn().mockResolvedValue({
        sessionId: 'presentation-session',
        path: 'source.pptx',
        format: 'pptx',
        mode: 'read',
        revision: 0,
        status: 'ready',
        sourceChecksum: 'a'.repeat(64),
        preservationRisk: [],
        inspection: { slides: [] }
      })
    }
  }
}
