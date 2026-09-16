import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type { WorkspaceApi, WorkspaceFile } from '../../../shared/workspace'
import ArtifactWorkbench from './ArtifactWorkbench'

vi.mock('./CodeEditor', () => ({
  default: ({
    value,
    onChange
  }: {
    value: string
    onChange: (value: string) => void
  }) => (
    <textarea
      aria-label="代码编辑器"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}))

const markdownFile: WorkspaceFile = {
  name: 'requirement.md',
  path: 'docs/requirement.md',
  content: '# Requirement scope',
  kind: 'markdown',
  language: 'markdown',
  size: 19,
  modifiedAt: 1,
  version: '1:19'
}

function createWorkspaceApi(
  overrides: Partial<WorkspaceApi> = {}
): WorkspaceApi {
  return {
    chooseFiles: vi.fn().mockResolvedValue(null),
    chooseFolder: vi.fn().mockResolvedValue(null),
    chooseDirectory: vi.fn().mockResolvedValue({
      requirementId: 'requirement-1',
      rootName: 'project',
      rootPath: '/tmp/project'
    }),
    getBinding: vi.fn().mockResolvedValue({
      requirementId: 'requirement-1',
      rootName: 'project',
      rootPath: '/tmp/project'
    }),
    listDirectory: vi.fn().mockResolvedValue([
      { name: 'docs', path: 'docs', type: 'directory' }
    ]),
    readFile: vi.fn().mockResolvedValue(markdownFile),
    writeFile: vi.fn().mockImplementation(async (input) => ({
      ...markdownFile,
      content: input.content,
      version: '2:20'
    })),
    readManifest: vi.fn().mockResolvedValue({
      version: 1,
      requirementId: 'requirement-1',
      stages: {}
    }),
    writeManifest: vi.fn().mockImplementation(async (_id, manifest) => manifest),
    getPreviewUrl: vi
      .fn()
      .mockResolvedValue(
        'realmflow-artifact://preview/requirement-1/docs/requirement.md'
      ),
    showItem: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('ArtifactWorkbench', () => {
  it('binds a local directory and loads its root entries', async () => {
    const api = createWorkspaceApi({
      getBinding: vi.fn().mockResolvedValue(null),
      listDirectory: vi.fn().mockResolvedValue([
        { name: 'README.md', path: 'README.md', type: 'file' }
      ])
    })
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />
    )

    fireEvent.click(
      await screen.findByRole('button', { name: '绑定本地目录' })
    )

    expect(await screen.findByText('project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开 README.md' })).toBeInTheDocument()
  })

  it('opens Markdown in preview mode and can switch to editing', async () => {
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: 'requirement.md',
          path: 'docs/requirement.md',
          type: 'file'
        }
      ])
    })
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />
    )

    fireEvent.click(
      await screen.findByRole('button', { name: '打开 requirement.md' })
    )

    expect(
      await screen.findByRole('heading', { name: 'Requirement scope' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑文件' }))
    expect(
      await screen.findByRole('textbox', { name: '代码编辑器' })
    ).toHaveValue('# Requirement scope')
  })

  it('saves edited code with the version that was opened', async () => {
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: 'main.ts',
      path: 'src/main.ts',
      content: 'const ready = false',
      kind: 'code',
      language: 'typescript'
    }
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        { name: 'main.ts', path: 'src/main.ts', type: 'file' }
      ]),
      readFile: vi.fn().mockResolvedValue(codeFile)
    })
    render(
      <ArtifactWorkbench
        activeStage="implementation"
        requirementId="requirement-1"
        workspaceApi={api}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '打开 main.ts' }))
    fireEvent.change(await screen.findByRole('textbox', { name: '代码编辑器' }), {
      target: { value: 'const ready = true' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存文件' }))

    await waitFor(() => {
      expect(api.writeFile).toHaveBeenCalledWith({
        requirementId: 'requirement-1',
        path: 'src/main.ts',
        content: 'const ready = true',
        expectedVersion: '1:19'
      })
    })
  })

  it('associates the active file as the primary artifact of the current stage', async () => {
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: 'requirement.md',
          path: 'docs/requirement.md',
          type: 'file'
        }
      ])
    })
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />
    )

    fireEvent.click(
      await screen.findByRole('button', { name: '打开 requirement.md' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: '关联到需求分析' })
    )

    await waitFor(() => {
      expect(api.writeManifest).toHaveBeenCalledWith('requirement-1', {
        version: 1,
        requirementId: 'requirement-1',
        stages: {
          analysis: {
            artifacts: [{ path: 'docs/requirement.md', primary: true }]
          }
        }
      })
    })
  })

  it('does not steal focus after opening another file beside the stage artifact', async () => {
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: 'main.ts',
      path: 'src/main.ts',
      content: 'export const ready = true',
      kind: 'code',
      language: 'typescript'
    }
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: 'requirement.md',
          path: 'docs/requirement.md',
          type: 'file'
        },
        { name: 'main.ts', path: 'src/main.ts', type: 'file' }
      ]),
      readFile: vi
        .fn()
        .mockImplementation(async (_requirementId, path) =>
          path === 'src/main.ts' ? codeFile : markdownFile
        ),
      readManifest: vi.fn().mockResolvedValue({
        version: 1,
        requirementId: 'requirement-1',
        stages: {
          analysis: {
            artifacts: [{ path: 'docs/requirement.md', primary: true }]
          }
        }
      })
    })
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />
    )

    await screen.findByRole('heading', { name: 'Requirement scope' })
    fireEvent.click(screen.getByRole('button', { name: '打开 main.ts' }))

    expect(
      await screen.findByRole('tab', { name: 'main.ts' })
    ).toHaveAttribute('aria-selected', 'true')
  })
})
