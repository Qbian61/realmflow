import { describe, expect, it } from 'vitest'
import {
  createKnowledgeSource,
  transitionKnowledgeSource,
  type KnowledgeSource
} from './knowledge-source'

function source(
  status: KnowledgeSource['status'] = 'registered'
): KnowledgeSource {
  return {
    id: 'source-1',
    workspaceId: 'space-1',
    name: 'Architecture',
    type: 'document',
    locator: 'https://example.com/architecture',
    detail: 'example.com',
    sortOrder: 0,
    status,
    revision: 1,
    createdAt: 10,
    updatedAt: 10
  }
}

describe('knowledge source lifecycle', () => {
  it('registers a normalized source without claiming it is indexed', () => {
    expect(
      createKnowledgeSource({
        id: 'source-1',
        workspaceId: 'space-1',
        name: '  Architecture  ',
        type: 'document',
        locator: '  https://example.com/architecture  ',
        detail: '  example.com  ',
        sortOrder: 0,
        at: 10
      })
    ).toEqual(source())
  })

  it('starts synchronization and clears an earlier failure', () => {
    expect(
      transitionKnowledgeSource(
        {
          ...source('failed'),
          errorCode: 'source_unavailable',
          errorMessage: '无法读取知识源'
        },
        { operation: 'retry_sync', at: 20 }
      )
    ).toMatchObject({
      status: 'syncing',
      syncStartedAt: 20,
      updatedAt: 20,
      errorCode: undefined,
      errorMessage: undefined
    })
  })

  it('records a completed index timestamp', () => {
    expect(
      transitionKnowledgeSource(source('syncing'), {
        operation: 'complete_index',
        at: 30
      })
    ).toMatchObject({
      status: 'indexed',
      indexedAt: 30,
      updatedAt: 30
    })
  })

  it('marks only indexed sources stale', () => {
    expect(
      transitionKnowledgeSource(source('indexed'), {
        operation: 'mark_stale',
        at: 40
      }).status
    ).toBe('stale')
    expect(() =>
      transitionKnowledgeSource(source('registered'), {
        operation: 'mark_stale',
        at: 40
      })
    ).toThrow('Invalid knowledge source transition')
  })

  it('requires a stable safe error when synchronization fails', () => {
    expect(() =>
      transitionKnowledgeSource(source('syncing'), {
        operation: 'fail_sync',
        at: 50
      })
    ).toThrow('Knowledge source failure requires an error code')

    expect(
      transitionKnowledgeSource(source('syncing'), {
        operation: 'fail_sync',
        at: 50,
        errorCode: 'source_unavailable'
      })
    ).toMatchObject({
      status: 'failed',
      errorCode: 'source_unavailable',
      errorMessage: '无法读取知识源'
    })
  })

  it('retries failed and stale sources but not registered sources', () => {
    expect(
      transitionKnowledgeSource(source('failed'), {
        operation: 'retry_sync',
        at: 60
      }).status
    ).toBe('syncing')
    expect(
      transitionKnowledgeSource(source('stale'), {
        operation: 'retry_sync',
        at: 60
      }).status
    ).toBe('syncing')
    expect(() =>
      transitionKnowledgeSource(source('registered'), {
        operation: 'retry_sync',
        at: 60
      })
    ).toThrow('Invalid knowledge source transition')
  })

  it('allows active sources to be removed and makes removal terminal', () => {
    const removed = transitionKnowledgeSource(source('indexed'), {
      operation: 'remove',
      at: 70
    })
    expect(removed.status).toBe('removed')
    expect(() =>
      transitionKnowledgeSource(removed, {
        operation: 'start_sync',
        at: 80
      })
    ).toThrow('Invalid knowledge source transition')
  })

  it('recovers interrupted synchronization as a safe failure', () => {
    expect(
      transitionKnowledgeSource(source('syncing'), {
        operation: 'interrupt',
        at: 90
      })
    ).toMatchObject({
      status: 'failed',
      errorCode: 'interrupted',
      errorMessage: '上次同步因应用中断而停止'
    })
  })
})
