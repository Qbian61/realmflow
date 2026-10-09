import { describe, expect, it } from 'vitest'
import type { ToolDomainEvent } from './tool-domain-event'
import { reduceToolCatalogEvents } from './tool-catalog'

describe('Tool Catalog projection', () => {
  it('lets Package activation override children without losing preferences', () => {
    const initial = reduceToolCatalogEvents(baseEvents())
    expect(initial.tools[0]).toMatchObject({
      id: 'builtin.files.read',
      enabledPreference: true,
      status: 'enabled'
    })

    const packageDisabled = reduceToolCatalogEvents([
      ...baseEvents(),
      activationEvent(4, 'package', 'realmflow.builtin.files', false)
    ])
    expect(packageDisabled.tools[0]).toMatchObject({
      enabledPreference: true,
      status: 'disabled'
    })

    const childDisabled = reduceToolCatalogEvents([
      ...baseEvents(),
      activationEvent(4, 'tool', 'builtin.files.read', false),
      activationEvent(5, 'package', 'realmflow.builtin.files', false),
      activationEvent(6, 'package', 'realmflow.builtin.files', true)
    ])
    expect(childDisabled.tools[0]).toMatchObject({
      enabledPreference: false,
      status: 'disabled'
    })
  })

  it('marks a Skill dependency disabled when its required Tool is disabled', () => {
    const catalog = reduceToolCatalogEvents([
      ...baseEvents(),
      activationEvent(4, 'tool', 'builtin.files.read', false)
    ])

    expect(catalog.skills[0]).toMatchObject({
      id: 'builtin.skills.summarize-file',
      enabledPreference: true,
      status: 'dependency_disabled',
      dependencyIssues: ['builtin.files.read']
    })
  })

  it('keeps published definition versions immutable and deterministically ordered', () => {
    const events = baseEvents()
    const catalog = reduceToolCatalogEvents([
      events[2],
      events[0],
      events[1]
    ])

    expect(catalog.packages.map(({ packageId }) => packageId)).toEqual([
      'realmflow.builtin.files'
    ])
    expect(catalog.tools.map(({ version }) => version)).toEqual(['1.0.0'])
    expect(catalog.skills.map(({ version }) => version)).toEqual(['1.0.0'])
  })
})

function baseEvents(): ToolDomainEvent[] {
  return [
    event(1, 'extension', 'extension.package_imported', {
      packageId: 'realmflow.builtin.files',
      packageVersion: '1.0.0',
      packageDigest: 'a'.repeat(64),
      origin: 'builtin',
      name: 'Files',
      description: 'Builtin file capabilities.'
    }),
    event(2, 'definition', 'tool.definition_published', {
      definition: toolDefinition()
    }),
    event(3, 'definition', 'skill.definition_published', {
      definition: skillDefinition()
    })
  ]
}

function activationEvent(
  position: number,
  targetType: 'package' | 'tool' | 'skill',
  targetId: string,
  enabled: boolean
): ToolDomainEvent {
  return event(position, 'extension', 'extension.activation_changed', {
    targetType,
    targetId,
    enabled,
    scope: 'global'
  })
}

function event(
  globalPosition: number,
  streamType: ToolDomainEvent['streamType'],
  eventType: string,
  payload: ToolDomainEvent['payload']
): ToolDomainEvent {
  return {
    eventId: `event-${globalPosition}`,
    streamId: `${streamType}-${globalPosition}`,
    streamType,
    sequence: 1,
    globalPosition,
    eventType,
    eventSchemaVersion: 1,
    payload,
    metadata: {
      correlationId: 'correlation-1',
      causationId: 'command-1',
      commandId: 'command-1',
      actorType: 'system',
      actorId: 'realmflow',
      occurredAt: 100 + globalPosition
    },
    payloadChecksum: 'f'.repeat(64)
  }
}

function toolDefinition() {
  return {
    schemaVersion: 1,
    id: 'builtin.files.read',
    version: '1.0.0',
    definitionDigest: 'b'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.files',
      packageVersion: '1.0.0',
      packageDigest: 'a'.repeat(64)
    },
    origin: 'builtin',
    name: 'Read file',
    description: 'Read one file.',
    tags: ['file'],
    executor: {
      kind: 'builtin',
      handler: 'files.read',
      handlerVersion: '1.0.0'
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: ['filesystem.read'],
    effects: ['local_data.read'],
    risk: 'low',
    invocation: {
      mode: 'unary',
      idempotency: 'required',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 30_000,
      maxOutputBytes: 1_024,
      maxAttempts: 1
    },
    discovery: {
      intents: ['read file'],
      contexts: ['workflow', 'schedule']
    }
  }
}

function skillDefinition() {
  return {
    schemaVersion: 1,
    id: 'builtin.skills.summarize-file',
    version: '1.0.0',
    definitionDigest: 'c'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.files',
      packageVersion: '1.0.0',
      packageDigest: 'a'.repeat(64)
    },
    origin: 'builtin',
    name: 'Summarize file',
    description: 'Summarize one file.',
    instructionsPath: 'skills/summarize.md',
    runtime: { kind: 'instruction' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    requiredTools: [
      {
        toolId: 'builtin.files.read',
        versionRange: '^1.0.0',
        required: true
      }
    ],
    activation: {
      intents: ['summarize file'],
      contexts: ['workflow', 'schedule']
    },
    limits: {
      maxToolCalls: 4,
      timeoutMs: 60_000
    }
  }
}
