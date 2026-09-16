import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
