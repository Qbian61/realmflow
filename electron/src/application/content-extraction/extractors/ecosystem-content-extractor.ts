import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import MsgReader from '@kenjiuno/msgreader'
import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'
import { simpleParser, type ParsedMail } from 'mailparser'
import { parseFragment } from 'parse5'
import {
  ContentExtractionError,
  classifyExtractableContent,
  createEmailAttachmentUnitKey,
  createEpubSpineUnitKey,
  createSheetUnitKey,
  createSlideUnitKey,
  type ExtractedContentBundle,
  type ExtractedContentUnit
} from '../../../../../domain/content-extraction'
import type {
  LegacyOfficeFormat,
  ModernOfficeFormat
} from '../../files/private-python-worker-client'
import type {
  ContentExtractionInput,
  LocalContentExtractionService,
  LocalContentExtractor
} from '../local-content-extraction-service'
import type { ModernOfficeContentPort } from './office-conversion-extractor'

type ParsedMessage = {
  subject: string
  from: string
  to: string
  text: string
  attachments: Array<{
    fileName: string
    mimeType?: string
    bytes: Uint8Array
  }>
}

export class EcosystemContentExtractor implements LocalContentExtractor {
  readonly strategy = 'ecosystem' as const
  readonly formats = [
    'odt', 'ods', 'odp', 'rtf', 'eml', 'mbox', 'msg', 'mhtml', 'mht', 'epub'
  ] as const
  readonly version = 'ecosystem-content-v2'
  private readonly parseMsg: (bytes: Uint8Array) => Promise<ParsedMessage>

  constructor(
    private readonly dependencies: {
      converter: {
        convertBytes(input: {
          bytes: Uint8Array
          sourceFormat: LegacyOfficeFormat
          signal: AbortSignal
        }): Promise<{ bytes: Uint8Array; outputFormat: ModernOfficeFormat }>
      }
      modern: ModernOfficeContentPort
      children: Pick<LocalContentExtractionService, 'extract'>
      parseMsg?: (bytes: Uint8Array) => Promise<ParsedMessage>
    }
  ) {
    this.parseMsg = dependencies.parseMsg ?? parseMsg
  }

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    const format = extension(input.fileName)
    if (format === 'odt' || format === 'ods' || format === 'odp' || format === 'rtf') {
      return this.extractNativeFirst(input, format)
    }
    if (format === 'epub') return extractEpub(input, this.version)
    if (format === 'msg') {
      return this.extractMessages(input, [await this.parseMsg(input.bytes)])
    }
    const messages =
      format === 'mbox'
        ? await Promise.all(splitMbox(input.bytes).map(parseMimeMessage))
        : [await parseMimeMessage(input.bytes)]
    return this.extractMessages(input, messages)
  }

  private async extractNativeFirst(
    input: ContentExtractionInput,
    sourceFormat: 'odt' | 'ods' | 'odp' | 'rtf'
  ): Promise<ExtractedContentBundle> {
    try {
      return sourceFormat === 'rtf'
        ? extractRtf(input, this.version)
        : await extractOpenDocument(input, sourceFormat, this.version)
    } catch (error) {
      if (!shouldFallbackToConversion(error)) throw error
      if (!input.policy.allowLocalConversion) throw error
      return this.extractConverted(input, sourceFormat)
    }
  }

  private async extractConverted(
    input: ContentExtractionInput,
    sourceFormat: 'odt' | 'ods' | 'odp' | 'rtf'
  ): Promise<ExtractedContentBundle> {
    if (!input.policy.allowLocalConversion) {
      throw new ContentExtractionError(
        'extraction_converter_unavailable',
        'Local ecosystem conversion is disabled'
      )
    }
    let converted: { bytes: Uint8Array; outputFormat: ModernOfficeFormat }
    try {
      converted = await this.dependencies.converter.convertBytes({
        bytes: input.bytes,
        sourceFormat,
        signal: input.signal
      })
    } catch (error) {
      throw conversionError(error, input.signal)
    }
    const modern = await this.dependencies.modern.extract(
      converted.outputFormat,
      {
        ...input,
        bytes: converted.bytes,
        fileName: `converted.${converted.outputFormat}`,
        sourceChecksum: digest(converted.bytes)
      }
    )
    return {
      sourceChecksum: input.sourceChecksum,
      format: sourceFormat,
      extractorVersion: `${this.version}+${modern.extractorVersion}`,
      units: modern.units.map((unit) => ({
        ...unit,
        metadata: {
          format: sourceFormat,
          extraction:
            `ecosystem_convert:${unit.metadata?.extraction ?? modern.format}`,
          ...(unit.metadata?.page ? { page: unit.metadata.page } : {}),
          ...(unit.metadata?.sheet ? { sheet: unit.metadata.sheet } : {}),
          ...(unit.metadata?.slide ? { slide: unit.metadata.slide } : {})
        }
      }))
    }
  }

  private async extractMessages(
    input: ContentExtractionInput,
    messages: ParsedMessage[]
  ): Promise<ExtractedContentBundle> {
    const units: ExtractedContentUnit[] = []
    for (const [messageIndex, message] of messages.entries()) {
      const body = messageText(message)
      if (body) {
        units.push(
          unit({
            key: `message/${ordinal(messageIndex + 1)}/body`,
            title: message.subject || `Message ${messageIndex + 1}`,
            text: body,
            format: extension(input.fileName),
            extraction: 'email'
          })
        )
      }
      for (const [attachmentIndex, attachment] of message.attachments.entries()) {
        const capability = classifyExtractableContent({
          fileName: attachment.fileName,
          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          head: attachment.bytes.subarray(
            0,
            Math.min(attachment.bytes.byteLength, 512)
          )
        })
        if (capability.support === 'unsupported') continue
        const child = await this.dependencies.children.extract({
          ...input,
          bytes: attachment.bytes,
          fileName: attachment.fileName,
          ...(attachment.mimeType
            ? { mimeType: attachment.mimeType }
            : {}),
          sourceChecksum: digest(attachment.bytes),
          depth: input.depth + 1
        })
        for (const childUnit of child.units) {
          units.push({
            ...childUnit,
            key:
              `message/${ordinal(messageIndex + 1)}/` +
              createEmailAttachmentUnitKey(
                attachmentIndex + 1,
                attachment.fileName,
                childUnit.key
              ),
            title: `${attachment.fileName} / ${childUnit.title}`,
            metadata: {
              format: child.format,
              extraction:
                childUnit.metadata?.extraction ?? child.extractorVersion
            }
          })
        }
      }
    }
    if (units.length === 0) throw empty()
    return {
      sourceChecksum: input.sourceChecksum,
      format: extension(input.fileName),
      extractorVersion: this.version,
      units
    }
  }
}

async function parseMimeMessage(bytes: Uint8Array): Promise<ParsedMessage> {
  try {
    const parsed = await simpleParser(Buffer.from(bytes), {
      skipHtmlToText: true,
      skipTextToHtml: true
    })
    return normalizedMail(parsed)
  } catch {
    throw new ContentExtractionError(
      'extraction_invalid',
      'Email message could not be parsed'
    )
  }
}

function normalizedMail(mail: ParsedMail): ParsedMessage {
  const html =
    typeof mail.html === 'string' ? htmlToText(mail.html) : ''
  return {
    subject: mail.subject?.trim() ?? '',
    from: mail.from?.text.trim() ?? '',
    to: mail.to
      ? (Array.isArray(mail.to) ? mail.to : [mail.to])
          .map(({ text }) => text)
          .join(', ')
      : '',
    text: mail.text?.trim() || html,
    attachments: mail.attachments
      .filter(
        (attachment) =>
          attachment.contentDisposition === 'attachment' ||
          Boolean(attachment.filename)
      )
      .map((attachment, index) => ({
        fileName: attachment.filename || `attachment-${index + 1}`,
        mimeType: attachment.contentType,
        bytes: Uint8Array.from(attachment.content)
      }))
  }
}

async function parseMsg(bytes: Uint8Array): Promise<ParsedMessage> {
  try {
    const copy = Uint8Array.from(bytes)
    const reader = new MsgReader(
      copy.buffer.slice(
        copy.byteOffset,
        copy.byteOffset + copy.byteLength
      )
    )
    const data = reader.getFileData()
    if (data.error) throw new Error(data.error)
    const recipients = data.recipients ?? []
    return {
      subject: String(data.subject ?? ''),
      from: String(data.senderName ?? data.senderEmail ?? ''),
      to: recipients
        .filter((recipient) => recipient.recipType === 'to')
        .map((recipient) => String(recipient.email ?? recipient.name ?? ''))
        .filter(Boolean)
        .join(', '),
      text:
        String(data.body ?? '').trim() ||
        htmlToText(String(data.bodyHtml ?? '')),
      attachments: (data.attachments ?? []).map((attachment, index) => {
        const loaded = reader.getAttachment(attachment)
        return {
          fileName: String(
            loaded.fileName ??
            attachment.fileName ??
            attachment.fileNameShort ??
            `attachment-${index + 1}`
          ),
          bytes: Uint8Array.from(loaded.content)
        }
      })
    }
  } catch {
    throw new ContentExtractionError(
      'extraction_invalid',
      'MSG message could not be parsed'
    )
  }
}

async function extractEpub(
  input: ContentExtractionInput,
  version: string
): Promise<ExtractedContentBundle> {
  try {
    const archive = await JSZip.loadAsync(input.bytes, {
      checkCRC32: true,
      createFolders: false
    })
    const entries = Object.keys(archive.files)
    if (entries.length > 1_000) {
      throw new ContentExtractionError(
        'extraction_limit_exceeded',
        'EPUB contains too many entries'
      )
    }
    entries.forEach(safePackagePath)
    const xml = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true
    })
    const container = xml.parse(
      await requireZipText(archive, 'META-INF/container.xml')
    ) as Record<string, unknown>
    const rootfiles = record(record(container.container)?.rootfiles)?.rootfile
    const rootfile = array(rootfiles)[0]
    const opfPath = safePackagePath(
      String(record(rootfile)?.['@_full-path'] ?? '')
    )
    const opf = xml.parse(
      await requireZipText(archive, opfPath)
    ) as Record<string, unknown>
    const package_ = record(opf.package)
    const manifestItems = array(record(package_?.manifest)?.item)
    const manifest = new Map(
      manifestItems.map((item) => {
        const value = record(item)
        return [String(value?.['@_id'] ?? ''), String(value?.['@_href'] ?? '')]
      })
    )
    const spine = array(record(package_?.spine)?.itemref)
    const units = await Promise.all(
      spine.map(async (item, index) => {
        const id = String(record(item)?.['@_idref'] ?? '')
        const href = manifest.get(id)
        if (!href) throw new Error('Missing EPUB spine item')
        const path = safePackagePath(
          posix.join(posix.dirname(opfPath), href)
        )
        const text = htmlToText(await requireZipText(archive, path))
        if (!text) throw new Error('Empty EPUB spine item')
        return unit({
          key: createEpubSpineUnitKey(index + 1, href),
          title: text.split('\n')[0]!.slice(0, 120),
          text,
          format: 'epub',
          extraction: 'epub'
        })
      })
    )
    if (units.length === 0) throw empty()
    return {
      sourceChecksum: input.sourceChecksum,
      format: 'epub',
      extractorVersion: version,
      units
    }
  } catch (error) {
    if (error instanceof ContentExtractionError) throw error
    throw new ContentExtractionError(
      'extraction_invalid',
      'EPUB could not be parsed'
    )
  }
}

function messageText(message: ParsedMessage): string {
  return [
    message.subject ? `Subject: ${message.subject}` : '',
    message.from ? `From: ${message.from}` : '',
    message.to ? `To: ${message.to}` : '',
    message.text.trim()
  ]
    .filter(Boolean)
    .join('\n')
}

async function extractOpenDocument(
  input: ContentExtractionInput,
  format: 'odt' | 'ods' | 'odp',
  version: string
): Promise<ExtractedContentBundle> {
  try {
    const archive = await JSZip.loadAsync(input.bytes, {
      checkCRC32: true,
      createFolders: false
    })
    const xmlText = await requireZipText(archive, 'content.xml')
    const xml = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      preserveOrder: true,
      removeNSPrefix: false,
      trimValues: false
    })
    const root = xml.parse(xmlText) as unknown[]
    const units =
      format === 'ods'
        ? extractOpenDocumentSheets(root, format)
        : format === 'odp'
          ? extractOpenDocumentSlides(root, format)
          : [
              unit({
                key: 'content',
                title: baseTitle(input.fileName),
                text: extractXmlText(root),
                format,
                extraction: 'opendocument_native'
              })
            ]
    const readable = units.filter((item) => item.text.trim())
    if (readable.length === 0) throw empty()
    return {
      sourceChecksum: input.sourceChecksum,
      format,
      extractorVersion: version,
      units: readable
    }
  } catch (error) {
    if (error instanceof ContentExtractionError) throw error
    throw new ContentExtractionError(
      'extraction_invalid',
      'OpenDocument content could not be parsed'
    )
  }
}

function extractOpenDocumentSheets(
  root: unknown[],
  format: 'ods'
): ExtractedContentUnit[] {
  const usedKeys = new Set<string>()
  return findElements(root, 'table')
    .map((table, index) => {
      const sheet = attribute(table, 'table:name') || `Sheet ${index + 1}`
      const rows = childElements(table, 'table-row')
        .map((row) =>
          childElements(row, 'table-cell')
            .map((cell) => extractXmlText(cell.children))
            .map(escapeCell)
            .join('\t')
            .replace(/\t+$/g, '')
        )
        .filter((row) => row.trim())
      if (rows.length === 0) return undefined
      let key = createSheetUnitKey(sheet)
      if (usedKeys.has(key)) key = `${key}-${index + 1}`
      usedKeys.add(key)
      return unit({
        key,
        title: sheet,
        text: rows.join('\n'),
        format,
        extraction: 'opendocument_native',
        sheet
      })
    })
    .filter((item): item is ExtractedContentUnit => item !== undefined)
}

function extractOpenDocumentSlides(
  root: unknown[],
  format: 'odp'
): ExtractedContentUnit[] {
  return findElements(root, 'page')
    .map((page, index) => {
      const slide = index + 1
      const text = extractXmlText(page.children)
      if (!text.trim()) return undefined
      return unit({
        key: createSlideUnitKey(slide),
        title: attribute(page, 'draw:name') || `Slide ${slide}`,
        text,
        format,
        extraction: 'opendocument_native',
        slide
      })
    })
    .filter((item): item is ExtractedContentUnit => item !== undefined)
}

function extractRtf(
  input: ContentExtractionInput,
  version: string
): ExtractedContentBundle {
  const text = parseRtfText(Buffer.from(input.bytes).toString('latin1'))
  if (!text.trim()) throw empty()
  return {
    sourceChecksum: input.sourceChecksum,
    format: 'rtf',
    extractorVersion: version,
    units: [
      unit({
        key: 'content',
        title: baseTitle(input.fileName),
        text,
        format: 'rtf',
        extraction: 'rtf_native'
      })
    ]
  }
}

type XmlElement = {
  name: string
  children: unknown[]
  attributes: Record<string, unknown>
}

function findElements(nodes: unknown[], localName: string): XmlElement[] {
  const result: XmlElement[] = []
  const visit = (value: unknown): void => {
    const element = xmlElement(value)
    if (!element) return
    if (xmlLocalName(element.name) === localName) result.push(element)
    for (const child of element.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return result
}

function childElements(parent: XmlElement, localName: string): XmlElement[] {
  return parent.children
    .map(xmlElement)
    .filter(
      (child): child is XmlElement =>
        child !== undefined && xmlLocalName(child.name) === localName
    )
}

function extractXmlText(nodes: unknown[]): string {
  const chunks: string[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const recordValue = record(value)
    if (!recordValue) return
    const text = recordValue['#text']
    if (typeof text === 'string') chunks.push(text)
    const element = xmlElement(value)
    if (!element) return
    const localName = xmlLocalName(element.name)
    if (localName === 'line-break') chunks.push('\n')
    if (localName === 'tab') chunks.push('\t')
    for (const child of element.children) visit(child)
    if (
      localName === 'p' ||
      localName === 'h' ||
      localName === 'list-item' ||
      localName === 'table-row' ||
      localName === 'page'
    ) {
      chunks.push('\n')
    }
  }
  nodes.forEach(visit)
  return normalizePlainText(chunks.join(''))
}

function xmlElement(value: unknown): XmlElement | undefined {
  const object = record(value)
  if (!object) return undefined
  const name = Object.keys(object).find(
    (key) => key !== ':@' && key !== '#text'
  )
  if (!name) return undefined
  const children = object[name]
  return {
    name,
    children: Array.isArray(children) ? children : [],
    attributes: record(object[':@']) ?? {}
  }
}

function attribute(element: XmlElement, name: string): string {
  const direct = element.attributes[`@_${name}`]
  if (typeof direct === 'string') return direct.trim()
  const suffix = name.split(':').at(-1)
  const value = Object.entries(element.attributes).find(([key]) =>
    suffix ? key.endsWith(`:${suffix}`) || key.endsWith(`_${suffix}`) : false
  )?.[1]
  return typeof value === 'string' ? value.trim() : ''
}

function xmlLocalName(name: string): string {
  return name.split(':').at(-1) ?? name
}

function parseRtfText(source: string): string {
  type RtfState = { ignorable: boolean; ucSkip: number }
  let state: RtfState = { ignorable: false, ucSkip: 1 }
  const stack: RtfState[] = []
  let output = ''
  let skipFallback = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') {
      stack.push({ ...state })
      continue
    }
    if (char === '}') {
      state = stack.pop() ?? state
      continue
    }
    if (char !== '\\') {
      if (skipFallback > 0) {
        skipFallback -= 1
        continue
      }
      if (!state.ignorable) output += char
      continue
    }
    const next = source[index + 1]
    if (next === '\\' || next === '{' || next === '}') {
      if (!state.ignorable) output += next
      index += 1
      continue
    }
    if (next === '\'') {
      const hex = source.slice(index + 2, index + 4)
      if (/^[0-9a-f]{2}$/i.test(hex) && !state.ignorable) {
        output += String.fromCharCode(Number.parseInt(hex, 16))
      }
      index += 3
      continue
    }
    if (next === '*') {
      state = { ...state, ignorable: true }
      index += 1
      continue
    }
    const match = /^([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(index + 1))
    if (!match) {
      index += 1
      continue
    }
    const word = match[1]!
    const parameter =
      match[2] === undefined ? undefined : Number.parseInt(match[2], 10)
    handleRtfControl(word, parameter, {
      state,
      setState: (nextState) => {
        state = nextState
      },
      append: (value) => {
        if (!state.ignorable) output += value
      },
      setSkipFallback: (value) => {
        skipFallback = value
      }
    })
    index += match[0].length
  }
  return normalizePlainText(output)
}

function handleRtfControl(
  word: string,
  parameter: number | undefined,
  actions: {
    state: { ignorable: boolean; ucSkip: number }
    setState(value: { ignorable: boolean; ucSkip: number }): void
    append(value: string): void
    setSkipFallback(value: number): void
  }
): void {
  if (IGNORED_RTF_DESTINATIONS.has(word)) {
    actions.setState({ ...actions.state, ignorable: true })
    return
  }
  if (word === 'uc' && parameter !== undefined) {
    actions.setState({
      ...actions.state,
      ucSkip: Math.max(0, parameter)
    })
    return
  }
  if (word === 'u' && parameter !== undefined) {
    const code = parameter < 0 ? parameter + 65536 : parameter
    actions.append(String.fromCharCode(code))
    actions.setSkipFallback(actions.state.ucSkip)
    return
  }
  if (word === 'par' || word === 'line') actions.append('\n')
  else if (word === 'tab') actions.append('\t')
  else if (word === 'emdash') actions.append('-')
  else if (word === 'endash') actions.append('-')
  else if (word === 'bullet') actions.append('*')
}

const IGNORED_RTF_DESTINATIONS = new Set([
  'annotation',
  'colortbl',
  'datafield',
  'datastore',
  'field',
  'fldinst',
  'fonttbl',
  'footer',
  'footerf',
  'footerl',
  'footerr',
  'footnote',
  'generator',
  'header',
  'headerf',
  'headerl',
  'headerr',
  'info',
  'listoverridetable',
  'listtable',
  'object',
  'pict',
  'stylesheet',
  'themedata'
])

type HtmlNode = {
  nodeName?: string
  tagName?: string
  value?: string
  childNodes?: HtmlNode[]
}

function htmlToText(html: string): string {
  const root = parseFragment(html) as unknown as HtmlNode
  const chunks: string[] = []
  const visit = (node: HtmlNode): void => {
    const tag = node.tagName?.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'noscript') return
    if (node.nodeName === '#text' && node.value?.trim()) {
      chunks.push(node.value.trim())
    }
    for (const child of node.childNodes ?? []) visit(child)
    if (
      tag === 'p' ||
      tag === 'div' ||
      tag === 'br' ||
      /^h[1-6]$/.test(tag ?? '')
    ) {
      chunks.push('\n')
    }
  }
  visit(root)
  return chunks
    .join(' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitMbox(bytes: Uint8Array): Uint8Array[] {
  const lines = new TextDecoder('utf-8', { fatal: true })
    .decode(bytes)
    .split(/\r?\n/)
  const messages: Uint8Array[] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.startsWith('From ') && current.length > 0) {
      messages.push(new TextEncoder().encode(current.join('\r\n')))
      current = []
      continue
    }
    if (!line.startsWith('From ') || current.length > 0) current.push(line)
  }
  if (current.length > 0) {
    messages.push(new TextEncoder().encode(current.join('\r\n')))
  }
  return messages
}

function unit(input: {
  key: string
  title: string
  text: string
  format: string
  extraction: string
  sheet?: string
  slide?: number
}): ExtractedContentUnit {
  const bytes = new TextEncoder().encode(input.text)
  return {
    key: input.key,
    title: input.title,
    text: input.text,
    checksum: digest(bytes),
    byteSize: bytes.byteLength,
    metadata: {
      format: input.format,
      extraction: input.extraction,
      ...(input.sheet ? { sheet: input.sheet } : {}),
      ...(input.slide ? { slide: input.slide } : {})
    }
  }
}

function escapeCell(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

function normalizePlainText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function baseTitle(fileName: string): string {
  return fileName.split(/[/\\]/).at(-1) || fileName
}

function extension(fileName: string): string {
  return fileName.toLowerCase().split('.').at(-1) ?? ''
}

function ordinal(value: number): string {
  return String(value).padStart(6, '0')
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function conversionError(
  error: unknown,
  signal: AbortSignal
): ContentExtractionError {
  if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return new ContentExtractionError(
      'extraction_interrupted',
      'Ecosystem conversion was interrupted'
    )
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'converter_unavailable'
  ) {
    return new ContentExtractionError(
      'extraction_converter_unavailable',
      'LibreOffice is unavailable'
    )
  }
  return new ContentExtractionError(
    'extraction_invalid',
    'Ecosystem conversion failed'
  )
}

function shouldFallbackToConversion(error: unknown): boolean {
  return (
    error instanceof ContentExtractionError &&
    (error.code === 'extraction_invalid' || error.code === 'extraction_empty')
  )
}

function safePackagePath(value: string): string {
  const normalized = posix.normalize(value.replace(/\\/g, '/'))
  if (
    !value ||
    value.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error('Unsafe package path')
  }
  return normalized
}

async function requireZipText(archive: JSZip, path: string): Promise<string> {
  const entry = archive.file(path)
  if (!entry || entry.dir) throw new Error('Missing package entry')
  return entry.async('string')
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function array(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function empty(): ContentExtractionError {
  return new ContentExtractionError(
    'extraction_empty',
    'Content contains no readable text'
  )
}
