import {
  createWorkspaceKnowledgePoint,
  type WorkspaceKnowledgePoint,
  type WorkspaceKnowledgePointPayload
} from '../../../domain/knowledge-index-generation'
import type { CatalogKnowledgePoint } from '../../../domain/catalog-knowledge'
import {
  QdrantClientError,
  type QdrantClientPort,
  type QdrantRequest
} from './qdrant-client'
import { buildWorkspaceTenantFilter } from './qdrant-workspace-filter'

export type ExpectedQdrantPoint = Readonly<{
  id: string
  chunkId: string
  checksum: string
}>

const MAX_UPSERT_POINTS = 128
const MAX_UPSERT_BODY_BYTES = 2 * 1024 * 1024
const SCROLL_PAGE_SIZE = 256
type QdrantIndexPoint = WorkspaceKnowledgePoint | CatalogKnowledgePoint

export class QdrantKnowledgeIndexAdapter {
  constructor(private readonly client: QdrantClientPort) {}

  async upsertPoints(
    collection: string,
    points: readonly QdrantIndexPoint[],
    signal?: AbortSignal
  ): Promise<void> {
    for (const batch of batchPoints(points)) {
      const request: QdrantRequest = {
        method: 'PUT',
        path: `${collectionPath(collection)}/points?wait=true`,
        body: { points: batch },
        ...(signal ? { signal } : {})
      }
      let response
      try {
        response = await this.client.request(request)
      } catch (error) {
        if (
          !(error instanceof QdrantClientError) ||
          error.code !== 'QDRANT_UNAVAILABLE' ||
          signal?.aborted
        ) {
          throw error
        }
        response = await this.client.request(request)
      }
      assertMutationSucceeded(response)
    }
  }

  async readGenerationPoints(input: {
    collection: string
    workspaceId: string
    generationId: string
    signal?: AbortSignal
  }): Promise<WorkspaceKnowledgePoint[]> {
    const points: WorkspaceKnowledgePoint[] = []
    const pointIds = new Set<string>()
    const seenOffsets = new Set<string>()
    let offset: string | number | null | undefined

    do {
      const response = await this.client.request({
        method: 'POST',
        path: `${collectionPath(input.collection)}/points/scroll`,
        body: {
          filter: buildWorkspaceTenantFilter({
            workspaceIds: [input.workspaceId],
            conditions: [generationCondition(input.generationId)]
          }),
          limit: SCROLL_PAGE_SIZE,
          with_payload: true,
          with_vector: true,
          ...(offset === undefined ? {} : { offset })
        },
        ...(input.signal ? { signal: input.signal } : {})
      })
      const page = parseGenerationScrollPage(response)
      for (const stored of page.points) {
        const point = parseGenerationPoint(
          stored,
          input.workspaceId,
          input.generationId
        )
        if (pointIds.has(point.id)) throw invalidGenerationPoints()
        pointIds.add(point.id)
        points.push(point)
      }
      offset = page.nextOffset
      if (offset !== null && offset !== undefined) {
        const serialized = JSON.stringify(offset)
        if (seenOffsets.has(serialized)) throw invalidGenerationPoints()
        seenOffsets.add(serialized)
      }
    } while (offset !== null && offset !== undefined)

    return points
  }

  async verifyGeneration(input: {
    collection: string
    workspaceId: string
    generationId: string
    points: readonly ExpectedQdrantPoint[]
    signal?: AbortSignal
  }): Promise<void> {
    const expected = new Map(
      input.points.map((point) => [
        point.id,
        { chunkId: point.chunkId, checksum: point.checksum }
      ])
    )
    if (expected.size !== input.points.length) throw incompleteGeneration()
    const seenOffsets = new Set<string>()
    let offset: string | number | null | undefined

    do {
      const response = await this.client.request({
        method: 'POST',
        path: `${collectionPath(input.collection)}/points/scroll`,
        body: {
          filter: buildWorkspaceTenantFilter({
            workspaceIds: [input.workspaceId],
            conditions: [generationCondition(input.generationId)]
          }),
          limit: SCROLL_PAGE_SIZE,
          with_payload: true,
          with_vector: false,
          ...(offset === undefined ? {} : { offset })
        },
        ...(input.signal ? { signal: input.signal } : {})
      })
      const page = parseScrollPage(response)
      for (const point of page.points) {
        const id = String(point.id)
        const expectedPoint = expected.get(id)
        if (
          !expectedPoint ||
          !isRecord(point.payload) ||
          point.payload.workspaceId !== input.workspaceId ||
          point.payload.generationId !== input.generationId ||
          point.payload.chunkId !== expectedPoint.chunkId ||
          point.payload.checksum !== expectedPoint.checksum
        ) {
          throw incompleteGeneration()
        }
        expected.delete(id)
      }
      offset = page.nextOffset
      if (offset !== null && offset !== undefined) {
        const serialized = JSON.stringify(offset)
        if (seenOffsets.has(serialized)) throw invalidResponse()
        seenOffsets.add(serialized)
      }
    } while (offset !== null && offset !== undefined)

    if (expected.size !== 0) throw incompleteGeneration()
  }

  async deleteGeneration(input: {
    collection: string
    workspaceId: string
    generationId: string
    signal?: AbortSignal
  }): Promise<void> {
    const response = await this.client.request({
      method: 'POST',
      path: `${collectionPath(input.collection)}/points/delete?wait=true`,
      body: {
        filter: buildWorkspaceTenantFilter({
          workspaceIds: [input.workspaceId],
          conditions: [generationCondition(input.generationId)]
        })
      },
      ...(input.signal ? { signal: input.signal } : {})
    })
    assertMutationSucceeded(response)
  }

  async deleteWorkspace(input: {
    collection: string
    workspaceId: string
    signal?: AbortSignal
  }): Promise<void> {
    const response = await this.client.request({
      method: 'POST',
      path: `${collectionPath(input.collection)}/points/delete?wait=true`,
      body: {
        filter: buildWorkspaceTenantFilter({
          workspaceIds: [input.workspaceId]
        })
      },
      ...(input.signal ? { signal: input.signal } : {})
    })
    assertMutationSucceeded(response)
  }

  async listGenerationIds(input: {
    collection: string
    workspaceIds: readonly string[]
    signal?: AbortSignal
  }): Promise<string[]> {
    const generationIds = new Set<string>()
    const seenOffsets = new Set<string>()
    let offset: string | number | null | undefined

    do {
      const response = await this.client.request({
        method: 'POST',
        path: `${collectionPath(input.collection)}/points/scroll`,
        body: {
          filter: buildWorkspaceTenantFilter({
            workspaceIds: input.workspaceIds,
            useAnyMatch: true
          }),
          limit: SCROLL_PAGE_SIZE,
          with_payload: ['generationId'],
          with_vector: false,
          ...(offset === undefined ? {} : { offset })
        },
        ...(input.signal ? { signal: input.signal } : {})
      })
      const page = parseScrollPage(response)
      for (const point of page.points) {
        if (
          !isRecord(point.payload) ||
          typeof point.payload.generationId !== 'string' ||
          point.payload.generationId.length === 0
        ) {
          throw invalidResponse()
        }
        generationIds.add(point.payload.generationId)
      }
      offset = page.nextOffset
      if (offset !== null && offset !== undefined) {
        const serialized = JSON.stringify(offset)
        if (seenOffsets.has(serialized)) throw invalidResponse()
        seenOffsets.add(serialized)
      }
    } while (offset !== null && offset !== undefined)

    return [...generationIds].sort()
  }

  async deleteGenerations(input: {
    collection: string
    workspaceIds: readonly string[]
    generationIds: readonly string[]
    signal?: AbortSignal
  }): Promise<void> {
    if (
      input.generationIds.length === 0 ||
      new Set(input.generationIds).size !== input.generationIds.length ||
      input.generationIds.some((id) => id.length === 0)
    ) {
      throw new Error('Qdrant generation ids are invalid')
    }
    const response = await this.client.request({
      method: 'POST',
      path: `${collectionPath(input.collection)}/points/delete?wait=true`,
      body: {
        filter: buildWorkspaceTenantFilter({
          workspaceIds: input.workspaceIds,
          useAnyMatch: true,
          conditions: [
            {
              key: 'generationId',
              match: { any: [...input.generationIds] }
            }
          ]
        })
      },
      ...(input.signal ? { signal: input.signal } : {})
    })
    assertMutationSucceeded(response)
  }

  async deletePoints(
    collection: string,
    pointIds: readonly string[],
    signal?: AbortSignal
  ): Promise<void> {
    if (
      pointIds.length === 0 ||
      new Set(pointIds).size !== pointIds.length ||
      pointIds.some((id) => !id)
    ) {
      throw new Error('Qdrant point ids are invalid')
    }
    const response = await this.client.request({
      method: 'POST',
      path: `${collectionPath(collection)}/points/delete?wait=true`,
      body: { points: [...pointIds] },
      ...(signal ? { signal } : {})
    })
    assertMutationSucceeded(response)
  }
}

function parseGenerationScrollPage(value: unknown): {
  points: Array<Record<string, unknown>>
  nextOffset: string | number | null
} {
  if (
    !isRecord(value) ||
    value.status !== 'ok' ||
    !isRecord(value.result) ||
    !Array.isArray(value.result.points) ||
    !value.result.points.every(isRecord) ||
    !(
      value.result.next_page_offset === null ||
      typeof value.result.next_page_offset === 'string' ||
      typeof value.result.next_page_offset === 'number'
    )
  ) {
    throw invalidGenerationPoints()
  }
  return {
    points: value.result.points,
    nextOffset: value.result.next_page_offset
  }
}

function parseGenerationPoint(
  value: Record<string, unknown>,
  workspaceId: string,
  generationId: string
): WorkspaceKnowledgePoint {
  if (
    typeof value.id !== 'string' ||
    !isRecord(value.payload) ||
    value.payload.workspaceId !== workspaceId ||
    value.payload.generationId !== generationId ||
    !isRecord(value.vector) ||
    !Array.isArray(value.vector.dense)
  ) {
    throw invalidGenerationPoints()
  }
  try {
    return createWorkspaceKnowledgePoint({
      id: value.id,
      dense: value.vector.dense as number[],
      payload: value.payload as WorkspaceKnowledgePointPayload
    })
  } catch {
    throw invalidGenerationPoints()
  }
}

function batchPoints(
  points: readonly QdrantIndexPoint[]
): QdrantIndexPoint[][] {
  const batches: QdrantIndexPoint[][] = []
  let batch: QdrantIndexPoint[] = []
  const emptyBodyBytes = jsonBytes({ points: [] })
  let batchBytes = emptyBodyBytes

  for (const point of points) {
    const pointBytes = jsonBytes(point)
    const candidateBytes = batchBytes + pointBytes + (batch.length > 0 ? 1 : 0)
    if (
      batch.length > 0 &&
      (batch.length >= MAX_UPSERT_POINTS ||
        candidateBytes > MAX_UPSERT_BODY_BYTES)
    ) {
      batches.push(batch)
      batch = [point]
      batchBytes = emptyBodyBytes + pointBytes
    } else {
      batch.push(point)
      batchBytes = candidateBytes
    }
    if (batchBytes > MAX_UPSERT_BODY_BYTES) {
      throw new Error('Qdrant point batch exceeds the payload limit')
    }
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

function parseScrollPage(value: unknown): {
  points: Array<{ id: string | number; payload: unknown }>
  nextOffset: string | number | null
} {
  if (
    !isRecord(value) ||
    value.status !== 'ok' ||
    !isRecord(value.result) ||
    !Array.isArray(value.result.points) ||
    !value.result.points.every(
      (point) =>
        isRecord(point) &&
        (typeof point.id === 'string' || typeof point.id === 'number') &&
        isRecord(point.payload)
    ) ||
    !(
      value.result.next_page_offset === null ||
      typeof value.result.next_page_offset === 'string' ||
      typeof value.result.next_page_offset === 'number'
    )
  ) {
    throw invalidResponse()
  }
  return {
    points: value.result.points as Array<{
      id: string | number
      payload: unknown
    }>,
    nextOffset: value.result.next_page_offset
  }
}

function assertMutationSucceeded(value: unknown): void {
  if (
    !isRecord(value) ||
    value.status !== 'ok' ||
    !(
      value.result === true ||
      (isRecord(value.result) &&
        Number.isSafeInteger(value.result.operation_id) &&
        value.result.status === 'completed')
    )
  ) {
    throw invalidResponse()
  }
}

function generationCondition(generationId: string) {
  return {
    key: 'generationId',
    match: { value: generationId }
  }
}

function collectionPath(collection: string): string {
  return `/collections/${encodeURIComponent(collection)}`
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidResponse(): Error {
  return new Error('Qdrant returned an invalid index response')
}

function incompleteGeneration(): Error {
  return new Error('Qdrant staging generation is incomplete')
}

function invalidGenerationPoints(): Error {
  return new Error('Qdrant generation points are invalid')
}
