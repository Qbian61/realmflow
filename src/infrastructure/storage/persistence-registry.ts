export const PERSISTENCE_SCHEMA_VERSION = 1

export const PERSISTENCE_DATASETS = {
  workspaceNavigation: {
    key: 'realmflow:workspace-navigation:v1',
    version: 1,
    legacyKeys: []
  },
  chatSessions: {
    key: 'realmflow:chat-sessions:v4',
    version: 4,
    legacyKeys: [
      'realmflow:chat-sessions:v3',
      'realmflow:chat-sessions:v2',
      'realmflow:chat-sessions:v1'
    ]
  },
  spaceResources: {
    key: 'realmflow:space-resources:v1',
    version: 1,
    legacyKeys: []
  }
} as const

export type PersistenceDataset = keyof typeof PERSISTENCE_DATASETS
