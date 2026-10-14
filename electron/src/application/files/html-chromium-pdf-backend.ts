import { createHash } from 'node:crypto'
import {
  PdfGenerationError,
  type PdfGenerationSource
} from '../../../../domain/pdf-generation'
import type {
  PdfGenerationBackend,
  PdfGenerationBackendInput,
  PdfGenerationBackendResult
} from './pdf-generation-service'

export type ChromiumPdfPrintOptions = {
  printBackground: true
  pageSize: 'A4'
  margins: { top: 0; bottom: 0; left: 0; right: 0 }
  landscape: false
}

export type ChromiumPdfPrinter = {
  printToPdf(
    input: {
      html: string
      title?: string
      printOptions: ChromiumPdfPrintOptions
    },
    signal: AbortSignal
  ): Promise<Uint8Array>
  renderFirstPage?: (
    pdf: Uint8Array,
    pageNumber: 1,
    signal: AbortSignal
  ) => Promise<{
    content: Uint8Array
    width: number
    height: number
  }>
}

const DEFAULT_PRINT_OPTIONS: ChromiumPdfPrintOptions = {
  printBackground: true,
  pageSize: 'A4',
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
  landscape: false
}

export class HtmlChromiumPdfBackend implements PdfGenerationBackend {
  constructor(private readonly dependencies: ChromiumPdfPrinter) {}

  async generate(
    input: PdfGenerationBackendInput,
    signal: AbortSignal
  ): Promise<PdfGenerationBackendResult> {
    const source = input.request.source
    const html = renderPrintableHtml(source)
    assertNoExternalResources(html)
    const bytes = await this.dependencies.printToPdf(
      {
        html,
        ...(titleForSource(source) ? { title: titleForSource(source) } : {}),
        printOptions: DEFAULT_PRINT_OPTIONS
      },
      signal
    )
    const renderProof =
      input.request.verification?.requireRenderSmokeTest === true
        ? await this.renderProof(bytes, signal)
        : undefined
    return {
      bytes,
      backend: 'chromium_html_pdf',
      quality: 'visual_print',
      warnings: [],
      ...(renderProof ? { renderProof } : {})
    }
  }

  private async renderProof(
    bytes: Uint8Array,
    signal: AbortSignal
  ): Promise<{
    firstPagePngChecksum: string
    width: number
    height: number
  }> {
    if (!this.dependencies.renderFirstPage) {
      throw new PdfGenerationError(
        'pdf_render_smoke_test_failed',
        'PDF render smoke test is unavailable'
      )
    }
    const rendered = await this.dependencies.renderFirstPage(bytes, 1, signal)
    if (rendered.width < 1 || rendered.height < 1 || rendered.content.byteLength === 0) {
      throw new PdfGenerationError(
        'pdf_render_smoke_test_failed',
        'PDF render smoke test failed'
      )
    }
    return {
      firstPagePngChecksum: digest(rendered.content),
      width: rendered.width,
      height: rendered.height
    }
  }
}

function renderPrintableHtml(source: PdfGenerationSource): string {
  if (source.kind === 'html') {
    return wrapHtml(source.html, source.title)
  }
  if (source.kind === 'markdown') {
    return wrapHtml(renderMarkdown(source.markdown), source.title)
  }
  if (source.kind === 'document_blocks') {
    return wrapHtml(renderBlocks(source), source.title)
  }
  throw new PdfGenerationError(
    'pdf_source_invalid',
    'Chromium PDF backend requires HTML-compatible source'
  )
}

function titleForSource(source: PdfGenerationSource): string | undefined {
  if (
    source.kind === 'html' ||
    source.kind === 'markdown' ||
    source.kind === 'document_blocks'
  ) {
    return source.title
  }
  return undefined
}

function wrapHtml(body: string, title?: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title ?? 'RealmFlow PDF')}</title>`,
    '<style>',
    'html,body{margin:0;padding:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    'body{padding:32px;line-height:1.5;}',
    'table{width:100%;border-collapse:collapse;}',
    'td,th{border:1px solid #d4d4d8;padding:6px 8px;text-align:left;}',
    '@page{size:A4;margin:0;}',
    '</style>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>'
  ].join('')
}

function renderMarkdown(markdown: string): string {
  const blocks: string[] = []
  const lines = markdown.split(/\r?\n/)
  let list: string[] = []
  const flushList = () => {
    if (list.length === 0) return
    blocks.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
    list = []
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (heading) {
      flushList()
      blocks.push(
        `<h${heading[1]!.length}>${escapeHtml(heading[2]!)}</h${heading[1]!.length}>`
      )
      continue
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed)
    if (bullet) {
      list.push(bullet[1]!)
      continue
    }
    flushList()
    blocks.push(`<p>${escapeHtml(trimmed)}</p>`)
  }
  flushList()
  return blocks.join('')
}

function renderBlocks(
  source: Extract<PdfGenerationSource, { kind: 'document_blocks' }>
): string {
  return [
    `<h1>${escapeHtml(source.title)}</h1>`,
    ...source.blocks.map((block) => {
      if (block.kind === 'heading') {
        const level = Math.min(6, Math.max(1, block.level))
        return `<h${level}>${escapeHtml(block.text)}</h${level}>`
      }
      if (block.kind === 'paragraph') {
        return `<p>${escapeHtml(block.text)}</p>`
      }
      if (block.kind === 'bullet_list') {
        return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      }
      return `<table>${block.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
        )
        .join('')}</table>`
    })
  ].join('')
}

function assertNoExternalResources(html: string): void {
  const externalReference =
    /\b(?:src|href|poster|data|action)\s*=\s*["']?\s*(?:https?:)?\/\//i
  const cssImport = /@import\s+(?:url\()?["']?\s*(?:https?:)?\/\//i
  const cssUrl = /url\(\s*["']?\s*(?:https?:)?\/\//i
  const scriptTag = /<script\b/i
  if (
    externalReference.test(html) ||
    cssImport.test(html) ||
    cssUrl.test(html) ||
    scriptTag.test(html)
  ) {
    throw new PdfGenerationError(
      'pdf_external_resource_blocked',
      'External resources are not allowed for local PDF generation'
    )
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
