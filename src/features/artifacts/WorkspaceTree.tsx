import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileText,
  Folder,
  FolderOpen
} from 'lucide-react'
import type { WorkspaceEntry } from '../../../shared/workspace'

type WorkspaceTreeProps = {
  directoryPath?: string
  entriesByDirectory: Record<string, WorkspaceEntry[]>
  expandedDirectories: Set<string>
  activePath?: string
  onToggleDirectory: (path: string) => void
  onOpenFile: (path: string) => void
}

function FileIcon({ name }: { name: string }): JSX.Element {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'md' || extension === 'markdown') {
    return <FileText size={15} strokeWidth={1.7} />
  }
  if (
    extension &&
    ['css', 'go', 'html', 'js', 'jsx', 'json', 'py', 'rs', 'ts', 'tsx'].includes(
      extension
    )
  ) {
    return <FileCode2 size={15} strokeWidth={1.7} />
  }
  return <File size={15} strokeWidth={1.7} />
}

export default function WorkspaceTree({
  directoryPath = '',
  entriesByDirectory,
  expandedDirectories,
  activePath,
  onToggleDirectory,
  onOpenFile
}: WorkspaceTreeProps): JSX.Element {
  const entries = entriesByDirectory[directoryPath] ?? []

  return (
    <ul className="workspace-tree-list">
      {entries.map((entry) => {
        const expanded =
          entry.type === 'directory' && expandedDirectories.has(entry.path)
        return (
          <li key={entry.path}>
            {entry.type === 'directory' ? (
              <>
                <button
                  className="workspace-tree-entry"
                  type="button"
                  aria-label={`${expanded ? '折叠' : '展开'} ${entry.name}`}
                  onClick={() => onToggleDirectory(entry.path)}
                >
                  {expanded ? (
                    <ChevronDown size={13} strokeWidth={1.8} />
                  ) : (
                    <ChevronRight size={13} strokeWidth={1.8} />
                  )}
                  {expanded ? (
                    <FolderOpen size={15} strokeWidth={1.7} />
                  ) : (
                    <Folder size={15} strokeWidth={1.7} />
                  )}
                  <span title={entry.name}>{entry.name}</span>
                </button>
                {expanded ? (
                  <WorkspaceTree
                    directoryPath={entry.path}
                    entriesByDirectory={entriesByDirectory}
                    expandedDirectories={expandedDirectories}
                    activePath={activePath}
                    onToggleDirectory={onToggleDirectory}
                    onOpenFile={onOpenFile}
                  />
                ) : null}
              </>
            ) : (
              <button
                className={
                  entry.path === activePath
                    ? 'workspace-tree-entry active'
                    : 'workspace-tree-entry'
                }
                type="button"
                aria-label={`打开 ${entry.name}`}
                onClick={() => onOpenFile(entry.path)}
              >
                <span className="workspace-tree-file-spacer" />
                <FileIcon name={entry.name} />
                <span title={entry.name}>{entry.name}</span>
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
