import { describe, expect, it } from 'vitest'
import {
  parseAttachmentOwnerQuery,
  parseDeleteWorkbenchAttachmentCommand,
  parsePickWorkbenchAttachmentCommand
} from './workbench-attachments'

describe('workbench attachment contract', () => {
  it('normalizes Main-owned picker commands', () => {
    expect(
      parsePickWorkbenchAttachmentCommand({
        requestId: ' request-1 ',
        ownerType: 'task_record',
        ownerId: ' record-1 ',
        accept: 'image'
      })
    ).toEqual({
      requestId: 'request-1',
      ownerType: 'task_record',
      ownerId: 'record-1',
      accept: 'image'
    })

    expect(
      parsePickWorkbenchAttachmentCommand({
        requestId: 'request-2',
        ownerType: 'memo',
        ownerId: 'memo-1'
      })
    ).toEqual({
      requestId: 'request-2',
      ownerType: 'memo',
      ownerId: 'memo-1',
      accept: 'any'
    })
  })

  it('rejects unsupported owners and picker modes', () => {
    expect(() =>
      parsePickWorkbenchAttachmentCommand({
        requestId: 'request-1',
        ownerType: 'requirement',
        ownerId: 'requirement-1'
      })
    ).toThrow('ownerType')
    expect(() =>
      parsePickWorkbenchAttachmentCommand({
        requestId: 'request-1',
        ownerType: 'site_icon',
        ownerId: 'site-1',
        accept: 'executable'
      })
    ).toThrow('accept')
  })

  it('validates owner queries and attachment deletion commands', () => {
    expect(
      parseAttachmentOwnerQuery({
        ownerType: 'site_icon',
        ownerId: 'site-1'
      })
    ).toEqual({ ownerType: 'site_icon', ownerId: 'site-1' })
    expect(
      parseDeleteWorkbenchAttachmentCommand({
        requestId: 'request-3',
        attachmentId: 'attachment-1'
      })
    ).toEqual({
      requestId: 'request-3',
      attachmentId: 'attachment-1'
    })
    expect(() =>
      parseDeleteWorkbenchAttachmentCommand({
        requestId: '',
        attachmentId: 'attachment-1'
      })
    ).toThrow('requestId')
  })
})
