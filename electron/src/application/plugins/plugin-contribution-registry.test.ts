import { describe, expect, it, vi } from 'vitest'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import {
  PluginContributionRegistry,
  PluginHookDispatcher
} from './plugin-contribution-registry'

describe('PluginContributionRegistry', () => {
  it('projects only contributions whose package and target Tool are effective', () => {
    const registry = new PluginContributionRegistry()
    const disabled = catalog('disabled', 'disabled')

    expect(registry.snapshot(disabled)).toMatchObject([
      {
        contribution: {
          kind: 'hook',
          id: 'research.after-search',
        },
        effective: false,
        blockedReasons: [
          'package_disabled',
          'target_tool_unavailable',
        ],
      },
      {
        contribution: {
          kind: 'media_provider',
          id: 'research.media',
          mediaOperations: ['image_generate', 'tts'],
        },
        effective: false,
        blockedReasons: ['package_disabled'],
      },
      {
        contribution: { kind: 'web_provider', id: 'research.web' },
        effective: false,
        blockedReasons: ['package_disabled'],
      },
    ])
    expect(registry.effective(disabled)).toEqual([])

    expect(
      registry.effective(catalog('enabled', 'enabled')).map(
        ({ contribution }) => contribution.id,
      ),
    ).toEqual([
      'research.after-search',
      'research.media',
      'research.web',
    ])
  })
})

describe('PluginHookDispatcher', () => {
  it('routes Hooks through the normal Tool execution boundary with exact identity', async () => {
    const execute = vi.fn().mockResolvedValue({
      outcome: 'permission_denied',
      permissionRequests: [],
    })
    const dispatcher = new PluginHookDispatcher({
      catalog: async () => catalog('enabled', 'enabled'),
      registry: new PluginContributionRegistry(),
      toolBoundary: { execute },
    })

    await expect(
      dispatcher.dispatch(
        {
          id: 'event-1',
          event: 'tool.completed',
          payload: { toolId: 'builtin.files.read' },
        },
        {
          scope: {
            kind: 'conversation',
            conversationId: 'conversation-1',
          },
          conversationId: 'conversation-1',
        },
      ),
    ).resolves.toEqual([
      { outcome: 'permission_denied', permissionRequests: [] },
    ])
    expect(execute).toHaveBeenCalledWith({
      definition: {
        kind: 'tool',
        id: 'research.search',
        version: '1.0.0',
        digest: 'c'.repeat(64),
      },
      triggerSource: 'hook',
      context: {
        scope: {
          kind: 'conversation',
          conversationId: 'conversation-1',
        },
        conversationId: 'conversation-1',
      },
      input: {
        event: 'tool.completed',
        eventId: 'event-1',
        payload: { toolId: 'builtin.files.read' },
        hookId: 'research.after-search',
      },
      idempotencyKey: expect.stringMatching(
        /^plugin-hook-[a-f0-9]{64}$/,
      ),
    })
  })

  it('does not dispatch a disabled Hook or recursively dispatch itself', async () => {
    const execute = vi.fn()
    const registry = new PluginContributionRegistry()
    const disabled = new PluginHookDispatcher({
      catalog: async () => catalog('disabled', 'disabled'),
      registry,
      toolBoundary: { execute },
    })
    expect(
      await disabled.dispatch(
        { id: 'event-1', event: 'tool.completed', payload: {} },
        {
          scope: {
            kind: 'conversation',
            conversationId: 'conversation-1',
          },
        },
      ),
    ).toEqual([])

    const recursive = new PluginHookDispatcher({
      catalog: async () => catalog('enabled', 'enabled'),
      registry,
      toolBoundary: { execute },
    })
    expect(
      await recursive.dispatch(
        {
          id: 'event-2',
          event: 'tool.completed',
          payload: {},
          originHookId: 'research.after-search',
        },
        {
          scope: {
            kind: 'conversation',
            conversationId: 'conversation-1',
          },
        },
      ),
    ).toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })
})

function catalog(
  packageStatus: 'enabled' | 'disabled',
  toolStatus: 'enabled' | 'disabled',
): ToolCatalogState {
  const definition = toolDefinition()
  return {
    packages: [
      {
        packageId: 'com.example.research',
        version: '1.0.0',
        packageDigest: 'b'.repeat(64),
        origin: 'local_upload',
        name: 'Research',
        description: 'Research Plugin.',
        enabledPreference: packageStatus === 'enabled',
        status: packageStatus,
        dependencyIssues: [],
        revision: 1,
        updatedAt: 100,
        plugin: {
          permissions: {
            capabilities: ['network.connect'],
            maximumRisk: 'medium',
            pathPrefixes: [],
            networkTargets: ['https://api.example.com'],
          },
          sandboxes: [],
          dependencies: [],
          contributions: [
            {
              kind: 'media_provider',
              id: 'research.media',
              definitionDigest: 'f'.repeat(64),
              credentialRefs: ['media-token'],
              mediaOperations: ['image_generate', 'tts'],
            },
            {
              kind: 'web_provider',
              id: 'research.web',
              definitionDigest: 'd'.repeat(64),
              credentialRefs: ['web-token'],
            },
            {
              kind: 'hook',
              id: 'research.after-search',
              definitionDigest: 'e'.repeat(64),
              targetToolId: 'research.search',
              event: 'tool.completed',
            },
          ],
        },
      },
    ],
    tools: [
      {
        kind: 'tool',
        id: definition.id,
        version: definition.version,
        definitionDigest: definition.definitionDigest,
        definition,
        enabledPreference: toolStatus === 'enabled',
        status: toolStatus,
        dependencyIssues: [],
        revision: 2,
        updatedAt: 100,
      },
    ],
    skills: [],
  }
}

function toolDefinition(): ToolDefinition {
  return {
    schemaVersion: 1,
    id: 'research.search',
    version: '1.0.0',
    definitionDigest: 'c'.repeat(64),
    package: {
      packageId: 'com.example.research',
      packageVersion: '1.0.0',
      packageDigest: 'b'.repeat(64),
    },
    origin: 'local_upload',
    name: 'Search',
    description: 'Search.',
    tags: ['research'],
    executor: {
      kind: 'sandbox',
      runtime: 'process',
      entryPath: 'runtime/search.js',
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: ['network.connect'],
    effects: ['external.read'],
    risk: 'medium',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false,
    },
    resources: {
      timeoutMs: 30_000,
      maxOutputBytes: 16_384,
      maxAttempts: 1,
    },
    discovery: {
      intents: ['research'],
      contexts: ['general'],
    },
  }
}
