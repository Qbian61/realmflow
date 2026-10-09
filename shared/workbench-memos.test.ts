import { describe, expect, it } from 'vitest'
import {
  createEmptyWorkbenchMemoDocument,
  extractWorkbenchMemoPlainText,
  parseCreateWorkbenchMemoCommand,
  parseUpdateWorkbenchMemoCommand,
  sanitizeWorkbenchMemoDocument
} from './workbench-memos'

describe('workbench memos contract', () => {
  it('accepts the supported Tiptap JSON schema and extracts plain text', () => {
    const document = sanitizeWorkbenchMemoDocument({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'RealmFlow ', marks: [{ type: 'bold' }] },
            {
              type: 'text',
              text: 'docs',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://realmflow.dev/docs', target: '_blank' }
                }
              ]
            }
          ]
        },
        {
          type: 'fileAttachment',
          attrs: { attachmentId: 'attachment-1' }
        }
      ]
    })

    expect(document).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'RealmFlow ', marks: [{ type: 'bold' }] },
            {
              type: 'text',
              text: 'docs',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://realmflow.dev/docs' }
                }
              ]
            }
          ]
        },
        {
          type: 'fileAttachment',
          attrs: { attachmentId: 'attachment-1' }
        }
      ]
    })
    expect(extractWorkbenchMemoPlainText(document)).toBe('RealmFlow docs')
  })

  it('accepts heading, strikethrough, and horizontal rule formatting', () => {
    const document = sanitizeWorkbenchMemoDocument({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: '发布计划',
              marks: [{ type: 'strike' }]
            }
          ]
        },
        { type: 'horizontalRule' },
        { type: 'paragraph' }
      ]
    })

    expect(document).toEqual({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: '发布计划',
              marks: [{ type: 'strike' }]
            }
          ]
        },
        { type: 'horizontalRule' },
        { type: 'paragraph' }
      ]
    })
    expect(extractWorkbenchMemoPlainText(document)).toBe('发布计划')
  })

  it('rejects unknown nodes, raw HTML, and unsafe links', () => {
    expect(() =>
      sanitizeWorkbenchMemoDocument({
        type: 'doc',
        content: [{ type: 'html', attrs: { value: '<script />' } }]
      })
    ).toThrow('node')
    expect(() =>
      sanitizeWorkbenchMemoDocument({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'unsafe',
                marks: [
                  { type: 'link', attrs: { href: 'javascript:alert(1)' } }
                ]
              }
            ]
          }
        ]
      })
    ).toThrow('link')
    expect(() =>
      sanitizeWorkbenchMemoDocument({
        type: 'doc',
        content: [{ type: 'text', text: 'orphan text' }]
      })
    ).toThrow('child')
  })

  it('validates create and revision-based update commands', () => {
    const empty = createEmptyWorkbenchMemoDocument()
    expect(
      parseCreateWorkbenchMemoCommand({
        requestId: ' request-1 ',
        title: ' 计划 '
      })
    ).toEqual({
      requestId: 'request-1',
      title: '计划',
      document: empty
    })
    expect(
      parseUpdateWorkbenchMemoCommand({
        requestId: 'request-2',
        memoId: 'memo-1',
        expectedRevision: 2,
        title: '新计划',
        document: empty
      })
    ).toEqual({
      requestId: 'request-2',
      memoId: 'memo-1',
      expectedRevision: 2,
      title: '新计划',
      document: empty
    })
    expect(() =>
      parseUpdateWorkbenchMemoCommand({
        requestId: 'request-2',
        memoId: 'memo-1',
        expectedRevision: -1
      })
    ).toThrow('expectedRevision')
  })
})
