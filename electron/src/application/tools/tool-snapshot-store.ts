import type { ToolEventStreamType } from '../../../../domain/tool-domain-event'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export type ToolSnapshot = {
  streamId: string
  streamType: ToolEventStreamType
  sequence: number
  state: JsonObject
  createdAt: number
}

export interface ToolSnapshotStore {
  save(input: {
    streamId: string
    streamType: ToolEventStreamType
    sequence: number
    state: JsonObject
    at: number
  }): Promise<void>
  load(streamId: string): Promise<ToolSnapshot | undefined>
  delete(streamId: string): Promise<void>
}
