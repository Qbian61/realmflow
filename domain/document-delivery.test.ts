import { describe, expect, it } from 'vitest'
import {
  completeDocumentDelivery,
  createDocumentDelivery,
  evaluateDocumentDeliveryCompletionGate,
  failDocumentDelivery,
  startDocumentDelivery,
  type DocumentDeliveryInput
} from './document-delivery'

const checksum = (value: string) => `sha256:${value.repeat(64)}`

function createInput(): DocumentDeliveryInput {
  return {
    kind: 'create',
    outputPath: 'deliverables/report.docx',
    document: {
      title: 'Delivery report',
      blocks: [
        { kind: 'heading', level: 1, text: 'Summary' },
        { kind: 'paragraph', text: 'Ready for review.' }
      ]
    }
  }
}

describe('document delivery', () => {
  it('creates a stable idempotency fingerprint from canonical input', () => {
    const first = createDocumentDelivery({
      requestId: 'request-1',
      input: createInput(),
      requestedAt: 100
    })
    const second = createDocumentDelivery({
      requestId: 'request-2',
      input: {
        document: {
          blocks: [
            { text: 'Summary', level: 1, kind: 'heading' },
            { text: 'Ready for review.', kind: 'paragraph' }
          ],
          title: 'Delivery report'
        },
        outputPath: 'deliverables/report.docx',
        kind: 'create'
      },
      requestedAt: 200
    })

    expect(first.status).toBe('requested')
    expect(first.idempotencyFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(second.idempotencyFingerprint).toBe(first.idempotencyFingerprint)
  })

  it('defines checksum-bound export and verification inputs', () => {
    const exportDelivery = createDocumentDelivery({
      requestId: 'request-export',
      input: {
        kind: 'export_pdf',
        sourcePath: 'deliverables/report.docx',
        sourceChecksum: checksum('a'),
        outputPath: 'deliverables/report.pdf'
      },
      requestedAt: 100
    })
    const verifyDelivery = createDocumentDelivery({
      requestId: 'request-verify',
      input: {
        kind: 'verify',
        path: 'deliverables/report.pdf',
        format: 'pdf',
        expectedChecksum: checksum('b'),
        minimumByteSize: 100,
        minimumPageCount: 1
      },
      requestedAt: 100
    })

    expect(exportDelivery.input.kind).toBe('export_pdf')
    expect(verifyDelivery.input.kind).toBe('verify')
    expect(() =>
      createDocumentDelivery({
        requestId: 'bad-export',
        input: {
          kind: 'export_pdf',
          sourcePath: 'deliverables/report.docx',
          sourceChecksum: 'not-a-checksum',
          outputPath: 'deliverables/report.pdf'
        },
        requestedAt: 100
      })
    ).toThrow('Document delivery checksum is invalid')
  })

  it('moves linearly to a receipt bound to the request fingerprint', () => {
    const requested = createDocumentDelivery({
      requestId: 'request-1',
      input: createInput(),
      requestedAt: 100
    })
    const running = startDocumentDelivery(requested, 110)
    const completed = completeDocumentDelivery(running, {
      completedAt: 120,
      artifact: {
        path: 'deliverables/report.docx',
        format: 'docx',
        byteSize: 2048,
        checksum: checksum('a')
      }
    })

    expect(completed.status).toBe('succeeded')
    expect(completed.receipt).toEqual({
      requestId: 'request-1',
      operation: 'create',
      idempotencyFingerprint: requested.idempotencyFingerprint,
      status: 'succeeded',
      artifact: {
        path: 'deliverables/report.docx',
        format: 'docx',
        byteSize: 2048,
        checksum: checksum('a')
      },
      completedAt: 120
    })
    expect(() => startDocumentDelivery(completed, 130)).toThrow(
      'Invalid document delivery transition'
    )
  })

  it('records a stable failed receipt without claiming an artifact', () => {
    const running = startDocumentDelivery(
      createDocumentDelivery({
        requestId: 'request-1',
        input: createInput(),
        requestedAt: 100
      }),
      110
    )
    const failed = failDocumentDelivery(running, {
      completedAt: 120,
      errorCode: 'document_create_failed',
      message: 'Document creation failed'
    })

    expect(failed).toMatchObject({
      status: 'failed',
      receipt: {
        requestId: 'request-1',
        operation: 'create',
        status: 'failed',
        errorCode: 'document_create_failed',
        message: 'Document creation failed',
        completedAt: 120
      }
    })
    expect(failed.receipt).not.toHaveProperty('artifact')
  })

  it('blocks completion until required artifacts have matching verification receipts', () => {
    const create = successfulDelivery(
      'create',
      createInput(),
      'deliverables/report.docx',
      'docx',
      checksum('a')
    )
    const verify = successfulDelivery(
      'verify',
      {
        kind: 'verify',
        path: 'deliverables/report.docx',
        format: 'docx',
        expectedChecksum: checksum('a')
      },
      'deliverables/report.docx',
      'docx',
      checksum('a'),
      true
    )

    expect(
      evaluateDocumentDeliveryCompletionGate({
        pendingCalls: 0,
        waitingPermissions: 0,
        fileTransactionsTerminal: true,
        acceptance: 'satisfied',
        requiredArtifacts: [
          {
            path: 'deliverables/report.docx',
            format: 'docx',
            checksum: checksum('a')
          }
        ],
        deliveries: [create, verify]
      })
    ).toEqual({ allowed: true, reasons: [] })

    expect(
      evaluateDocumentDeliveryCompletionGate({
        pendingCalls: 1,
        waitingPermissions: 0,
        fileTransactionsTerminal: true,
        acceptance: 'satisfied',
        requiredArtifacts: [
          {
            path: 'deliverables/report.docx',
            format: 'docx',
            checksum: checksum('b')
          }
        ],
        deliveries: [create, verify]
      })
    ).toEqual({
      allowed: false,
      reasons: ['pending_calls', 'artifact_not_verified']
    })
  })
})

function successfulDelivery(
  requestId: string,
  input: DocumentDeliveryInput,
  path: string,
  format: 'docx' | 'pdf',
  artifactChecksum: string,
  verified?: true
) {
  return completeDocumentDelivery(
    startDocumentDelivery(
      createDocumentDelivery({ requestId, input, requestedAt: 100 }),
      110
    ),
    {
      completedAt: 120,
      artifact: {
        path,
        format,
        byteSize: 1024,
        checksum: artifactChecksum,
        ...(verified ? { verified } : {})
      }
    }
  )
}
