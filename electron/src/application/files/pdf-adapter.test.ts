import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { PdfLibAdapter } from './pdf-adapter'

describe('PdfLibAdapter', () => {
  it('inspects page text and renders a bounded PNG thumbnail', async () => {
    const adapter = new PdfLibAdapter()
    const source = await textPdf(['First page', 'Second page'])

    const inspection = await adapter.inspect(source)
    expect(inspection).toMatchObject({
      pageCount: 2,
      encrypted: false,
      signed: false,
      pages: [
        { pageNumber: 1, text: 'First page', ocrRequired: false },
        { pageNumber: 2, text: 'Second page', ocrRequired: false }
      ]
    })
    const thumbnail = await adapter.renderPage(source, 2, 160)
    expect(thumbnail).toMatchObject({
      mimeType: 'image/png',
      sourcePage: 2
    })
    expect(Math.max(thumbnail.width, thumbnail.height)).toBeLessThanOrEqual(160)
    expect(thumbnail.content.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  })

  it('marks image-only pages as requiring OCR', async () => {
    const adapter = new PdfLibAdapter()
    const source = await blankPdf()

    await expect(adapter.inspect(source)).resolves.toMatchObject({
      pages: [{ pageNumber: 1, text: '', ocrRequired: true }]
    })
  })

  it('merges, selects, and rotates pages with deterministic order', async () => {
    const adapter = new PdfLibAdapter()
    const first = await textPdf(['A', 'B'])
    const second = await textPdf(['C'])

    const merged = await adapter.mutate(first, 'merge', {
      sources: [second]
    })
    expect((await adapter.inspect(merged.content)).pages.map(({ text }) => text))
      .toEqual(['A', 'B', 'C'])

    const selected = await adapter.mutate(merged.content, 'split', {
      pageNumbers: [3, 1]
    })
    const rotated = await adapter.mutate(selected.content, 'rotate', {
      pageNumbers: [1],
      angle: 90
    })
    expect(await adapter.inspect(rotated.content)).toMatchObject({
      pageCount: 2,
      pages: [
        { pageNumber: 1, text: 'C', rotation: 90 },
        { pageNumber: 2, text: 'A', rotation: 0 }
      ]
    })
  })

  it('fills AcroForm fields and preserves watermarks and annotations', async () => {
    const adapter = new PdfLibAdapter()
    const source = await formPdf()
    const filled = await adapter.mutate(source, 'form_fill', {
      fields: { Customer: 'RealmFlow', Approved: true }
    })
    const watermarked = await adapter.mutate(filled.content, 'watermark', {
      pageNumbers: [1],
      text: 'LOCAL',
      fontSize: 18,
      opacity: 0.4,
      angle: 30
    })
    const annotated = await adapter.mutate(
      watermarked.content,
      'annotation_add',
      {
        pageNumber: 1,
        text: 'Reviewed locally',
        x: 24,
        y: 32
      }
    )

    const document = await PDFDocument.load(Uint8Array.from(annotated.content))
    expect(document.getForm().getTextField('Customer').getText()).toBe(
      'RealmFlow'
    )
    expect(document.getForm().getCheckBox('Approved').isChecked()).toBe(true)
    const inspection = await adapter.inspect(annotated.content)
    expect(inspection.pages[0]?.text).toContain('LOCAL')
    expect(inspection.annotations).toContainEqual(
      expect.objectContaining({
        pageNumber: 1,
        contents: 'Reviewed locally'
      })
    )
  })

  it('keeps encrypted and signed sources read-only', async () => {
    const adapter = new PdfLibAdapter()
    const source = await blankPdf()
    const encrypted = Buffer.concat([source, Buffer.from('\n/Encrypt')])
    const signed = Buffer.concat([
      source,
      Buffer.from('\n/FT /Sig\n/ByteRange [0 1 2 3]')
    ])

    await expect(adapter.inspect(encrypted)).resolves.toMatchObject({
      encrypted: true,
      pages: []
    })
    await expect(
      adapter.mutate(encrypted, 'rotate', {
        pageNumbers: [1],
        angle: 90
      })
    ).rejects.toMatchObject({ code: 'pdf_encrypted_read_only' })
    await expect(
      adapter.mutate(signed, 'rotate', {
        pageNumbers: [1],
        angle: 90
      })
    ).rejects.toMatchObject({ code: 'pdf_signed_read_only' })
  })
})

async function textPdf(texts: string[]): Promise<Buffer> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (const text of texts) {
    const page = document.addPage([300, 200])
    page.drawText(text, { x: 30, y: 150, size: 18, font })
  }
  return Buffer.from(await document.save())
}

async function blankPdf(): Promise<Buffer> {
  const document = await PDFDocument.create()
  document.addPage([200, 120])
  return Buffer.from(await document.save())
}

async function formPdf(): Promise<Buffer> {
  const document = await PDFDocument.create()
  const page = document.addPage([300, 200])
  const form = document.getForm()
  const customer = form.createTextField('Customer')
  customer.addToPage(page, { x: 20, y: 130, width: 160, height: 24 })
  const approved = form.createCheckBox('Approved')
  approved.addToPage(page, { x: 20, y: 90, width: 18, height: 18 })
  page.setRotation(degrees(0))
  return Buffer.from(await document.save())
}
