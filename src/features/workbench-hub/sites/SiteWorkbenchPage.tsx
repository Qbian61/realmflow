import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Pencil,
  Trash2
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchAttachmentApi } from '../../../../shared/workbench-attachments'
import type {
  WorkbenchSite,
  WorkbenchSiteApi,
  WorkbenchSiteGroup,
  WorkbenchSitesSnapshot
} from '../../../../shared/workbench-sites'
import {
  Card,
  ConfirmDialog
} from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'
import { useOptionalWorkbench } from '../../workbench/WorkbenchProvider'
import {
  beginNativeDrag,
  finishNativeDrag
} from '../../drag/native-drag-feedback'
import { DragHandle } from '../../drag/DragHandle'
import { WorkbenchNavigationItem } from '../WorkbenchNavigationItem'
import { WorkbenchSplitPage } from '../WorkbenchSplitPage'
import { SiteDrawer, type SiteDraft } from './SiteDrawer'
import { SiteGroupNameInput } from './SiteGroupNameInput'

type SiteWorkbenchPageProps = {
  sitesApi?: WorkbenchSiteApi
  attachmentsApi?: WorkbenchAttachmentApi
  openEmbedded?: (url: string) => void | Promise<void>
  openExternal?: (url: string) => void | Promise<void>
}
export function SiteWorkbenchPage({
  sitesApi = window.realmflow?.workbenchHub?.sites,
  attachmentsApi = window.realmflow?.workbenchHub?.attachments,
  openEmbedded,
  openExternal
}: SiteWorkbenchPageProps): JSX.Element {
  const { t } = useLocalization()
  const workbench = useOptionalWorkbench()
  const [snapshot, setSnapshot] = useState<WorkbenchSitesSnapshot>({
    groups: [],
    sites: []
  })
  const [selectedGroupId, setSelectedGroupId] = useState<string>()
  const [drawerSite, setDrawerSite] = useState<WorkbenchSite | 'new'>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [renamingGroupId, setRenamingGroupId] = useState<string>()
  const [deleteGroup, setDeleteGroup] = useState<WorkbenchSiteGroup>()
  const [deleteSite, setDeleteSite] = useState<WorkbenchSite>()
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({})
  const [failedIconIds, setFailedIconIds] = useState<Set<string>>(new Set())
  const [draggedGroupId, setDraggedGroupId] = useState<string>()
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string>()
  const deleteFocusRef = useRef<HTMLElement>()
  const groupButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const siteButtonRefs = useRef(new Map<string, HTMLButtonElement>())

  const load = async (): Promise<void> => {
    if (!sitesApi) return
    try {
      const next = await sitesApi.getSnapshot()
      setSnapshot(next)
      setSelectedGroupId((current) =>
        next.groups.some(({ id }) => id === current)
          ? current
          : next.groups[0]?.id
      )
      setError(false)
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    void load()
  }, [sitesApi])

  useEffect(() => {
    if (!attachmentsApi) return
    let active = true
    const icons = snapshot.sites
      .map(({ iconAttachmentId }) => iconAttachmentId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => !iconUrls[id])
    void Promise.all(icons.map(async (id) => {
      try {
        return { id, url: await attachmentsApi.readImage(id) }
      } catch {
        return { id }
      }
    })).then((results) => {
      if (active && results.length > 0) {
        const entries = results
          .filter((result): result is { id: string; url: string } =>
            Boolean(result.url)
          )
          .map(({ id, url }) => [id, url] as const)
        setIconUrls((current) => ({
          ...current,
          ...Object.fromEntries(entries)
        }))
        setFailedIconIds((current) => {
          const next = new Set(current)
          for (const result of results) {
            if (result.url) next.delete(result.id)
            else next.add(result.id)
          }
          return next
        })
      }
    })
    return () => {
      active = false
    }
  }, [attachmentsApi, iconUrls, snapshot.sites])

  const visibleSites = snapshot.sites
    .filter(({ groupId }) => groupId === selectedGroupId)
    .sort((left, right) => left.position - right.position)

  const saveSite = async (draft: SiteDraft): Promise<void> => {
    if (!sitesApi || !drawerSite) return
    setSaving(true)
    setError(false)
    try {
      if (drawerSite === 'new') {
        const created = await sitesApi.createSite({
          requestId: requestId(),
          ...draft
        })
        setSnapshot((current) => withRecountedGroups({
          groups: current.groups,
          sites: [...current.sites, created]
        }))
      } else {
        const result = await sitesApi.updateSite({
          requestId: requestId(),
          siteId: drawerSite.id,
          expectedRevision: drawerSite.revision,
          ...draft
        })
        if (!result.ok) {
          await load()
          return
        }
        replaceSite(result.value)
      }
      setDrawerSite(undefined)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const pickIcon = async (site: WorkbenchSite): Promise<void> => {
    if (!attachmentsApi || !sitesApi) return
    setSaving(true)
    let attachmentId: string | undefined
    try {
      const attachment = await attachmentsApi.pickAndAttach({
        requestId: requestId(),
        ownerType: 'site_icon',
        ownerId: site.id,
        accept: 'image'
      })
      if (!attachment) return
      attachmentId = attachment.id
      const result = await sitesApi.updateSite({
        requestId: requestId(),
        siteId: site.id,
        expectedRevision: site.revision,
        iconAttachmentId: attachment.id
      })
      if (!result.ok) throw new Error('revision_conflict')
      replaceSite(result.value)
      setDrawerSite(result.value)
    } catch {
      if (attachmentId) {
        await attachmentsApi
          .delete({ requestId: requestId(), attachmentId })
          .catch(() => undefined)
      }
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const replaceSite = (site: WorkbenchSite): void => {
    setSnapshot((current) =>
      withRecountedGroups({
        groups: current.groups,
        sites: current.sites.map((item) => (item.id === site.id ? site : item))
      })
    )
  }

  const openSite = async (site: WorkbenchSite): Promise<void> => {
    if (site.openMode === 'external') {
      await (openExternal?.(site.url) ??
        window.realmflow?.webWorkbench.openExternal(site.url))
      return
    }
    await (openEmbedded?.(site.url) ?? workbench?.openUrl(site.url))
  }

  const createGroup = async (): Promise<void> => {
    if (!sitesApi || saving) return
    setSaving(true)
    try {
      const group = await sitesApi.createGroup({
        requestId: requestId(),
        name: t('workbenchSites.untitledGroup')
      })
      setSnapshot((current) => ({
        ...current,
        groups: [...current.groups, group]
      }))
      setSelectedGroupId(group.id)
      setRenamingGroupId(group.id)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const beginGroupRename = (group: WorkbenchSiteGroup): void => {
    setRenamingGroupId(group.id)
  }

  const commitGroupRename = async (
    group: WorkbenchSiteGroup, value: string
  ): Promise<void> => {
    const name = value.trim()
    if (!sitesApi || !name || name === group.name) {
      setRenamingGroupId(undefined)
      return
    }
    const result = await sitesApi.updateGroup({
      requestId: requestId(),
      groupId: group.id,
      expectedRevision: group.revision,
      name
    })
    if (result.ok) {
      setSnapshot((current) => ({
        ...current,
        groups: current.groups.map((item) =>
          item.id === result.value.id ? result.value : item
        )
      }))
    }
    setRenamingGroupId(undefined)
  }

  const confirmDeleteGroup = async (): Promise<void> => {
    if (!sitesApi || !deleteGroup) return
    const result = await sitesApi.deleteGroup({
      requestId: requestId(),
      groupId: deleteGroup.id,
      expectedRevision: deleteGroup.revision
    })
    if (result.ok) {
      await load()
      setTimeout(() => {
        const next = [...groupButtonRefs.current.values()].find(
          (button) => button.isConnected
        )
        next?.focus()
      }, 0)
    }
    setDeleteGroup(undefined)
  }

  const confirmDeleteSite = async (): Promise<void> => {
    if (!sitesApi || !deleteSite) return
    const result = await sitesApi.deleteSite({
      requestId: requestId(),
      siteId: deleteSite.id,
      expectedRevision: deleteSite.revision
    })
    if (result.ok) {
      const index = visibleSites.findIndex(({ id }) => id === deleteSite.id)
      const remaining = visibleSites.filter(({ id }) => id !== deleteSite.id)
      const focusTarget =
        remaining[Math.min(Math.max(index, 0), remaining.length - 1)]
      setSnapshot((current) =>
        withRecountedGroups({
          groups: current.groups,
          sites: current.sites.filter(({ id }) => id !== deleteSite.id)
        })
      )
      setTimeout(() => {
        const target = focusTarget
          ? siteButtonRefs.current.get(focusTarget.id)
          : groupButtonRefs.current.get(deleteSite.groupId)
        target?.focus()
      }, 0)
    }
    setDeleteSite(undefined)
  }

  const openDeleteConfirmation = (
    open: () => void
  ): void => {
    deleteFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined
    open()
  }

  const closeDeleteConfirmation = (): void => {
    setDeleteGroup(undefined)
    setDeleteSite(undefined)
    setTimeout(() => deleteFocusRef.current?.focus(), 0)
  }

  const moveGroupToIndex = async (
    source: WorkbenchSiteGroup,
    targetIndex: number
  ): Promise<void> => {
    if (!sitesApi) return
    const ordered = [...snapshot.groups].sort(
      (left, right) => left.position - right.position
    )
    const sourceIndex = ordered.findIndex(({ id }) => id === source.id)
    if (sourceIndex < 0 || sourceIndex === targetIndex) return
    const result = await sitesApi.updateGroup({
      requestId: requestId(),
      groupId: source.id,
      expectedRevision: source.revision,
      position: targetIndex
    })
    if (result.ok) await load()
  }

  const moveSite = async (
    site: WorkbenchSite,
    direction: -1 | 1
  ): Promise<void> => {
    if (!sitesApi) return
    const index = visibleSites.indexOf(site)
    const target = visibleSites[index + direction]
    if (!target) return
    const position =
      direction < 0
        ? Math.max(0, target.position - 1)
        : target.position + 1
    const result = await sitesApi.updateSite({
      requestId: requestId(),
      siteId: site.id,
      expectedRevision: site.revision,
      position
    })
    if (result.ok) replaceSite(result.value)
  }

  return (
    <WorkbenchSplitPage
      createLabel={t('workbenchSites.createGroup')}
      createIconOnly
      onCreate={() => void createGroup()}
      floatingActionLabel={
        snapshot.groups.length > 0
          ? t('workbenchSites.createSite')
          : undefined
      }
      onFloatingAction={
        snapshot.groups.length > 0
          ? () => setDrawerSite('new')
          : undefined
      }
      navigation={<div className="workbench-site-group-list">
        {snapshot.groups.map((group, index) => (
        <WorkbenchNavigationItem
          key={group.id}
          className="workbench-site-group-row"
          active={group.id === selectedGroupId}
          editing={renamingGroupId === group.id}
          dragging={draggedGroupId === group.id}
          dropTarget={dropTargetGroupId === group.id}
          primary={renamingGroupId === group.id ? (
            <SiteGroupNameInput
              label={t('workbenchSites.renameGroup', {
                name: group.name
              })}
              name={group.name}
              onCommit={(name) => void commitGroupRename(group, name)}
              onCancel={() => setRenamingGroupId(undefined)}
            />
          ) : (
            <button
              ref={(node) => {
                if (node) groupButtonRefs.current.set(group.id, node)
                else groupButtonRefs.current.delete(group.id)
              }}
              type="button"
              aria-label={`${group.name} (${group.siteCount})`}
              onClick={() => setSelectedGroupId(group.id)}
              onDoubleClick={() =>
                beginGroupRename(group)
              }
            >
              <span>{group.name}</span>
            </button>
          )}
          actions={
            <>
              <DragHandle
                name={group.name}
                draggable
                onDragStart={(event) => {
                  beginNativeDrag(
                    event,
                    event.currentTarget.closest(
                      '.workbench-navigation-item'
                    )!
                  )
                  setDraggedGroupId(group.id)
                }}
                onDragEnd={(event) => {
                  finishNativeDrag(
                    event.currentTarget.closest<HTMLElement>(
                      '.workbench-navigation-item'
                    )
                  )
                  setDraggedGroupId(undefined)
                  setDropTargetGroupId(undefined)
                }}
              />
            <IconButton
              className="danger"
              label={t('workbenchSites.deleteGroup', { name: group.name })}
              title={t('tooltip.delete')}
              onClick={() =>
                openDeleteConfirmation(() => setDeleteGroup(group))
              }
            >
              <Trash2 size={13} />
            </IconButton>
            </>
          }
          onDragOver={(event) => {
            event.preventDefault()
            setDropTargetGroupId(group.id)
          }}
          onDrop={(event) => {
            event.preventDefault()
            const source = snapshot.groups.find(
              ({ id }) => id === draggedGroupId
            )
            finishNativeDrag(
              event.currentTarget.parentElement?.querySelector(
                '[data-dragging="true"]'
              )
            )
            setDraggedGroupId(undefined)
            setDropTargetGroupId(undefined)
            if (source) void moveGroupToIndex(source, index)
          }}
        />
      ))}
      </div>}
    >
      <section className="workbench-site-page">
        {error ? (
          <div role="alert" className="workbench-site-error">
            {t('workbenchSites.failed')}
            {snapshot.groups.length > 0 ? (
              <span className="workbench-stale-note">
                {t('workbenchHub.stale')}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="workbench-site-grid">
          {visibleSites.map((site) => (
            <Card
              as="article"
              density="compact"
              interactive
              key={site.id}
              className="workbench-site-card"
            >
              <button
                ref={(node) => {
                  if (node) siteButtonRefs.current.set(site.id, node)
                  else siteButtonRefs.current.delete(site.id)
                }}
                type="button"
                className="workbench-site-card-open"
                aria-label={t('workbenchSites.open', { name: site.name })}
                onClick={() => void openSite(site)}
              >
                {site.iconAttachmentId &&
                iconUrls[site.iconAttachmentId] &&
                !failedIconIds.has(site.iconAttachmentId) ? (
                  <img
                    src={iconUrls[site.iconAttachmentId]}
                    alt={site.name}
                    width={32}
                    height={32}
                    loading="lazy"
                    decoding="async"
                    onError={() =>
                      setFailedIconIds((current) => {
                        const next = new Set(current)
                        next.add(site.iconAttachmentId!)
                        return next
                      })
                    }
                  />
                ) : (
                  <span className="workbench-site-card-fallback">
                    {Array.from(site.name)[0]?.toUpperCase()}
                  </span>
                )}
                <span>
                  <strong>{site.name}</strong>
                  <small>{new URL(site.url).hostname}</small>
                </span>
                {site.openMode === 'external' ? (
                  <ExternalLink size={14} />
                ) : null}
              </button>
              <div className="workbench-site-card-actions">
                <IconButton
                  label={t('workbenchSites.moveUp', { name: site.name })}
                  title={t('tooltip.moveUp')}
                  onClick={() => void moveSite(site, -1)}
                >
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton
                  label={t('workbenchSites.moveDown', { name: site.name })}
                  title={t('tooltip.moveDown')}
                  onClick={() => void moveSite(site, 1)}
                >
                  <ArrowDown size={14} />
                </IconButton>
                <IconButton
                  label={t('workbenchSites.edit', { name: site.name })}
                  title={t('tooltip.edit')}
                  onClick={() => setDrawerSite(site)}
                >
                  <Pencil size={14} />
                </IconButton>
                <IconButton
                  label={t('workbenchSites.delete', { name: site.name })}
                  title={t('tooltip.delete')}
                  onClick={() =>
                    openDeleteConfirmation(() => setDeleteSite(site))
                  }
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </Card>
          ))}
        </div>
      </section>
      {drawerSite ? (
        <SiteDrawer
          groups={snapshot.groups}
          site={drawerSite === 'new' ? undefined : drawerSite}
          saving={saving}
          onClose={() => setDrawerSite(undefined)}
          onSave={saveSite}
          onPickIcon={pickIcon}
        />
      ) : null}
      {deleteGroup || deleteSite ? (
        <ConfirmDialog
          open
          title={t(
            deleteGroup
              ? 'workbenchSites.deleteGroupTitle'
              : 'workbenchSites.deleteSiteTitle'
          )}
          description={t(
            deleteGroup
              ? 'workbenchSites.deleteGroupMessage'
              : 'workbenchSites.deleteSiteMessage'
          )}
          confirmLabel={t('workbenchSites.deleteAction')}
          cancelLabel={t('workbenchSites.cancel')}
          onCancel={closeDeleteConfirmation}
          onConfirm={() =>
            deleteGroup ? confirmDeleteGroup() : confirmDeleteSite()
          }
        />
      ) : null}
    </WorkbenchSplitPage>
  )
}

function IconButton({
  className,
  label,
  title,
  children,
  onClick
}: {
  className?: string
  label: string
  title: string
  children: React.ReactNode
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function withRecountedGroups(
  snapshot: WorkbenchSitesSnapshot
): WorkbenchSitesSnapshot {
  return {
    ...snapshot,
    groups: snapshot.groups.map((group) => ({
      ...group,
      siteCount: snapshot.sites.filter(({ groupId }) => groupId === group.id)
        .length
    }))
  }
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `site-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
