import {
  FileText,
  FolderOpen,
  Globe2,
  SquareTerminal
} from 'lucide-react'
import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction
} from 'react'
import type { RealmFlowApi } from '../../../../shared/types'
import type { OpenedSessionFiles } from '../../../../shared/workspace'
import type {
  WorkbenchAction,
  WorkbenchTab
} from '../../../application/workbench/workbench-reducer'
import { workspaceTabFromSelection } from '../../../application/workbench/workbench-reducer'
import type { RequirementStageId } from '../../../domain/requirement'
import type { WorkbenchLauncherAction } from '../WorkbenchLayout'

export type WorkbenchCommands = {
  openFiles: () => Promise<void>
  openWorkspaceSelection: (selection: OpenedSessionFiles) => void
  openFolder: () => Promise<void>
  openUrl: (url?: string) => Promise<void>
  openTerminal: () => Promise<void>
  openRequirementArtifact: (
    requirementId: string,
    stage: RequirementStageId,
    label: string
  ) => void
  openPanel: () => void
  closePanel: () => void
}

export function useWorkbenchCommands({
  api,
  tabs,
  dispatch,
  activateTab,
  setPanelOpen,
  openTerminal,
  closeTerminal
}: {
  api?: RealmFlowApi
  tabs: WorkbenchTab[]
  dispatch: Dispatch<WorkbenchAction>
  activateTab: (tab: WorkbenchTab) => void
  setPanelOpen: Dispatch<SetStateAction<boolean>>
  openTerminal: () => Promise<void>
  closeTerminal: (id: string, exited: boolean) => Promise<void>
}): {
  contextValue: WorkbenchCommands
  launcherActions: WorkbenchLauncherAction[]
  urlDialogOpen: boolean
  urlDraft: string
  urlError: string
  setUrlDraft: Dispatch<SetStateAction<string>>
  closeUrlDialog: () => void
  submitUrl: () => void
  closeTab: (id: string) => Promise<void>
  openLinkedWebContent: (event: MouseEvent<HTMLDivElement>) => void
} {
  const [urlDialogOpen, setUrlDialogOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState('https://')
  const [urlError, setUrlError] = useState('')

  const openWorkspaceSelection = useCallback(
    (selection: OpenedSessionFiles): void => {
      activateTab(workspaceTabFromSelection(selection))
    },
    [activateTab]
  )

  const openFiles = useCallback(async (): Promise<void> => {
    const selection = await api?.workspace.chooseFiles()
    if (selection) openWorkspaceSelection(selection)
  }, [api, openWorkspaceSelection])

  const openFolder = useCallback(async (): Promise<void> => {
    const binding = await api?.workspace.chooseFolder()
    if (!binding) return
    activateTab({
      id: `workspace:${binding.requirementId}`,
      type: 'workspace',
      label: binding.rootName,
      workspaceId: binding.requirementId
    })
  }, [activateTab, api])

  const openUrl = useCallback(
    async (url?: string): Promise<void> => {
      if (!api) return
      if (!url) {
        setUrlError('')
        setUrlDialogOpen(true)
        return
      }
      try {
        const page = await api.webWorkbench.create(url)
        activateTab({
          id: page.id,
          type: 'web',
          label: page.title || page.url,
          page
        })
        setUrlDialogOpen(false)
        setUrlError('')
      } catch (error) {
        setUrlError(
          error instanceof Error ? error.message : '无法打开该网页地址'
        )
      }
    },
    [activateTab, api]
  )

  const closeTab = useCallback(
    async (id: string): Promise<void> => {
      const closingTab = tabs.find((tab) => tab.id === id)
      if (closingTab?.type === 'web') {
        await api?.webWorkbench.destroy(id)
      }
      if (closingTab?.type === 'terminal') {
        await closeTerminal(id, closingTab.exited)
      }
      dispatch({ type: 'tab-closed', tabId: id })
    },
    [api, closeTerminal, dispatch, tabs]
  )

  const openLinkedWebContent = useCallback(
    (event: MouseEvent<HTMLDivElement>): void => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest<HTMLAnchorElement>('a[href]')
      if (!link || link.hasAttribute('download')) return
      const rawHref = link.getAttribute('href')
      if (!rawHref || rawHref.startsWith('#')) return
      const url = new URL(link.href)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      event.preventDefault()
      void openUrl(url.toString())
    },
    [openUrl]
  )

  const contextValue = useMemo<WorkbenchCommands>(
    () => ({
      openFiles,
      openWorkspaceSelection,
      openFolder,
      openUrl,
      openTerminal,
      openRequirementArtifact: (requirementId, stage, label) => {
        activateTab({
          id: `requirement:${requirementId}`,
          type: 'workspace',
          label,
          workspaceId: requirementId,
          activeStage: stage
        })
      },
      openPanel: () => setPanelOpen(true),
      closePanel: () => {
        setPanelOpen(false)
        void api?.webWorkbench.hideAll()
      }
    }),
    [
      activateTab,
      api,
      openFiles,
      openFolder,
      openTerminal,
      openUrl,
      openWorkspaceSelection,
      setPanelOpen
    ]
  )

  const launcherActions = useMemo<WorkbenchLauncherAction[]>(
    () => [
      {
        id: 'files',
        label: '文件',
        description: '浏览和预览文件',
        icon: FileText,
        run: openFiles
      },
      {
        id: 'folder',
        label: '文件夹',
        description: '浏览文件夹目录',
        icon: FolderOpen,
        run: openFolder
      },
      {
        id: 'browser',
        label: '浏览器',
        description: '浏览及调试网页',
        icon: Globe2,
        run: () => openUrl()
      },
      {
        id: 'terminal',
        label: '终端',
        description: '运行命令及脚本',
        icon: SquareTerminal,
        run: openTerminal
      }
    ],
    [openFiles, openFolder, openTerminal, openUrl]
  )

  return {
    contextValue,
    launcherActions,
    urlDialogOpen,
    urlDraft,
    urlError,
    setUrlDraft,
    closeUrlDialog: () => setUrlDialogOpen(false),
    submitUrl: () => void openUrl(urlDraft),
    closeTab,
    openLinkedWebContent
  }
}
