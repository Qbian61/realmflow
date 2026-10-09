import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { registerCapabilityCatalogIpc } from './capability-catalog-ipc'

describe('Capability Catalog IPC', () => {
  it('returns localized display metadata without changing the definition', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, value?: unknown) => unknown
    >()
    const definition = {
      schemaVersion: 1,
      id: 'builtin.documents.read',
      kind: 'tool',
      version: '1.0.0',
      source: 'builtin',
      manifestDigest: 'a'.repeat(64),
      definitionDigest: 'b'.repeat(64),
      name: 'Read document',
      description: 'Extract text from a local document'
    }
    registerCapabilityCatalogIpc({
      catalog: {
        listDefinitions: vi.fn().mockResolvedValue([definition]),
        listInstallations: vi.fn().mockResolvedValue([])
      },
      importer: {
        prepare: vi.fn(),
        install: vi.fn(),
        discard: vi.fn()
      },
      lifecycle: {
        setEnabled: vi.fn(),
        changeVersion: vi.fn(),
        delete: vi.fn()
      },
      dialog: {
        showOpenDialog: vi.fn()
      },
      ipcMain: {
        handle: (
          channel: string,
          handler: (
            event: IpcMainInvokeEvent,
            value?: unknown
          ) => unknown
        ) => {
          handlers.set(channel, handler)
        }
      }
    } as never)

    const result = await handlers.get('capability-catalog:list')!(
      {} as IpcMainInvokeEvent,
      { locale: 'zh-CN' }
    )

    expect(result).toMatchObject({
      definitions: [
        {
          id: 'builtin.documents.read',
          name: 'Read document',
          definitionDigest: 'b'.repeat(64)
        }
      ],
      displayByDefinitionKey: {
        'builtin.documents.read@1.0.0': {
          name: '读取文档',
          resolvedLocale: 'zh-CN'
        }
      }
    })
  })

  it('rejects an unsupported locale', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, value?: unknown) => unknown
    >()
    registerCapabilityCatalogIpc({
      catalog: {
        listDefinitions: vi.fn(),
        listInstallations: vi.fn()
      },
      importer: {
        prepare: vi.fn(),
        install: vi.fn(),
        discard: vi.fn()
      },
      lifecycle: {
        setEnabled: vi.fn(),
        changeVersion: vi.fn(),
        delete: vi.fn()
      },
      dialog: {
        showOpenDialog: vi.fn()
      },
      ipcMain: {
        handle: (
          channel: string,
          handler: (
            event: IpcMainInvokeEvent,
            value?: unknown
          ) => unknown
        ) => {
          handlers.set(channel, handler)
        }
      }
    } as never)

    await expect(
      handlers.get('capability-catalog:list')!(
        {} as IpcMainInvokeEvent,
        { locale: 'fr' }
      )
    ).rejects.toThrow('Capability Catalog locale is invalid')
  })
})
