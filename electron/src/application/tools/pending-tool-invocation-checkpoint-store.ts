import {
  cloneJsonObject,
  type JsonObject
} from '../../../../domain/tool-protocol-validation'
import type { EncryptedCredential } from '../../models/credential-vault'
import type { ToolSnapshotStore } from './tool-snapshot-store'

const STREAM_PREFIX = 'pending-tool-invocation.'

export type PendingToolInvocationCheckpointV1 = {
  schemaVersion: 1
  executionId: string
  runtime: JsonObject
  savedAt: number
}

type CheckpointVault = {
  encrypt(value: string): EncryptedCredential
  decrypt(value: EncryptedCredential): string
}

export interface PendingToolInvocationCheckpointStore {
  save(checkpoint: PendingToolInvocationCheckpointV1): Promise<void>
  load(
    executionId: string
  ): Promise<PendingToolInvocationCheckpointV1 | undefined>
  delete(executionId: string): Promise<void>
}

export class EncryptedPendingToolInvocationCheckpointStore
  implements PendingToolInvocationCheckpointStore
{
  constructor(
    private readonly dependencies: {
      snapshots: ToolSnapshotStore
      vault: CheckpointVault
    }
  ) {}

  async save(checkpoint: PendingToolInvocationCheckpointV1): Promise<void> {
    const encrypted = this.dependencies.vault.encrypt(
      JSON.stringify(checkpoint)
    )
    await this.dependencies.snapshots.save({
      streamId: streamId(checkpoint.executionId),
      streamType: 'tool_execution',
      sequence: 1,
      state: {
        schemaVersion: 1,
        kind: 'encrypted_pending_tool_invocation',
        encryptedValue: toBase64(encrypted.encryptedValue),
        nonce: toBase64(encrypted.nonce),
        authTag: toBase64(encrypted.authTag),
        keyVersion: encrypted.keyVersion
      },
      at: checkpoint.savedAt
    })
  }

  async load(
    executionId: string
  ): Promise<PendingToolInvocationCheckpointV1 | undefined> {
    const snapshot = await this.dependencies.snapshots.load(
      streamId(executionId)
    )
    if (!snapshot) return undefined
    const envelope = snapshot.state
    if (
      envelope.schemaVersion !== 1 ||
      envelope.kind !== 'encrypted_pending_tool_invocation' ||
      typeof envelope.encryptedValue !== 'string' ||
      typeof envelope.nonce !== 'string' ||
      typeof envelope.authTag !== 'string' ||
      !Number.isInteger(envelope.keyVersion)
    ) {
      return undefined
    }
    try {
      const decoded = JSON.parse(
        this.dependencies.vault.decrypt({
          encryptedValue: fromBase64(envelope.encryptedValue),
          nonce: fromBase64(envelope.nonce),
          authTag: fromBase64(envelope.authTag),
          keyVersion: envelope.keyVersion as number
        })
      ) as PendingToolInvocationCheckpointV1
      if (
        decoded.schemaVersion !== 1 ||
        decoded.executionId !== executionId ||
        !Number.isInteger(decoded.savedAt)
      ) {
        return undefined
      }
      return {
        ...decoded,
        runtime: cloneJsonObject(decoded.runtime, 'pending Tool invocation')
      }
    } catch {
      return undefined
    }
  }

  delete(executionId: string): Promise<void> {
    return this.dependencies.snapshots.delete(streamId(executionId))
  }
}

function streamId(executionId: string): string {
  return `${STREAM_PREFIX}${executionId}`
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}
