import {
  FileText,
  FolderOpen,
  Globe2,
  Search,
  SquareTerminal
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WorkbenchActionId } from '../../../shared/native-overlay'
import './native-workbench-menu.css'

type NativeWorkbenchMenuProps = {
  onAction: (action: WorkbenchActionId) => void
  onClose: () => void
}

const actions = [
  { id: 'files', label: '文件', icon: FileText },
  { id: 'folder', label: '文件夹', icon: FolderOpen },
  { id: 'browser', label: '浏览器', icon: Globe2 },
  { id: 'terminal', label: '终端', icon: SquareTerminal }
] satisfies Array<{
  id: WorkbenchActionId
  label: string
  icon: typeof FileText
}>

export function NativeWorkbenchMenu({
  onAction,
  onClose
}: NativeWorkbenchMenuProps): JSX.Element {
  const [query, setQuery] = useState('')
  const filteredActions = actions.filter((action) =>
    action.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <main
      className="native-workbench-menu"
      role="menu"
      aria-label="添加工作区内容"
    >
      <label>
        <Search size={17} />
        <input
          autoFocus
          type="search"
          aria-label="搜索工作区功能"
          placeholder="搜索文件名"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>⌘P</kbd>
      </label>
      <div className="native-workbench-menu-divider" />
      {filteredActions.map((action) => {
        const Icon = action.icon
        return (
          <button
            type="button"
            role="menuitem"
            key={action.id}
            onClick={() => onAction(action.id)}
          >
            <Icon size={17} />
            <span>{action.label}</span>
          </button>
        )
      })}
    </main>
  )
}
