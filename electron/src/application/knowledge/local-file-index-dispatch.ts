import type { KnowledgeSource } from '../../../../domain/knowledge-source'

type LocalFileIndexDispatchDependencies = {
  ingest: () => Promise<KnowledgeSource[]>
  enqueue: (input: {
    sourceId: string
    triggerSource: 'source_event'
  }) => Promise<unknown>
  scheduleDrain: () => void
}

export async function runLocalFileIngestionWithIndexDispatch({
  ingest,
  enqueue,
  scheduleDrain
}: LocalFileIndexDispatchDependencies): Promise<KnowledgeSource[]> {
  const sources = await ingest()
  let queued = false
  for (const source of sources) {
    await enqueue({
      sourceId: source.id,
      triggerSource: 'source_event'
    })
    queued = true
  }
  if (queued) scheduleDrain()
  return sources
}
