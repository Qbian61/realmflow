import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ArrowLeftRight,
  ChevronRight,
  CircleHelp,
  DatabaseBackup,
  FolderHeart,
  Globe2,
  HardDrive,
  LogOut,
  Palette,
  RefreshCw,
  Settings
} from 'lucide-react'
import type { SidecarStatus } from '../../../shared/types'

export function WorkspaceUserMenu(): JSX.Element {
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>('starting')
  const [open, setOpen] = useState(false)
  const userAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refreshStatus = (): void => {
      void window.realmflow?.getSidecarStatus().then(setSidecarStatus)
    }
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!userAreaRef.current?.contains(event.target as Node)) setOpen(false)
    }

    refreshStatus()
    const interval = window.setInterval(refreshStatus, 1000)
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [])

  return (
    <div className="user-area" ref={userAreaRef}>
      {open && (
        <div className="user-menu" role="menu" aria-label="用户菜单">
          <div className="user-menu-group">
            <MenuLink to="/settings" icon={<Settings size={17} />} onClose={() => setOpen(false)}>
              设置
            </MenuLink>
            <MenuLink
              to="/settings/appearance"
              icon={<Palette size={17} />}
              onClose={() => setOpen(false)}
              trailing
            >
              外观设置
            </MenuLink>
            <MenuLink
              to="/favorites"
              icon={<FolderHeart size={17} />}
              onClose={() => setOpen(false)}
            >
              收藏夹
            </MenuLink>
          </div>
          <div className="user-menu-group">
            <a href="https://realmflow.dev" target="_blank" rel="noreferrer" role="menuitem">
              <Globe2 size={17} />
              <span>RealmFlow 官网</span>
            </a>
            <MenuLink
              to="/updates"
              icon={<RefreshCw size={17} />}
              onClose={() => setOpen(false)}
            >
              检查更新
            </MenuLink>
            <MenuLink
              to="/feedback"
              icon={<CircleHelp size={17} />}
              onClose={() => setOpen(false)}
            >
              帮助与反馈
            </MenuLink>
          </div>
          <div className="user-menu-group">
            <MenuLink
              to="/settings/storage"
              icon={<HardDrive size={17} />}
              onClose={() => setOpen(false)}
            >
              存储状态
            </MenuLink>
            <MenuLink
              to="/settings/backup"
              icon={<DatabaseBackup size={17} />}
              onClose={() => setOpen(false)}
            >
              数据备份
            </MenuLink>
          </div>
          <div className="user-menu-group">
            <MenuLink
              to="/"
              icon={<ArrowLeftRight size={17} />}
              onClose={() => setOpen(false)}
              trailing
            >
              切换工作空间
            </MenuLink>
            <button
              className="danger-item"
              type="button"
              role="menuitem"
              onClick={() => void window.realmflow?.quitApp()}
            >
              <LogOut size={17} />
              <span>退出</span>
            </button>
          </div>
        </div>
      )}
      <button
        className="user-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="avatar">Q</span>
        <span className="user-copy">
          <strong>Qbian61</strong>
          <small>
            <i data-status={sidecarStatus} />
            本地版 · 免费
          </small>
        </span>
        <ChevronRight className="user-chevron" size={16} />
      </button>
    </div>
  )
}

function MenuLink({
  to,
  icon,
  children,
  onClose,
  trailing = false
}: {
  to: string
  icon: JSX.Element
  children: string
  onClose: () => void
  trailing?: boolean
}): JSX.Element {
  return (
    <NavLink to={to} role="menuitem" onClick={onClose}>
      {icon}
      <span>{children}</span>
      {trailing && <ChevronRight className="menu-chevron" size={15} />}
    </NavLink>
  )
}
