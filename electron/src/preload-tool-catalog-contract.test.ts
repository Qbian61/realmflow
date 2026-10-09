import { describe, expect, it, vi } from 'vitest'
import { createRealmFlowApi } from './preload-api'

describe('preload Tool Catalog contract', () => {
  it('exposes only typed Tool Catalog query and commands', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )

    await api.toolCatalog.list({ locale: 'zh-CN' })
    await api.toolCatalog.chooseAndImport({
      sourceType: 'archive',
      idempotencyKey: 'import-1'
    })
    await api.toolCatalog.setActivation({
      targetType: 'tool',
      targetId: 'builtin.files.read',
      enabled: false,
      idempotencyKey: 'disable-1'
    })
    await api.toolCatalog.listMcpServers()
    await api.toolCatalog.saveMcpServer({
      id: 'search',
      name: 'Search',
      enabled: true,
      transport: {
        kind: 'streamable_http',
        url: 'https://mcp.example.com/rpc',
        credentialNames: []
      },
      credentialValues: {},
      expectedRevision: 0,
      idempotencyKey: 'mcp-save-1'
    })
    await api.toolCatalog.deleteMcpServer({
      id: 'search',
      expectedRevision: 1,
      idempotencyKey: 'mcp-delete-1'
    })
    await api.toolCatalog.testMcpServer({
      id: 'search',
      expectedRevision: 1
    })
    await api.toolCatalog.discoverMcpServer({
      id: 'search',
      idempotencyKey: 'mcp-discover-1'
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'tool-catalog:list', {
      locale: 'zh-CN'
    })
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      'tool-catalog:choose-and-import',
      {
        sourceType: 'archive',
        idempotencyKey: 'import-1'
      }
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      'tool-catalog:set-activation',
      {
        targetType: 'tool',
        targetId: 'builtin.files.read',
        enabled: false,
        idempotencyKey: 'disable-1'
      }
    )
    expect(invoke).toHaveBeenNthCalledWith(4, 'mcp-server:list')
    expect(invoke).toHaveBeenNthCalledWith(
      5,
      'mcp-server:save',
      expect.objectContaining({ id: 'search' })
    )
    expect(invoke).toHaveBeenNthCalledWith(
      6,
      'mcp-server:delete',
      expect.objectContaining({ id: 'search' })
    )
    expect(invoke).toHaveBeenNthCalledWith(
      7,
      'mcp-server:test',
      expect.objectContaining({ id: 'search' })
    )
    expect(invoke).toHaveBeenNthCalledWith(
      8,
      'mcp-server:discover',
      expect.objectContaining({ id: 'search' })
    )
  })
})
