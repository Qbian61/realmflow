import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeSource } from '../../../../domain/knowledge-source'
import { runLocalFileIngestionWithIndexDispatch } from './local-file-index-dispatch'

describe('runLocalFileIngestionWithIndexDispatch', () => {
  it('enqueues each registered local file and schedules the index worker once', async () => {
    const sources: KnowledgeSource[] = [
      source('file-1', 'First'),
      source('file-2', 'Second')
    ]
    const ingest = vi.fn().mockResolvedValue(sources)
    const enqueue = vi.fn().mockResolvedValue({ status: 'enqueued' })
    const scheduleDrain = vi.fn()

    await expect(
      runLocalFileIngestionWithIndexDispatch({
        ingest,
        enqueue,
        scheduleDrain
      })
    ).resolves.toBe(sources)

    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue).toHaveBeenNthCalledWith(1, {
      sourceId: 'file-1',
      triggerSource: 'source_event'
    })
    expect(enqueue).toHaveBeenNthCalledWith(2, {
      sourceId: 'file-2',
      triggerSource: 'source_event'
    })
    expect(scheduleDrain).toHaveBeenCalledOnce()
  })

  it('does not schedule the index worker when no files were registered', async () => {
    const enqueue = vi.fn()
    const scheduleDrain = vi.fn()

    await expect(
      runLocalFileIngestionWithIndexDispatch({
        ingest: vi.fn().mockResolvedValue([]),
        enqueue,
        scheduleDrain
      })
    ).resolves.toEqual([])

    expect(enqueue).not.toHaveBeenCalled()
    expect(scheduleDrain).not.toHaveBeenCalled()
  })
})

function source(id: string, name: string): KnowledgeSource {
  return {
    id,
    workspaceId: 'space-1',
    name,
    type: 'file',
    locator: `external:${id}`,
    detail: '外部引用',
    sortOrder: 0,
    status: 'registered',
    revision: 1,
    createdAt: 10,
    updatedAt: 10
  }
}
