import { reduceToolCatalogEvents } from '../../../../domain/tool-catalog'
import type { ToolDomainEvent } from '../../../../domain/tool-domain-event'
import type { ToolEventStore } from './tool-event-store'
import type { ToolProjectionStore } from './tool-projection-store'

const REBUILD_BATCH_SIZE = 500

export class ToolProjectionRunner {
  constructor(
    private readonly events: ToolEventStore,
    private readonly projections: ToolProjectionStore,
    private readonly now: () => number = Date.now
  ) {}

  async runCatalogBatch(limit: number): Promise<number> {
    void limit
    await this.rebuildCatalogProjection()
    return 0
  }

  async rebuildCatalogProjection(): Promise<void> {
    const allEvents = await this.scanAllEvents()
    await this.projections.replaceCatalogProjection({
      state: reduceToolCatalogEvents(allEvents),
      globalPosition: allEvents.at(-1)?.globalPosition ?? 0,
      at: allEvents.at(-1)?.metadata.occurredAt ?? this.now()
    })
  }

  private async scanAllEvents(
    maximumGlobalPosition = Number.MAX_SAFE_INTEGER
  ): Promise<ToolDomainEvent[]> {
    const allEvents: ToolDomainEvent[] = []
    let globalPosition = 0
    while (globalPosition < maximumGlobalPosition) {
      const batch = await this.events.scan(
        globalPosition,
        REBUILD_BATCH_SIZE
      )
      const accepted = batch.filter(
        (event) => event.globalPosition <= maximumGlobalPosition
      )
      allEvents.push(...accepted)
      if (
        batch.length === 0 ||
        batch.length < REBUILD_BATCH_SIZE ||
        accepted.length < batch.length
      ) {
        break
      }
      globalPosition = batch.at(-1)!.globalPosition
    }
    return allEvents
  }
}
