export type WorkbenchMemoMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'strike' }
  | { type: 'link'; attrs: { href: string } }

export type WorkbenchMemoNode = {
  type:
    | 'doc'
    | 'paragraph'
    | 'heading'
    | 'text'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'blockquote'
    | 'hardBreak'
    | 'horizontalRule'
    | 'image'
    | 'fileAttachment'
  text?: string
  marks?: WorkbenchMemoMark[]
  attrs?: {
    attachmentId?: string
    alt?: string
    title?: string
    level?: 1 | 2
  }
  content?: WorkbenchMemoNode[]
}

export type WorkbenchMemoDocument = WorkbenchMemoNode & { type: 'doc' }

export type WorkbenchMemo = {
  id: string
  title: string
  document: WorkbenchMemoDocument
  plainText: string
  position: number
  revision: number
  createdAt: number
  updatedAt: number
}

export type DeletedWorkbenchMemo = WorkbenchMemo & {
  deletedAt: number
}

type MemoRequest = { requestId: string }
type MemoRevisionRequest = MemoRequest & { expectedRevision: number }

export type CreateWorkbenchMemoCommand = MemoRequest & {
  title: string
  document: WorkbenchMemoDocument
}

export type UpdateWorkbenchMemoCommand = MemoRevisionRequest & {
  memoId: string
  title?: string
  document?: WorkbenchMemoDocument
  position?: number
}

export type DeleteWorkbenchMemoCommand = MemoRevisionRequest & {
  memoId: string
}

export type RestoreWorkbenchMemoCommand = MemoRevisionRequest & {
  memoId: string
}

export type WorkbenchMemoMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'revision_conflict'; currentRevision: number }

export interface WorkbenchMemoApi {
  getMemos(): Promise<WorkbenchMemo[]>
  getDeletedMemos(): Promise<DeletedWorkbenchMemo[]>
  createMemo(command: CreateWorkbenchMemoCommand): Promise<WorkbenchMemo>
  updateMemo(
    command: UpdateWorkbenchMemoCommand
  ): Promise<WorkbenchMemoMutationResult<WorkbenchMemo>>
  deleteMemo(
    command: DeleteWorkbenchMemoCommand
  ): Promise<WorkbenchMemoMutationResult<{ memoId: string }>>
  restoreMemo(
    command: RestoreWorkbenchMemoCommand
  ): Promise<WorkbenchMemoMutationResult<WorkbenchMemo>>
}

export function createEmptyWorkbenchMemoDocument(): WorkbenchMemoDocument {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

export function parseCreateWorkbenchMemoCommand(
  value: unknown
): CreateWorkbenchMemoCommand {
  const input = record(value)
  return {
    requestId: identifier(input.requestId, 'requestId'),
    title: title(input.title),
    document:
      input.document === undefined
        ? createEmptyWorkbenchMemoDocument()
        : sanitizeWorkbenchMemoDocument(input.document)
  }
}

export function parseUpdateWorkbenchMemoCommand(
  value: unknown
): UpdateWorkbenchMemoCommand {
  const input = revisionCommand(value)
  return {
    requestId: input.requestId,
    memoId: identifier(input.memoId, 'memoId'),
    expectedRevision: input.expectedRevision,
    ...(input.title === undefined ? {} : { title: title(input.title) }),
    ...(input.document === undefined
      ? {}
      : { document: sanitizeWorkbenchMemoDocument(input.document) }),
    ...(input.position === undefined
      ? {}
      : { position: position(input.position) })
  }
}

export function parseDeleteWorkbenchMemoCommand(
  value: unknown
): DeleteWorkbenchMemoCommand {
  const input = revisionCommand(value)
  return {
    requestId: input.requestId,
    memoId: identifier(input.memoId, 'memoId'),
    expectedRevision: input.expectedRevision
  }
}

export function parseRestoreWorkbenchMemoCommand(
  value: unknown
): RestoreWorkbenchMemoCommand {
  return parseDeleteWorkbenchMemoCommand(value)
}

export function sanitizeWorkbenchMemoDocument(
  value: unknown
): WorkbenchMemoDocument {
  const document = sanitizeNode(value, 'doc', 0)
  const serialized = JSON.stringify(document)
  if (serialized.length > 1_000_000) {
    throw new Error('Workbench memo document is too large')
  }
  return document as WorkbenchMemoDocument
}

export function extractWorkbenchMemoPlainText(
  document: WorkbenchMemoDocument
): string {
  const blocks: string[] = []
  const visit = (node: WorkbenchMemoNode): void => {
    if (node.type === 'text' && node.text) blocks.push(node.text)
    if (node.type === 'hardBreak') blocks.push('\n')
    for (const child of node.content ?? []) visit(child)
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'listItem' ||
      node.type === 'blockquote'
    ) {
      blocks.push('\n')
    }
  }
  visit(document)
  return blocks.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function collectWorkbenchMemoAttachmentIds(
  document: WorkbenchMemoDocument
): string[] {
  const ids = new Set<string>()
  const visit = (node: WorkbenchMemoNode): void => {
    if (
      (node.type === 'image' || node.type === 'fileAttachment') &&
      node.attrs?.attachmentId
    ) {
      ids.add(node.attrs.attachmentId)
    }
    for (const child of node.content ?? []) visit(child)
  }
  visit(document)
  return [...ids]
}

function sanitizeNode(
  value: unknown,
  expectedType?: WorkbenchMemoNode['type'],
  depth = 0
): WorkbenchMemoNode {
  if (depth > 20) throw new Error('Workbench memo node nesting is too deep')
  const input = record(value)
  const type = nodeType(input.type)
  if (expectedType && type !== expectedType) {
    throw new Error(`Invalid workbench memo ${expectedType} node`)
  }
  if (type === 'text') {
    if (typeof input.text !== 'string') {
      throw new Error('Invalid workbench memo text node')
    }
    return {
      type,
      text: input.text.slice(0, 100_000),
      ...(input.marks === undefined ? {} : { marks: sanitizeMarks(input.marks) })
    }
  }
  if (type === 'hardBreak' || type === 'horizontalRule') return { type }
  if (type === 'heading') {
    const attrs = record(input.attrs)
    if (attrs.level !== 1 && attrs.level !== 2) {
      throw new Error('Invalid workbench memo heading level')
    }
    const content = input.content
    if (content !== undefined && !Array.isArray(content)) {
      throw new Error('Invalid workbench memo node content')
    }
    return {
      type,
      attrs: { level: attrs.level },
      ...(content === undefined
        ? {}
        : {
            content: content.map((child) => {
              const sanitized = sanitizeNode(child, undefined, depth + 1)
              if (!isAllowedChild(type, sanitized.type)) {
                throw new Error('Invalid workbench memo child node')
              }
              return sanitized
            })
          })
    }
  }
  if (type === 'image' || type === 'fileAttachment') {
    const attrs = record(input.attrs)
    return {
      type,
      attrs: {
        attachmentId: identifier(attrs.attachmentId, 'attachmentId'),
        ...(type === 'image' && typeof attrs.alt === 'string'
          ? { alt: attrs.alt.slice(0, 500) }
          : {}),
        ...(type === 'image' && typeof attrs.title === 'string'
          ? { title: attrs.title.slice(0, 500) }
          : {})
      }
    }
  }
  const content = input.content
  if (content !== undefined && !Array.isArray(content)) {
    throw new Error('Invalid workbench memo node content')
  }
  return {
    type,
    ...(content === undefined
      ? {}
      : {
          content: content.map((child) => {
            const sanitized = sanitizeNode(child, undefined, depth + 1)
            if (!isAllowedChild(type, sanitized.type)) {
              throw new Error('Invalid workbench memo child node')
            }
            return sanitized
          })
        })
  }
}

function isAllowedChild(
  parent: WorkbenchMemoNode['type'],
  child: WorkbenchMemoNode['type']
): boolean {
  const allowed: Partial<
    Record<WorkbenchMemoNode['type'], WorkbenchMemoNode['type'][]>
  > = {
    doc: [
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'blockquote',
      'horizontalRule',
      'image',
      'fileAttachment'
    ],
    paragraph: ['text', 'hardBreak'],
    heading: ['text', 'hardBreak'],
    bulletList: ['listItem'],
    orderedList: ['listItem'],
    listItem: [
      'paragraph',
      'bulletList',
      'orderedList',
      'blockquote',
      'image',
      'fileAttachment'
    ],
    blockquote: ['paragraph', 'bulletList', 'orderedList']
  }
  return allowed[parent]?.includes(child) ?? false
}

function sanitizeMarks(value: unknown): WorkbenchMemoMark[] {
  if (!Array.isArray(value)) throw new Error('Invalid workbench memo marks')
  return value.map((mark) => {
    const input = record(mark)
    if (
      input.type === 'bold' ||
      input.type === 'italic' ||
      input.type === 'strike'
    ) {
      return { type: input.type }
    }
    if (input.type === 'link') {
      const attrs = record(input.attrs)
      return {
        type: 'link',
        attrs: { href: safeLink(attrs.href) }
      }
    }
    throw new Error('Invalid workbench memo mark')
  })
}

function safeLink(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2_048) {
    throw new Error('Invalid workbench memo link')
  }
  try {
    const url = new URL(value)
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error()
    return url.toString()
  } catch {
    throw new Error('Invalid workbench memo link')
  }
}

function nodeType(value: unknown): WorkbenchMemoNode['type'] {
  const types: WorkbenchMemoNode['type'][] = [
    'doc',
    'paragraph',
    'heading',
    'text',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'hardBreak',
    'horizontalRule',
    'image',
    'fileAttachment'
  ]
  if (!types.includes(value as WorkbenchMemoNode['type'])) {
    throw new Error('Invalid workbench memo node type')
  }
  return value as WorkbenchMemoNode['type']
}

function revisionCommand(value: unknown): Record<string, unknown> & {
  requestId: string
  expectedRevision: number
} {
  const input = record(value)
  return {
    ...input,
    requestId: identifier(input.requestId, 'requestId'),
    expectedRevision: revision(input.expectedRevision)
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected workbench memo object')
  }
  return value as Record<string, unknown>
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new Error(`Invalid workbench memo ${label}`)
  }
  return value.trim()
}

function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new Error('Invalid workbench memo title')
  }
  return value.trim()
}

function revision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error('Invalid workbench memo expectedRevision')
  }
  return value as number
}

function position(value: unknown): number {
  if (!Number.isInteger(value) || Math.abs(value as number) > 1_000_000_000) {
    throw new Error('Invalid workbench memo position')
  }
  return value as number
}
