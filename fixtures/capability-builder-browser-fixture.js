const empty = async () => []
const noop = async () => undefined
const subscribe = () => () => undefined
const catalog = { definitions: [], installations: [] }
let sequence = 0

const definitionFor = (spec) => ({
  schemaVersion: 1,
  id: spec.id,
  kind: spec.kind,
  version: spec.version,
  source: 'generated',
  manifestDigest: 'a'.repeat(64),
  definitionDigest: 'b'.repeat(64),
  name: spec.name,
  description: spec.description,
  runtime:
    spec.runtime.kind === 'connector'
      ? {
          kind: 'connector',
          connectorKind: 'http',
          credentialRefs: spec.runtime.credentialRefs,
          configurationSchema: { type: 'object' },
          actions: [{ id: 'invoke' }]
        }
      : spec.runtime.kind === 'skill'
        ? {
            kind: 'skill',
            instructionsPath: 'SKILL.md',
            executable: false
          }
        : {
            kind: 'agent',
            promptPath: 'PROMPT.md',
            modelCapabilities: ['tool_calling'],
            reasoningModes: ['medium'],
            delegation: { allowed: false, maximumDepth: 0 }
          },
  permissions: spec.permissions,
  dependencies: [],
  compatibility: spec.compatibility,
  testPlan: [{ id: 'contract', command: 'fixture:contract' }],
  publishedAt: 100
})

const sessionFor = (command) => {
  sequence += 1
  const definition = definitionFor(command.spec)
  const failed = command.request.includes('FAIL')
  const session = {
    id: `generation-${sequence}`,
    conversationId: command.conversationId,
    requestedBy: command.requestedBy,
    request: command.request,
    spec: { ...command.spec, specDigest: 'd'.repeat(64) },
    status: failed ? 'draft' : 'awaiting_approval',
    revision: 3,
    ...(failed
      ? { diagnostics: ['Capability package test failed: contract'] }
      : {
          proposal: {
            id: `proposal-${sequence}`,
            packageDigest: 'c'.repeat(64),
            definitionDigest: definition.definitionDigest,
            scope: command.spec.scope,
            draftRevision: 1,
            definition,
            validationReport: {
              compatible: true,
              dependencyStatus: 'resolved',
              tests: [{ id: 'contract', status: 'passed' }]
            },
            fileNames:
              command.spec.kind === 'connector'
                ? ['README.md', 'capability.yaml']
                : command.spec.kind === 'skill'
                  ? ['README.md', 'SKILL.md', 'capability.yaml']
                  : ['PROMPT.md', 'README.md', 'capability.yaml'],
            byteSize: 256,
            fileCount: command.spec.kind === 'connector' ? 2 : 3,
            validatedAt: 120
          }
        }),
    createdAt: 100,
    updatedAt: 120
  }
  window.__lastBuilderDefinition = session.proposal?.definition
  return session
}

window.__fixtureCatalog = catalog
window.realmflow = {
  platform: 'darwin',
  getSidecarStatus: async () => 'ready',
  quitApp: noop,
  business: new Proxy(
    {
      listConnectors: empty,
      listRecentConversations: async () => ({
        conversations: [],
        folderPaths: []
      }),
      onConversationEvent: subscribe
    },
    {
      get: (target, property) => target[property] ?? empty
    }
  ),
  workbenchHub: new Proxy(
    {
      dashboard: new Proxy({}, { get: () => empty })
    },
    {
      get: (target, property) =>
        target[property] ?? new Proxy({}, { get: () => empty })
    }
  ),
  aiRuns: new Proxy(
    { onEvent: subscribe },
    { get: (target, property) => target[property] ?? noop }
  ),
  persistence: {
    load: async () => ({
      status: 'loaded',
      snapshot: { revision: 0, value: null }
    }),
    onChanged: subscribe
  },
  workspace: new Proxy({}, { get: () => empty }),
  webWorkbench: new Proxy(
    { hideAll: noop, onStateChange: subscribe },
    { get: (target, property) => target[property] ?? noop }
  ),
  terminal: new Proxy(
    { onEvent: subscribe },
    { get: (target, property) => target[property] ?? noop }
  ),
  nativeOverlay: new Proxy(
    { onEvent: subscribe },
    { get: (target, property) => target[property] ?? noop }
  ),
  toolCatalog: {
    list: async () => ({ packages: [], tools: [], skills: [] }),
    listMcpServers: empty
  },
  capabilityCatalog: {
    list: async () => structuredClone(catalog)
  },
  capabilityBuilder: {
    createDraft: async (command) => sessionFor(command),
    getSession: async () => undefined,
    reviseDraft: async (command) =>
      sessionFor({
        conversationId: 'capability-studio',
        requestedBy: 'local-user',
        request: command.request,
        spec: command.spec
      }),
    confirmInstall: async (command) => {
      const definition = window.__lastBuilderDefinition
      const installation = {
        id: `installation-${definition.id}`,
        capabilityId: definition.id,
        capabilityVersion: definition.version,
        capabilityDigest: definition.definitionDigest,
        scope: command.scope,
        enabled: command.enable,
        permissionCeiling: definition.permissions,
        status: command.enable ? 'enabled' : 'installed_disabled',
        revision: 1,
        installedAt: 200,
        updatedAt: 200
      }
      catalog.definitions = [definition]
      catalog.installations = [installation]
      return { definition, installation }
    },
    cancel: async ({ sessionId, expectedRevision }) => ({
      id: sessionId,
      status: 'cancelled',
      revision: expectedRevision + 1
    })
  }
}
