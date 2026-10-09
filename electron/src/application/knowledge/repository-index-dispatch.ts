import type { RepositorySyncResult } from './repository-ingestion-store'

type RepositoryIndexDispatchDependencies = {
  ingest: () => Promise<RepositorySyncResult>
  enqueue: (input: {
    sourceId: string
    triggerSource: 'source_event'
  }) => Promise<unknown>
  scheduleDrain: () => void
}

export async function runRepositoryIngestionWithIndexDispatch({
  ingest,
  enqueue,
  scheduleDrain
}: RepositoryIndexDispatchDependencies): Promise<RepositorySyncResult> {
  const result = await ingest()
  if (result.source.status !== 'indexed' || !result.snapshot) return result

  await enqueue({
    sourceId: result.source.id,
    triggerSource: 'source_event'
  })
  scheduleDrain()
  return result
}
