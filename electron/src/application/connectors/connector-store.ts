import type {
  Connector,
  ConnectorValidation
} from '../../../../domain/connector'
import type { EncryptedCredential } from '../../models/credential-vault'

export type ConnectorRecord = {
  connector: Connector
  hasCredential: boolean
}

export type StoredConnectorCredential = EncryptedCredential & {
  createdAt: number
  updatedAt: number
}

export type ConnectorReferenceCounts = {
  workflowCount: number
  requirementCount: number
  runCount: number
}

export type ConnectorEventOperation =
  | 'created'
  | 'updated'
  | 'enabled'
  | 'disabled'
  | 'validated'
  | 'deleted'

export type SaveConnectorInput = {
  connector: Connector
  expectedRevision: number
  credential?: StoredConnectorCredential | null
  eventId: string
  eventOperation: ConnectorEventOperation
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type SaveConnectorResult =
  | ({ status: 'applied' | 'replayed' } & ConnectorRecord)
  | ({ status: 'conflict' } & ConnectorRecord)
  | { status: 'idempotency_conflict' }

export type DeleteConnectorInput = {
  id: string
  expectedRevision: number
  eventId: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type DeleteConnectorResult =
  | { status: 'applied' | 'replayed'; id: string }
  | ({ status: 'conflict' } & ConnectorRecord)
  | { status: 'referenced'; references: ConnectorReferenceCounts }
  | { status: 'not_found'; id: string }
  | { status: 'idempotency_conflict' }

export interface ConnectorStore {
  list(): Promise<ConnectorRecord[]>
  get(id: string): Promise<ConnectorRecord | undefined>
  getCredential(id: string): Promise<StoredConnectorCredential | undefined>
  save(input: SaveConnectorInput): Promise<SaveConnectorResult>
  delete(input: DeleteConnectorInput): Promise<DeleteConnectorResult>
  saveValidation(input: {
    connectorId: string
    expectedRevision: number
    validation: ConnectorValidation
    eventId: string
    idempotencyKey: string
    fingerprint: string
  }): Promise<SaveConnectorResult>
}
