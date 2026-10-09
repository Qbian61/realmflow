import type { BackupOperation } from '../../../../domain/backup'

export interface BackupOperationRepository {
  getByRequestId(requestId: string): Promise<BackupOperation | undefined>
  getLatestByKind(
    kind: BackupOperation['kind']
  ): Promise<BackupOperation | undefined>
  saveFinal(operation: BackupOperation): Promise<'saved' | 'unchanged'>
}

export type BackupSnapshotResult = {
  schemaVersion: number
}

export interface BackupSnapshot {
  create(destinationPath: string): Promise<BackupSnapshotResult>
}
