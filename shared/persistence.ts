export const PERSISTENCE_DATASETS = [
  'workspaceNavigation',
  'chatSessions',
  'spaceResources'
] as const

export type PersistenceDataset = (typeof PERSISTENCE_DATASETS)[number]

export type PersistenceSnapshot = {
  revision: number
  value: unknown
}

export type PersistenceLoadResult =
  | {
      status: 'loaded'
      snapshot: PersistenceSnapshot
    }
  | {
      status: 'unavailable'
    }

export type PersistenceSaveResult =
  | {
      status: 'saved' | 'conflict'
      snapshot: PersistenceSnapshot
    }
  | {
      status: 'unavailable'
    }

export type PersistenceChangedEvent = {
  dataset: PersistenceDataset
  revision: number
}

export interface PersistenceApi {
  load: (dataset: PersistenceDataset) => Promise<PersistenceLoadResult>
  save: (
    dataset: PersistenceDataset,
    value: unknown,
    expectedRevision: number
  ) => Promise<PersistenceSaveResult>
  onChanged: (
    listener: (event: PersistenceChangedEvent) => void
  ) => () => void
}

export type LegacyPersistenceReadApi = Pick<
  PersistenceApi,
  'load' | 'onChanged'
>
