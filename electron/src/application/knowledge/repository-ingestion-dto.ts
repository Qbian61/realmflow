import type { KnowledgeSource } from '../../../../domain/knowledge-source'
import type {
  RepositorySnapshot,
  RepositorySource
} from '../../../../domain/repository-source'
import type {
  RepositorySnapshotDto,
  RepositorySnapshotViewDto,
  RepositorySyncResultDto
} from '../../../../shared/business'

type RepositorySnapshotView = {
  repository: RepositorySource
  snapshot?: RepositorySnapshot
}

export function toRepositorySnapshotViewDto(
  view: RepositorySnapshotView
): RepositorySnapshotViewDto {
  const { repository, snapshot } = view
  return {
    repository: {
      sourceId: repository.sourceId,
      workspaceId: repository.workspaceId,
      mode: repository.mode,
      locator: repository.locator,
      ...(repository.selectedBranch !== undefined
        ? { selectedBranch: repository.selectedBranch }
        : {}),
      currentVersion: repository.currentVersion,
      ...(repository.revisionLabel !== undefined
        ? { revisionLabel: repository.revisionLabel }
        : {}),
      fileCount: repository.fileCount,
      totalBytes: repository.totalBytes,
      ...(repository.lastScannedAt !== undefined
        ? { lastScannedAt: repository.lastScannedAt }
        : {}),
      createdAt: repository.createdAt,
      updatedAt: repository.updatedAt
    },
    ...(snapshot ? { snapshot: toSnapshotDto(snapshot) } : {})
  }
}

export function toRepositorySyncResultDto(
  source: KnowledgeSource,
  view: RepositorySnapshotView
): RepositorySyncResultDto {
  return { source, ...toRepositorySnapshotViewDto(view) }
}

function toSnapshotDto(snapshot: RepositorySnapshot): RepositorySnapshotDto {
  return {
    id: snapshot.id,
    sourceId: snapshot.sourceId,
    version: snapshot.version,
    ...(snapshot.branch !== undefined ? { branch: snapshot.branch } : {}),
    revisionLabel: snapshot.revisionLabel,
    manifestChecksum: snapshot.manifestChecksum,
    fileCount: snapshot.fileCount,
    totalBytes: snapshot.totalBytes,
    files: snapshot.files.map(
      ({ relativePath, contentChecksum, byteSize }) => ({
        relativePath,
        contentChecksum,
        byteSize
      })
    ),
    scannedAt: snapshot.scannedAt
  }
}
