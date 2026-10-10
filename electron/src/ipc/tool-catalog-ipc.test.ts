import { describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { registerToolCatalogIpc } from './tool-catalog-ipc'

describe('Tool Catalog IPC', () => {
  it('registers query, import, and confirmed activation handlers', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >()
    const catalog = {
      list: vi.fn().mockResolvedValue({
        packages: [],
        tools: [],
        skills: []
      }),
      setActivation: vi.fn().mockResolvedValue({
        targetType: 'tool',
        item: { id: 'builtin.files.read', status: 'disabled' }
      }),
      changePackageVersion: vi.fn().mockResolvedValue({
        packageId: 'com.example.files',
        version: '1.0.0',
      }),
    }
    const importer = {
      importFromPath: vi.fn().mockResolvedValue({
        package: { packageId: 'com.example.files' },
        tools: [],
        skills: []
      })
    }
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['/private/example.zip']
      })
    }
    const mcpServers = {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(mcpServerRecord()),
      delete: vi.fn().mockResolvedValue({ id: 'search' }),
      testConnection: vi.fn().mockResolvedValue({
        ...mcpServerRecord(),
        validation: {
          status: 'available',
          message: 'MCP Server is available',
          checkedAt: 1
        }
      }),
      discover: vi.fn().mockResolvedValue({
        package: { manifest: { packageId: 'mcp.search' } },
        tools: [],
        skills: []
      })
    }
    registerToolCatalogIpc({
      catalog,
      importer,
      mcpServers,
      dialog,
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      }
    })

    await expect(
      handlers.get('tool-catalog:list')!(
        {} as IpcMainInvokeEvent,
        { locale: 'zh-CN', modelFacingMode: 'facade' }
      )
    ).resolves.toEqual({
      packages: [],
      tools: [],
      skills: []
    })
    expect(catalog.list).toHaveBeenCalledWith({ modelFacingMode: 'facade' })
    await expect(
      handlers.get('tool-catalog:choose-and-import')!({} as IpcMainInvokeEvent, {
        sourceType: 'archive',
        idempotencyKey: 'import-1'
      })
    ).resolves.toMatchObject({
      package: { packageId: 'com.example.files' }
    })
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openFile'],
      filters: [{ name: 'Extension package', extensions: ['zip'] }]
    })
    expect(importer.importFromPath).toHaveBeenCalledWith({
      sourcePath: '/private/example.zip',
      idempotencyKey: 'import-1'
    })

    await handlers.get('tool-catalog:set-activation')!({} as IpcMainInvokeEvent, {
      targetType: 'tool',
      targetId: 'builtin.files.read',
      enabled: false,
      idempotencyKey: 'disable-1'
    })
    expect(catalog.setActivation).toHaveBeenCalledWith({
      targetType: 'tool',
      targetId: 'builtin.files.read',
      enabled: false,
      idempotencyKey: 'disable-1'
    })
    await handlers.get('tool-catalog:change-package-version')!(
      {} as IpcMainInvokeEvent,
      {
        packageId: 'com.example.files',
        targetVersion: '1.0.0',
        operation: 'rollback',
        idempotencyKey: 'rollback-1'
      }
    )
    expect(catalog.changePackageVersion).toHaveBeenCalledWith({
      packageId: 'com.example.files',
      targetVersion: '1.0.0',
      operation: 'rollback',
      idempotencyKey: 'rollback-1'
    })

    await handlers.get('mcp-server:list')!({} as IpcMainInvokeEvent)
    await handlers.get('mcp-server:save')!({} as IpcMainInvokeEvent, {
      id: 'search',
      name: 'Search',
      enabled: true,
      transport: {
        kind: 'streamable_http',
        url: 'https://mcp.example.com/rpc',
        credentialNames: ['Authorization']
      },
      credentialValues: { Authorization: 'secret' },
      expectedRevision: 0,
      idempotencyKey: 'mcp-save-1'
    })
    await handlers.get('mcp-server:delete')!({} as IpcMainInvokeEvent, {
      id: 'search',
      expectedRevision: 1,
      idempotencyKey: 'mcp-delete-1'
    })
    await handlers.get('mcp-server:test')!({} as IpcMainInvokeEvent, {
      id: 'search',
      expectedRevision: 1
    })
    await handlers.get('mcp-server:discover')!({} as IpcMainInvokeEvent, {
      id: 'search',
      idempotencyKey: 'mcp-discover-1'
    })

    expect(mcpServers.list).toHaveBeenCalledOnce()
    expect(mcpServers.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'search' })
    )
    expect(mcpServers.delete).toHaveBeenCalledWith({
      id: 'search',
      expectedRevision: 1,
      idempotencyKey: 'mcp-delete-1'
    })
    expect(mcpServers.testConnection).toHaveBeenCalledWith({
      id: 'search',
      expectedRevision: 1
    })
    expect(mcpServers.discover).toHaveBeenCalledWith({
      id: 'search',
      idempotencyKey: 'mcp-discover-1'
    })
  })

  it('returns null when package selection is cancelled', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >()
    registerToolCatalogIpc({
      catalog: {
        list: vi.fn(),
        setActivation: vi.fn(),
        changePackageVersion: vi.fn()
      },
      importer: { importFromPath: vi.fn() },
      mcpServers: {
        list: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
        testConnection: vi.fn(),
        discover: vi.fn()
      },
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: true,
          filePaths: []
        })
      },
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      }
    })

    await expect(
      handlers.get('tool-catalog:choose-and-import')!({} as IpcMainInvokeEvent, {
        sourceType: 'directory',
        idempotencyKey: 'import-1'
      })
    ).resolves.toBeNull()
  })

  it('keeps facade tool display names canonical in localized catalog responses', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >()
    registerToolCatalogIpc({
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: 'filesystem_read',
              version: '1.0.0',
              definitionDigest: 'a'.repeat(64),
              definition: {
                id: 'filesystem_read',
                name: 'Filesystem read',
                description: 'Read local files through facade routing.',
                origin: 'builtin'
              },
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
              modelFacing: {
                mode: 'facade',
                kind: 'facade',
                visibility: 'direct',
                coveredPrimitiveToolIds: ['builtin.files.read'],
                maxRisk: 'low'
              }
            }
          ],
          skills: []
        }),
        setActivation: vi.fn(),
        changePackageVersion: vi.fn()
      },
      importer: { importFromPath: vi.fn() },
      mcpServers: {
        list: vi.fn().mockResolvedValue([]),
        save: vi.fn(),
        delete: vi.fn(),
        testConnection: vi.fn(),
        discover: vi.fn()
      },
      dialog: {
        showOpenDialog: vi.fn()
      },
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      }
    })

    await expect(
      handlers.get('tool-catalog:list')!(
        {} as IpcMainInvokeEvent,
        { locale: 'zh-CN', modelFacingMode: 'facade' }
      )
    ).resolves.toMatchObject({
      tools: [
        {
          display: {
            name: 'Filesystem read',
            description: 'Read local files through facade routing.',
            requestedLocale: 'zh-CN',
            resolvedLocale: 'canonical'
          }
        }
      ]
    })
  })
})

function mcpServerRecord() {
  return {
    configuration: {
      id: 'search',
      name: 'Search',
      identity: 'a'.repeat(64),
      enabled: true,
      transport: {
        kind: 'streamable_http' as const,
        url: 'https://mcp.example.com/rpc',
        headerCredentialIds: {
          Authorization: 'credential-search-authorization'
        }
      }
    },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    hasCredentials: { Authorization: true }
  }
}
