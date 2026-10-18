export const DSH_RUN_MANIFEST_SCHEMA_VERSION = 1 as const

export const DSH_RUN_MANIFEST_SCHEMA_ID =
  'realmflow.dsh-run-manifest.v1' as const

export const DSH_RUN_MANIFEST_JSON_SCHEMA = {
  $id: DSH_RUN_MANIFEST_SCHEMA_ID,
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'manifestId',
    'digest',
    'runId',
    'sessionId',
    'owner',
    'model',
    'tools',
    'skills',
    'agents',
    'mcpServers',
    'connectors',
    'context',
    'knowledge',
    'policy',
    'budget',
    'productCommands',
    'credentialReferences'
  ],
  properties: {
    schemaVersion: { const: DSH_RUN_MANIFEST_SCHEMA_VERSION },
    manifestId: { type: 'string' },
    digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    runId: { type: 'string' },
    sessionId: { type: 'string' },
    owner: { type: 'object', additionalProperties: false },
    model: { type: 'object', additionalProperties: true },
    tools: { type: 'array' },
    skills: { type: 'array' },
    agents: { type: 'array' },
    mcpServers: { type: 'array' },
    connectors: { type: 'array' },
    context: { type: 'object', additionalProperties: true },
    knowledge: { type: 'object', additionalProperties: true },
    policy: { type: 'object', additionalProperties: true },
    budget: { type: 'object', additionalProperties: true },
    productCommands: { type: 'array' },
    credentialReferences: { type: 'array' }
  }
} as const
