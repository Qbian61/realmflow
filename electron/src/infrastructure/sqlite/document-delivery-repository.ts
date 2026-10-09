import type Database from 'better-sqlite3'
import {
  createDocumentDelivery,
  startDocumentDelivery,
  type DocumentDelivery,
  type DocumentDeliveryReceipt,
  type FailedDocumentDelivery,
  type RequestedDocumentDelivery,
  type RunningDocumentDelivery,
  type SucceededDocumentDelivery
} from '../../../../domain/document-delivery'

export type PendingDocumentDelivery = {
  delivery: RequestedDocumentDelivery | RunningDocumentDelivery
  scopeRoot: string
  requirementId?: string
  nodeRunId?: string
}

export type DocumentDeliveryRequestResult =
  | {
      status: 'created' | 'pending'
      delivery: RequestedDocumentDelivery | RunningDocumentDelivery
    }
  | {
      status: 'completed'
      receipt: DocumentDeliveryReceipt
      receiptId: string
    }

type OperationRow = {
  request_id: string
  idempotency_fingerprint: string
  input_json: string
  scope_root: string
  requirement_id: string | null
  node_run_id: string | null
  status: 'requested' | 'running'
  requested_at: number
  started_at: number | null
}

type ReceiptRow = {
  id: string
  idempotency_fingerprint: string
  scope_root: string
  requirement_id: string | null
  node_run_id: string | null
  receipt_json: string
}

export class SqliteDocumentDeliveryRepository {
  constructor(private readonly database: Database.Database) {}

  async request(input: {
    delivery: RequestedDocumentDelivery
    scopeRoot: string
    requirementId?: string
    nodeRunId?: string
  }): Promise<DocumentDeliveryRequestResult> {
    return this.database.transaction(() => {
      const receipt = this.readReceiptRow(input.delivery.requestId)
      if (receipt) {
        assertFingerprint(
          receipt.idempotency_fingerprint,
          input.delivery.idempotencyFingerprint
        )
        assertContext(receipt, input)
        return {
          status: 'completed' as const,
          receipt: parseReceipt(receipt.receipt_json),
          receiptId: receipt.id
        }
      }
      const existing = this.readOperation(input.delivery.requestId)
      if (existing) {
        assertFingerprint(
          existing.idempotency_fingerprint,
          input.delivery.idempotencyFingerprint
        )
        assertContext(existing, input)
        return {
          status: 'pending' as const,
          delivery: mapOperation(existing).delivery
        }
      }
      this.database
        .prepare(
          `INSERT INTO document_delivery_operations (
            request_id, idempotency_fingerprint, operation, input_json,
            scope_root, requirement_id, node_run_id, status, requested_at,
            started_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, NULL, ?)`
        )
        .run(
          input.delivery.requestId,
          input.delivery.idempotencyFingerprint,
          input.delivery.input.kind,
          JSON.stringify(input.delivery.input),
          input.scopeRoot,
          input.requirementId ?? null,
          input.nodeRunId ?? null,
          input.delivery.requestedAt,
          input.delivery.requestedAt
        )
      return { status: 'created' as const, delivery: input.delivery }
    })()
  }

  async markRunning(
    requestId: string,
    startedAt: number
  ): Promise<RunningDocumentDelivery> {
    return this.database.transaction(() => {
      const row = this.readOperation(requestId)
      if (!row) throw new Error('Document delivery operation was not found')
      const pending = mapOperation(row).delivery
      if (pending.status === 'running') {
        if (pending.startedAt !== startedAt) {
          throw new Error('Document delivery running state conflicted')
        }
        return pending
      }
      const running = startDocumentDelivery(pending, startedAt)
      this.database
        .prepare(
          `UPDATE document_delivery_operations
           SET status = 'running', started_at = ?, updated_at = ?
           WHERE request_id = ? AND status = 'requested'`
        )
        .run(startedAt, startedAt, requestId)
      return running
    })()
  }

  async complete(
    delivery: SucceededDocumentDelivery | FailedDocumentDelivery
  ): Promise<{ id: string; receipt: DocumentDeliveryReceipt }> {
    return this.database.transaction(() => {
      const existing = this.readReceiptRow(delivery.requestId)
      if (existing) {
        assertFingerprint(
          existing.idempotency_fingerprint,
          delivery.idempotencyFingerprint
        )
        return {
          id: existing.id,
          receipt: parseReceipt(existing.receipt_json)
        }
      }
      const operation = this.readOperation(delivery.requestId)
      if (!operation || operation.status !== 'running') {
        throw new Error('Document delivery operation is not running')
      }
      assertFingerprint(
        operation.idempotency_fingerprint,
        delivery.idempotencyFingerprint
      )
      const receiptId = receiptIdentity(delivery.requestId)
      const receipt = delivery.receipt
      const artifact = receipt.status === 'succeeded'
        ? receipt.artifact
        : undefined
      this.database
        .prepare(
          `INSERT INTO document_delivery_receipts (
            id, request_id, idempotency_fingerprint, operation, status,
            scope_root, requirement_id, node_run_id, artifact_path, artifact_format,
            artifact_checksum, artifact_byte_size, artifact_page_count,
            verified, error_code, message, completed_at, receipt_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          receiptId,
          delivery.requestId,
          delivery.idempotencyFingerprint,
          delivery.input.kind,
          receipt.status,
          operation.scope_root,
          operation.requirement_id,
          operation.node_run_id,
          artifact?.path ?? null,
          artifact?.format ?? null,
          artifact?.checksum ?? null,
          artifact?.byteSize ?? null,
          artifact?.pageCount ?? null,
          artifact?.verified === true ? 1 : 0,
          receipt.status === 'failed' ? receipt.errorCode : null,
          receipt.status === 'failed' ? receipt.message : null,
          receipt.completedAt,
          JSON.stringify(receipt)
        )
      this.database
        .prepare(
          'DELETE FROM document_delivery_operations WHERE request_id = ?'
        )
        .run(delivery.requestId)
      return { id: receiptId, receipt }
    })()
  }

  async listPending(): Promise<PendingDocumentDelivery[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM document_delivery_operations
           ORDER BY requested_at, request_id`
        )
        .all() as OperationRow[]
    ).map(mapOperation)
  }

  async getReceipt(requestId: string): Promise<
    | { id: string; receipt: DocumentDeliveryReceipt }
    | undefined
  > {
    const row = this.readReceiptRow(requestId)
    return row
      ? { id: row.id, receipt: parseReceipt(row.receipt_json) }
      : undefined
  }

  async listUnregisteredVerified(): Promise<
    Array<{
      receiptId: string
      receipt: Extract<DocumentDeliveryReceipt, { status: 'succeeded' }>
      requirementId: string
      nodeRunId: string
    }>
  > {
    const rows = this.database
      .prepare(
        `SELECT
          receipts.id, receipts.receipt_json, receipts.requirement_id,
          receipts.node_run_id
         FROM document_delivery_receipts receipts
         LEFT JOIN artifacts
           ON artifacts.verification_receipt_id = receipts.id
         WHERE receipts.status = 'succeeded'
           AND receipts.operation = 'verify'
           AND receipts.verified = 1
           AND receipts.requirement_id IS NOT NULL
           AND receipts.node_run_id IS NOT NULL
           AND artifacts.id IS NULL
         ORDER BY receipts.completed_at, receipts.id`
      )
      .all() as Array<{
      id: string
      receipt_json: string
      requirement_id: string
      node_run_id: string
    }>
    return rows.map((row) => ({
      receiptId: row.id,
      receipt: parseReceipt(row.receipt_json) as Extract<
        DocumentDeliveryReceipt,
        { status: 'succeeded' }
      >,
      requirementId: row.requirement_id,
      nodeRunId: row.node_run_id
    }))
  }

  private readOperation(requestId: string): OperationRow | undefined {
    return this.database
      .prepare(
        `SELECT * FROM document_delivery_operations WHERE request_id = ?`
      )
      .get(requestId) as OperationRow | undefined
  }

  private readReceiptRow(requestId: string): ReceiptRow | undefined {
    return this.database
      .prepare(
        `SELECT id, idempotency_fingerprint, scope_root, requirement_id,
           node_run_id, receipt_json
         FROM document_delivery_receipts WHERE request_id = ?`
      )
      .get(requestId) as ReceiptRow | undefined
  }
}

function mapOperation(row: OperationRow): PendingDocumentDelivery {
  const requested = createDocumentDelivery({
    requestId: row.request_id,
    input: JSON.parse(row.input_json),
    requestedAt: row.requested_at
  })
  assertFingerprint(
    row.idempotency_fingerprint,
    requested.idempotencyFingerprint
  )
  return {
    delivery:
      row.status === 'running'
        ? startDocumentDelivery(requested, row.started_at!)
        : requested,
    scopeRoot: row.scope_root,
    ...(row.requirement_id ? { requirementId: row.requirement_id } : {}),
    ...(row.node_run_id ? { nodeRunId: row.node_run_id } : {})
  }
}

function parseReceipt(value: string): DocumentDeliveryReceipt {
  return JSON.parse(value) as DocumentDeliveryReceipt
}

function assertFingerprint(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error('Document delivery idempotency conflict')
  }
}

function assertContext(
  actual: {
    scope_root: string
    requirement_id: string | null
    node_run_id: string | null
  },
  expected: {
    scopeRoot: string
    requirementId?: string
    nodeRunId?: string
  }
): void {
  if (
    actual.scope_root !== expected.scopeRoot ||
    actual.requirement_id !== (expected.requirementId ?? null) ||
    actual.node_run_id !== (expected.nodeRunId ?? null)
  ) {
    throw new Error('Document delivery idempotency conflict')
  }
}

function receiptIdentity(requestId: string): string {
  return `document-delivery-receipt:${requestId}`
}
