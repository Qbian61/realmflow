import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import type { RealmFlowApi } from '../../shared/types'
import { WorkbenchProvider } from '../features/workbench/WorkbenchProvider'
import SpaceDetailPage from './SpaceDetailPage'

vi.mock('../features/artifacts/ArtifactWorkbench', () => ({
  default: () => <div>本地文件预览</div>
}))

function createApi(): RealmFlowApi {
  return {
    platform: 'darwin',
    getSidecarStatus: vi.fn().mockResolvedValue('ready'),
    quitApp: vi.fn().mockResolvedValue(undefined),
    persistence: {
      load: vi.fn().mockResolvedValue({
        status: 'loaded',
        snapshot: { revision: 0, value: null }
      }),
      save: vi.fn().mockResolvedValue({
        status: 'saved',
        snapshot: { revision: 1, value: null }
      }),
      onChanged: vi.fn().mockReturnValue(() => undefined)
    },
    workspace: {
      chooseFiles: vi.fn().mockResolvedValue({
        binding: {
          requirementId: 'session-space-files',
          rootName: 'docs',
          rootPath: '/tmp/docs'
        },
        files: [
          {
            name: 'architecture.md',
            path: 'architecture.md',
            content: '# Architecture',
            kind: 'markdown',
            language: 'markdown',
            size: 14,
            modifiedAt: 1,
            version: '1:14'
          }
        ]
      }),
      chooseFolder: vi.fn().mockResolvedValue(null),
      chooseDirectory: vi.fn().mockResolvedValue(null),
      getBinding: vi.fn().mockResolvedValue(null),
      listDirectory: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readManifest: vi.fn().mockResolvedValue({
        version: 1,
        requirementId: 'session-space-files',
        stages: {}
      }),
      writeManifest: vi.fn(),
      getPreviewUrl: vi.fn(),
      showItem: vi.fn()
    },
    webWorkbench: {
      create: vi.fn(),
      show: vi.fn().mockResolvedValue(undefined),
      hideAll: vi.fn().mockResolvedValue(undefined),
      setBounds: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      destroy: vi.fn(),
      openExternal: vi.fn(),
      onStateChange: vi.fn().mockReturnValue(() => undefined)
    },
    terminal: {
      create: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => undefined)
    }
  }
}

describe('SpaceDetailPage', () => {
  it('adds local files as space resources and opens them in the workbench', async () => {
    const api = createApi()
    render(
      <MemoryRouter initialEntries={['/spaces/xxx']}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  resourceRepository={{
                    load: () => ({
                      value: { resourcesBySpace: {} },
                      revision: 0
                    }),
                    save: async (value, expectedRevision) => ({
                      status: 'saved',
                      snapshot: {
                        value,
                        revision: expectedRevision + 1
                      }
                    })
                  }}
                  spaces={[
                    {
                      path: '/spaces/xxx',
                      label: 'xxx 空间',
                      description: '测试空间'
                    }
                  ]}
                  requirementsBySpace={{ '/spaces/xxx': [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('tab', { name: 'xxx 空间 (0)' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: '空间知识库 (0)' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'xxx 空间' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('0 个需求 · 0 项资源')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '空间知识库 (0)' }))
    expect(
      screen.queryByRole('heading', { name: '空间资源' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上传本地文件' }))

    await waitFor(() => {
      expect(api.workspace.chooseFiles).toHaveBeenCalledTimes(1)
    })
    expect(
      screen.getByRole('tab', { name: '空间知识库 (1)' })
    ).toBeInTheDocument()
    fireEvent.click(
      await screen.findByRole('button', { name: '打开 architecture.md' })
    )

    expect(
      await screen.findByRole('complementary', { name: '全局工作区' })
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'docs' })).toBeInTheDocument()
  })

  it('applies external resource updates without writing them back', async () => {
    const api = createApi()
    let listener: (() => void) | undefined
    let snapshot = {
      value: { resourcesBySpace: {} },
      revision: 1
    }
    const save = vi.fn(async (value, expectedRevision: number) => ({
      status: 'saved' as const,
      snapshot: {
        value,
        revision: expectedRevision + 1
      }
    }))

    render(
      <MemoryRouter initialEntries={['/spaces/xxx']}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  resourceRepository={{
                    load: () => snapshot,
                    save,
                    subscribe: (nextListener) => {
                      listener = nextListener
                      return () => {
                        listener = undefined
                      }
                    }
                  }}
                  spaces={[
                    {
                      path: '/spaces/xxx',
                      label: 'xxx 空间',
                      description: '测试空间'
                    }
                  ]}
                  requirementsBySpace={{ '/spaces/xxx': [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>
    )

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    snapshot = {
      value: {
        resourcesBySpace: {
          '/spaces/xxx': [
            {
              id: 'remote-doc',
              name: '远端文档',
              type: 'document' as const,
              locator: 'https://example.com/remote',
              detail: 'example.com',
              updatedAt: 1
            }
          ]
        }
      },
      revision: 3
    }
    act(() => listener?.())

    fireEvent.click(
      await screen.findByRole('tab', { name: '空间知识库 (1)' })
    )
    expect(screen.getByText('远端文档')).toBeInTheDocument()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  })

  it('shows a non-blocking status when resource persistence is unavailable', async () => {
    const api = createApi()

    render(
      <MemoryRouter initialEntries={['/spaces/xxx']}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  resourceRepository={{
                    load: () => ({
                      value: { resourcesBySpace: {} },
                      revision: 0
                    }),
                    save: async (value, expectedRevision) => ({
                      status: 'unavailable',
                      snapshot: {
                        value,
                        revision: expectedRevision
                      }
                    })
                  }}
                  spaces={[
                    {
                      path: '/spaces/xxx',
                      label: 'xxx 空间',
                      description: '测试空间'
                    }
                  ]}
                  requirementsBySpace={{ '/spaces/xxx': [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>
    )

    expect(
      await screen.findByRole('status', { name: '空间资源存储状态' })
    ).toHaveTextContent('空间资源的更改暂时无法保存')
    expect(
      screen.getByRole('tab', { name: 'xxx 空间 (0)' })
    ).toBeInTheDocument()
  })
})
