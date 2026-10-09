import { createCanvas } from '@napi-rs/canvas'
import {
  PDFArray,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb
} from 'pdf-lib'

export type PdfOperation =
  | 'merge'
  | 'split'
  | 'rotate'
  | 'watermark'
  | 'form_fill'
  | 'annotation_add'

export type PdfTextItem = {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export type PdfInspection = {
  pageCount: number
  encrypted: boolean
  signed: boolean
  pages: Array<{
    pageNumber: number
    width: number
    height: number
    rotation: number
    text: string
    textItems: PdfTextItem[]
    ocrRequired: boolean
  }>
  forms: Array<{ name: string; type: string; value?: string | boolean }>
  annotations: Array<{
    pageNumber: number
    subtype: string
    contents?: string
  }>
}

export type PdfRenderedPage = {
  content: Buffer
  mimeType: 'image/png'
  sourcePage: number
  width: number
  height: number
}

export class PdfAdapterError extends Error {
  readonly name = 'PdfAdapterError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class PdfLibAdapter {
  async inspect(content: Uint8Array): Promise<PdfInspection> {
    const source = Buffer.from(content)
    assertPdf(source)
    const encrypted = containsToken(source, '/Encrypt')
    const signed = isSigned(source)
    if (encrypted) {
      return {
        pageCount: 0,
        encrypted: true,
        signed,
        pages: [],
        forms: [],
        annotations: []
      }
    }
    const forms = await inspectForms(Uint8Array.from(source))
    const pdfjs = await loadPdfJs(Buffer.from(source))
    try {
      const pages: PdfInspection['pages'] = []
      const annotations: PdfInspection['annotations'] = []
      for (let pageNumber = 1; pageNumber <= pdfjs.numPages; pageNumber += 1) {
        const page = await pdfjs.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 1 })
        const textContent = await page.getTextContent()
        const rawItems: readonly unknown[] = textContent.items
        const items = rawItems.filter(isTextItem).map((item) => ({
          text: item.str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          width: item.width,
          height: item.height
        }))
        const text = joinTextItems(rawItems)
        pages.push({
          pageNumber,
          width: viewport.width,
          height: viewport.height,
          rotation: normalizeRotation(viewport.rotation),
          text,
          textItems: items,
          ocrRequired: text.trim().length === 0
        })
        for (const annotation of await page.getAnnotations()) {
          annotations.push({
            pageNumber,
            subtype: String(annotation.subtype ?? 'Unknown'),
            ...(typeof annotation.contentsObj?.str === 'string'
              ? { contents: annotation.contentsObj.str }
              : typeof annotation.contents === 'string'
                ? { contents: annotation.contents }
                : {})
          })
        }
      }
      return {
        pageCount: pdfjs.numPages,
        encrypted,
        signed,
        pages,
        forms,
        annotations
      }
    } finally {
      await pdfjs.destroy()
    }
  }

  async renderPage(
    content: Uint8Array,
    pageNumber: number,
    maxDimension = 512
  ): Promise<PdfRenderedPage> {
    assertBoundedInteger(pageNumber, 1, 100_000, 'pageNumber')
    assertBoundedInteger(maxDimension, 64, 2048, 'maxDimension')
    const inspection = await this.inspect(content)
    if (inspection.encrypted) {
      throw new PdfAdapterError('pdf_encrypted', 'PDF is encrypted')
    }
    if (pageNumber > inspection.pageCount) {
      throw new PdfAdapterError('pdf_page_invalid', 'PDF page is unavailable')
    }
    const pdfjs = await loadPdfJs(Buffer.from(content))
    try {
      const page = await pdfjs.getPage(pageNumber)
      const original = page.getViewport({ scale: 1 })
      const scale = Math.min(1, maxDimension / Math.max(original.width, original.height))
      const viewport = page.getViewport({ scale })
      const canvas = createCanvas(
        Math.max(1, Math.ceil(viewport.width)),
        Math.max(1, Math.ceil(viewport.height))
      )
      await page.render({
        canvasContext: canvas.getContext('2d') as never,
        viewport
      }).promise
      return {
        content: canvas.toBuffer('image/png'),
        mimeType: 'image/png',
        sourcePage: pageNumber,
        width: canvas.width,
        height: canvas.height
      }
    } finally {
      await pdfjs.destroy()
    }
  }

  async mutate(
    content: Uint8Array,
    operation: PdfOperation,
    parameters: Record<string, unknown>
  ): Promise<{ content: Buffer; summary: Record<string, unknown> }> {
    const source = Buffer.from(content)
    assertWritable(source)
    const document = await PDFDocument.load(Uint8Array.from(source))
    let target = document

    if (operation === 'merge') {
      const sources = requireSources(parameters.sources)
      for (const addition of sources) {
        assertWritable(addition)
        const incoming = await PDFDocument.load(Uint8Array.from(addition))
        const pages = await document.copyPages(
          incoming,
          incoming.getPageIndices()
        )
        for (const page of pages) document.addPage(page)
      }
    } else if (operation === 'split') {
      const pageNumbers = requirePageNumbers(
        parameters.pageNumbers,
        document.getPageCount()
      )
      target = await PDFDocument.create()
      const pages = await target.copyPages(
        document,
        pageNumbers.map((value) => value - 1)
      )
      for (const page of pages) target.addPage(page)
    } else if (operation === 'rotate') {
      const pageNumbers = requirePageNumbers(
        parameters.pageNumbers,
        document.getPageCount()
      )
      const angle = requireQuarterTurn(parameters.angle)
      for (const pageNumber of pageNumbers) {
        const page = document.getPage(pageNumber - 1)
        page.setRotation(
          degrees(normalizeRotation(page.getRotation().angle + angle))
        )
      }
    } else if (operation === 'watermark') {
      const pageNumbers = requirePageNumbers(
        parameters.pageNumbers,
        document.getPageCount()
      )
      const text = requireText(parameters.text, 'text', 500)
      const fontSize = optionalNumber(parameters.fontSize, 6, 200) ?? 24
      const opacity = optionalNumber(parameters.opacity, 0.05, 1) ?? 0.25
      const angle = optionalNumber(parameters.angle, -180, 180) ?? 30
      const font = await document.embedFont(StandardFonts.Helvetica)
      for (const pageNumber of pageNumbers) {
        const page = document.getPage(pageNumber - 1)
        page.drawText(text, {
          x: Math.max(12, page.getWidth() * 0.25),
          y: page.getHeight() * 0.5,
          size: fontSize,
          font,
          color: rgb(0.45, 0.45, 0.45),
          opacity,
          rotate: degrees(angle)
        })
      }
    } else if (operation === 'form_fill') {
      fillForm(document, requireRecord(parameters.fields, 'fields'))
    } else {
      addTextAnnotation(document, parameters)
    }

    const result = Buffer.from(await target.save())
    assertPdf(result)
    return {
      content: result,
      summary: {
        operation,
        pageCount: target.getPageCount()
      }
    }
  }
}

async function loadPdfJs(source: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  try {
    return await getDocument({
      data: Uint8Array.from(source),
      useSystemFonts: true,
      verbosity: 0
    }).promise
  } catch (error) {
    throw new PdfAdapterError(
      isPasswordError(error) ? 'pdf_encrypted' : 'pdf_invalid',
      isPasswordError(error) ? 'PDF is encrypted' : 'PDF could not be parsed'
    )
  }
}

async function inspectForms(
  source: Uint8Array
): Promise<PdfInspection['forms']> {
  const document = await PDFDocument.load(Uint8Array.from(source))
  return document.getForm().getFields().map((field) => {
    if (field instanceof PDFTextField) {
      return { name: field.getName(), type: 'text', value: field.getText() }
    }
    if (field instanceof PDFCheckBox) {
      return {
        name: field.getName(),
        type: 'checkbox',
        value: field.isChecked()
      }
    }
    if (field instanceof PDFDropdown) {
      return {
        name: field.getName(),
        type: 'dropdown',
        value: field.getSelected().join(', ')
      }
    }
    if (field instanceof PDFOptionList) {
      return {
        name: field.getName(),
        type: 'option_list',
        value: field.getSelected().join(', ')
      }
    }
    if (field instanceof PDFRadioGroup) {
      return {
        name: field.getName(),
        type: 'radio',
        value: field.getSelected()
      }
    }
    return { name: field.getName(), type: field.constructor.name }
  })
}

function fillForm(
  document: PDFDocument,
  values: Record<string, unknown>
): void {
  const form = document.getForm()
  for (const [name, value] of Object.entries(values)) {
    let field
    try {
      field = form.getField(name)
    } catch {
      throw new PdfAdapterError(
        'pdf_form_field_not_found',
        `PDF form field is unavailable: ${name}`
      )
    }
    if (field instanceof PDFTextField && typeof value === 'string') {
      field.setText(value)
    } else if (field instanceof PDFCheckBox && typeof value === 'boolean') {
      value ? field.check() : field.uncheck()
    } else if (
      (field instanceof PDFDropdown ||
        field instanceof PDFOptionList ||
        field instanceof PDFRadioGroup) &&
      typeof value === 'string'
    ) {
      field.select(value)
    } else {
      throw new PdfAdapterError(
        'pdf_form_value_invalid',
        `PDF form value is invalid: ${name}`
      )
    }
  }
  form.updateFieldAppearances()
}

function addTextAnnotation(
  document: PDFDocument,
  parameters: Record<string, unknown>
): void {
  const pageNumber = boundedInteger(
    parameters.pageNumber,
    1,
    document.getPageCount(),
    'pageNumber'
  )
  const text = requireText(parameters.text, 'text', 2000)
  const x = boundedNumber(parameters.x, 0, 1_000_000, 'x')
  const y = boundedNumber(parameters.y, 0, 1_000_000, 'y')
  const page = document.getPage(pageNumber - 1)
  if (x > page.getWidth() || y > page.getHeight()) {
    throw new PdfAdapterError(
      'pdf_annotation_bounds_invalid',
      'PDF annotation is outside the page'
    )
  }
  const annotation = document.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Text'),
    Rect: [x, y, Math.min(x + 24, page.getWidth()), Math.min(y + 24, page.getHeight())],
    Contents: PDFHexString.fromText(text),
    Name: PDFName.of('Comment'),
    C: [1, 0.82, 0],
    Open: false
  })
  const reference = document.context.register(annotation)
  const key = PDFName.of('Annots')
  let annotations = page.node.lookupMaybe(key, PDFArray)
  if (!annotations) {
    annotations = document.context.obj([])
    page.node.set(key, annotations)
  }
  annotations.push(reference)
}

function assertWritable(source: Buffer): void {
  assertPdf(source)
  if (containsToken(source, '/Encrypt')) {
    throw new PdfAdapterError('pdf_encrypted_read_only', 'Encrypted PDF is read-only')
  }
  if (isSigned(source)) {
    throw new PdfAdapterError('pdf_signed_read_only', 'Signed PDF is read-only')
  }
}

function assertPdf(source: Buffer): void {
  if (source.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new PdfAdapterError('pdf_invalid', 'PDF signature is invalid')
  }
}

function containsToken(source: Buffer, token: string): boolean {
  return source.toString('latin1').includes(token)
}

function isSigned(source: Buffer): boolean {
  const text = source.toString('latin1')
  return text.includes('/ByteRange') && /\/(?:FT\s*\/Sig|Type\s*\/Sig)\b/.test(text)
}

function requireSources(value: unknown): Buffer[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new PdfAdapterError('pdf_sources_invalid', 'PDF sources are invalid')
  }
  return value.map((source) => {
    if (!Buffer.isBuffer(source) && !ArrayBuffer.isView(source)) {
      throw new PdfAdapterError('pdf_sources_invalid', 'PDF source is invalid')
    }
    return Buffer.from(
      source.buffer,
      source.byteOffset,
      source.byteLength
    )
  })
}

function requirePageNumbers(value: unknown, pageCount: number): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10_000) {
    throw new PdfAdapterError('pdf_pages_invalid', 'PDF pages are invalid')
  }
  return value.map((pageNumber) =>
    boundedInteger(pageNumber, 1, pageCount, 'pageNumber')
  )
}

function requireQuarterTurn(value: unknown): 90 | 180 | 270 {
  if (value === 90 || value === 180 || value === 270) return value
  throw new PdfAdapterError('pdf_rotation_invalid', 'PDF rotation is invalid')
}

function requireRecord(
  value: unknown,
  name: string
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length < 1
  ) {
    throw new PdfAdapterError('pdf_parameters_invalid', `PDF ${name} is invalid`)
  }
  return value as Record<string, unknown>
}

function requireText(value: unknown, name: string, maxLength: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength
  ) {
    throw new PdfAdapterError('pdf_parameters_invalid', `PDF ${name} is invalid`)
  }
  return value
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  name: string
): number {
  if (!Number.isSafeInteger(value)) {
    throw new PdfAdapterError('pdf_parameters_invalid', `PDF ${name} is invalid`)
  }
  return boundedNumber(value, minimum, maximum, name)
}

function assertBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  name: string
): void {
  boundedInteger(value, minimum, maximum, name)
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  name: string
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new PdfAdapterError('pdf_parameters_invalid', `PDF ${name} is invalid`)
  }
  return value
}

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number
): number | undefined {
  return value === undefined
    ? undefined
    : boundedNumber(value, minimum, maximum, 'number')
}

function normalizeRotation(value: number): number {
  return ((value % 360) + 360) % 360
}

type PdfJsTextItem = {
  str: string
  width: number
  height: number
  transform: readonly number[]
  hasEOL?: boolean
}

function isTextItem(value: unknown): value is PdfJsTextItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'str' in value &&
    typeof value.str === 'string' &&
    'transform' in value &&
    Array.isArray(value.transform)
  )
}

function joinTextItems(items: readonly unknown[]): string {
  return items
    .filter(isTextItem)
    .map(({ str }) => str)
    .filter(Boolean)
    .join(' ')
    .trim()
}

function isPasswordError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'PasswordException' ||
      error.message.toLowerCase().includes('password'))
  )
}
