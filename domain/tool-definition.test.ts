import { describe, expect, it } from 'vitest'
import {
  normalizeToolDefinition,
  normalizeToolDefinitionReference
} from './tool-definition'

const definition = {
  schemaVersion: 1 as const,
  id: 'builtin.files.read',
  version: '1.0.0',
  definitionDigest: 'a'.repeat(64),
  package: {
    packageId: 'realmflow.builtin.files',
    packageVersion: '1.0.0',
    packageDigest: 'b'.repeat(64)
  },
  origin: 'builtin' as const,
  name: ' Read file ',
  description: ' Read an authorized local text file. ',
  tags: [' file ', 'read', 'file'],
  executor: {
    kind: 'builtin' as const,
    handler: ' files.read ',
    handlerVersion: '1.0.0'
  },
  inputSchema: {
    type: 'object',
    required: ['path'],
    properties: { path: { type: 'string' } }
  },
  outputSchema: {
    type: 'object',
    required: ['content'],
    properties: { content: { type: 'string' } }
  },
  capabilities: ['filesystem.read'],
  effects: ['local_data.read'],
  risk: 'low' as const,
  invocation: {
    mode: 'unary' as const,
    idempotency: 'required' as const,
    cancellable: true,
    resumable: false
  },
  resources: {
    timeoutMs: 30_000,
    maxOutputBytes: 1_048_576,
    maxAttempts: 2
  },
  discovery: {
    intents: [' read file ', 'inspect source'],
    contexts: ['general', 'space', 'requirement', 'workflow'],
    requiresExplicitSelection: false
  }
}

describe('ToolDefinition', () => {
  it('normalizes immutable Tool and Skill definition references', () => {
    expect(
      normalizeToolDefinitionReference({
        kind: 'skill' as const,
        id: ' builtin.planning ',
        version: '1.2.3',
        digest: 'A'.repeat(64)
      })
    ).toEqual({
      kind: 'skill' as const,
      id: 'builtin.planning',
      version: '1.2.3',
      digest: 'a'.repeat(64)
    })
  })

  it.each([
    { kind: 'other', id: 'builtin.read', version: '1.0.0', digest: 'a'.repeat(64) },
    { kind: 'tool', id: '../read', version: '1.0.0', digest: 'a'.repeat(64) },
    { kind: 'tool', id: 'builtin.read', version: 'latest', digest: 'a'.repeat(64) },
    { kind: 'tool', id: 'builtin.read', version: '1.0.0', digest: 'bad' }
  ])('rejects an invalid definition reference %#', (reference) => {
    expect(() => normalizeToolDefinitionReference(reference)).toThrow(
      /Definition reference/
    )
  })

  it('normalizes a complete immutable definition', () => {
    expect(normalizeToolDefinition(definition)).toEqual({
      ...definition,
      name: 'Read file',
      description: 'Read an authorized local text file.',
      tags: ['file', 'read'],
      executor: {
        kind: 'builtin',
        handler: 'files.read',
        handlerVersion: '1.0.0'
      },
      capabilities: ['filesystem.read'],
      effects: ['local_data.read'],
      discovery: {
        intents: ['inspect source', 'read file'],
        contexts: ['general', 'requirement', 'space', 'workflow'],
        requiresExplicitSelection: false
      }
    })
  })

  it.each([
    { label: 'schema version', changes: { schemaVersion: 2 } },
    { label: 'ID', changes: { id: '../read' } },
    { label: 'semantic version', changes: { version: '1.0' } },
    { label: 'definition digest', changes: { definitionDigest: 'bad' } },
    {
      label: 'package digest',
      changes: {
        package: { ...definition.package, packageDigest: 'bad' }
      }
    },
    { label: 'origin', changes: { origin: 'remote' } },
    {
      label: 'executor',
      changes: {
        executor: {
          kind: 'sandbox',
          runtime: 'python',
          entryPath: '../main.py'
        }
      }
    },
    { label: 'input schema', changes: { inputSchema: [] } },
    {
      label: 'duplicate capability',
      changes: {
        capabilities: ['filesystem.read', 'filesystem.read']
      }
    },
    {
      label: 'unknown capability',
      changes: { capabilities: ['everything'] }
    },
    { label: 'risk', changes: { risk: 'safe' } },
    {
      label: 'timeout',
      changes: {
        resources: { ...definition.resources, timeoutMs: 0 }
      }
    },
    {
      label: 'attempt count',
      changes: {
        resources: { ...definition.resources, maxAttempts: 4 }
      }
    },
    {
      label: 'discovery context',
      changes: {
        discovery: { ...definition.discovery, contexts: ['admin'] }
      }
    },
    { label: 'unknown field', changes: { secret: 'hidden' } }
  ])('rejects an invalid $label', ({ changes }) => {
    expect(() =>
      normalizeToolDefinition({ ...definition, ...changes })
    ).toThrow(/Tool definition/)
  })

  it('normalizes all executor variants', () => {
    expect(
      normalizeToolDefinition({
        ...definition,
        executor: {
          kind: 'sandbox',
          runtime: 'python',
          entryPath: 'tools/read.py',
          argumentsTemplate: ['--mode', 'safe']
        }
      }).executor
    ).toEqual({
      kind: 'sandbox',
      runtime: 'python',
      entryPath: 'tools/read.py',
      argumentsTemplate: ['--mode', 'safe']
    })
    expect(
      normalizeToolDefinition({
        ...definition,
        executor: {
          kind: 'mcp',
          serverRef: 'filesystem-server',
          remoteToolName: 'read_file',
          protocolVersion: '2025-06-18'
        }
      }).executor
    ).toMatchObject({ kind: 'mcp', remoteToolName: 'read_file' })
    expect(
      normalizeToolDefinition({
        ...definition,
        executor: {
          kind: 'connector',
          capabilityId: 'com.example.docs',
          capabilityVersion: '1.2.3',
          capabilityDigest: 'c'.repeat(64),
          actionId: 'search'
        }
      }).executor
    ).toEqual({
      kind: 'connector',
      capabilityId: 'com.example.docs',
      capabilityVersion: '1.2.3',
      capabilityDigest: 'c'.repeat(64),
      actionId: 'search'
    })
    expect(
      normalizeToolDefinition({
        ...definition,
        executor: {
          kind: 'computer',
          actionSet: 'macos.basic',
          actionSetVersion: '1.0.0'
        }
      }).executor
    ).toEqual({
      kind: 'computer',
      actionSet: 'macos.basic',
      actionSetVersion: '1.0.0'
    })
  })
})
