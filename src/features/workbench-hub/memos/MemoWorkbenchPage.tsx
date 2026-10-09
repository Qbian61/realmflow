import { Trash2, X } from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType
} from 'react'
import type {
  WorkbenchMemo,
  WorkbenchMemoApi,
  WorkbenchMemoDocument
} from '../../../../shared/workbench-memos'
import { createEmptyWorkbenchMemoDocument } from '../../../../shared/workbench-memos'
import type { WorkbenchAttachmentApi } from '../../../../shared/workbench-attachments'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  IconButton,
  InlineAlert
} from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'
import {
  beginNativeDrag,
  finishNativeDrag
} from '../../drag/native-drag-feedback'
import { DragHandle } from '../../drag/DragHandle'
import { WorkbenchSplitPage } from '../WorkbenchSplitPage'
import { WorkbenchNavigationItem } from '../WorkbenchNavigationItem'

const LazyMemoEditorSurface = lazy(() => import('./MemoEditorSurface'))

export type MemoEditorSurfaceProps = {
  memoId: string
  document: WorkbenchMemoDocument
  attachmentsApi?: WorkbenchAttachmentApi
  onChange: (document: WorkbenchMemoDocument) => void
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type MemoWorkbenchPageProps = {
  memosApi?: WorkbenchMemoApi
  attachmentsApi?: WorkbenchAttachmentApi
  EditorSurface?: ComponentType<MemoEditorSurfaceProps>
}

export function MemoWorkbenchPage({
  memosApi = window.realmflow?.workbenchHub?.memos,
  attachmentsApi = window.realmflow?.workbenchHub?.attachments,
  EditorSurface
}: MemoWorkbenchPageProps): JSX.Element {
  const { t, locale } = useLocalization()
  const [memos, setMemos] = useState<WorkbenchMemo[]>([])
  const [activeMemoId, setActiveMemoId] = useState<string>()
  const [document, setDocument] = useState<WorkbenchMemoDocument>(
    createEmptyWorkbenchMemoDocument
  )
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [loadingMemos, setLoadingMemos] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [renamingId, setRenamingId] = useState<string>()
  const [renameValue, setRenameValue] = useState('')
  const [deleteMemo, setDeleteMemo] = useState<WorkbenchMemo>()
  const [creating, setCreating] = useState(false)
  const [draggedMemoId, setDraggedMemoId] = useState<string>()
  const [dropTargetMemoId, setDropTargetMemoId] = useState<string>()
  const activeIdRef = useRef<string>()
  const revisionRef = useRef(0)
  const documentRef = useRef(document)
  const pendingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const inFlightRef = useRef<Promise<void>>()
  const localDraftsRef = useRef(new Map<string, WorkbenchMemoDocument>())
  const memoButtonRefs = useRef(new Map<string, HTMLButtonElement>())

  const activeMemo = useMemo(
    () => memos.find(({ id }) => id === activeMemoId),
    [activeMemoId, memos]
  )

  const savePending = async (): Promise<void> => {
    if (!memosApi || !activeIdRef.current || !pendingRef.current) return
    if (inFlightRef.current) {
      await inFlightRef.current
      if (!pendingRef.current || status === 'error') return
    }
    const memoId = activeIdRef.current
    const snapshot = documentRef.current
    const expectedRevision = revisionRef.current
    pendingRef.current = false
    setStatus('saving')
    const operation = (async () => {
      try {
        const result = await memosApi.updateMemo({
          requestId: requestId(),
          memoId,
          expectedRevision,
          document: snapshot
        })
        if (!result.ok) {
          revisionRef.current = result.currentRevision
          pendingRef.current = true
          setStatus('error')
          return
        }
        revisionRef.current = result.value.revision
        setMemos((current) =>
          current.map((memo) =>
            memo.id === result.value.id ? result.value : memo
          )
        )
        if (documentRef.current === snapshot) {
          localDraftsRef.current.delete(memoId)
          setStatus('saved')
        } else {
          pendingRef.current = true
          setStatus('saving')
        }
      } catch {
        pendingRef.current = true
        setStatus('error')
      }
    })()
    inFlightRef.current = operation
    await operation
    if (inFlightRef.current === operation) inFlightRef.current = undefined
    if (pendingRef.current && documentRef.current !== snapshot && status !== 'error') {
      await savePending()
    }
  }

  const flush = async (): Promise<void> => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = undefined
    if (inFlightRef.current) await inFlightRef.current
    await savePending()
  }

  useEffect(() => {
    const handleBlur = () => void flush()
    const handleBeforeUnload = () => void flush()
    window.addEventListener('blur', handleBlur)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      void flush()
    }
  }, [memosApi])

  const selectMemoState = useCallback((memo: WorkbenchMemo): void => {
    const draft = localDraftsRef.current.get(memo.id) ?? memo.document
    activeIdRef.current = memo.id
    revisionRef.current = memo.revision
    documentRef.current = draft
    setActiveMemoId(memo.id)
    setDocument(draft)
    setStatus(localDraftsRef.current.has(memo.id) ? 'error' : 'idle')
  }, [])

  const loadMemos = useCallback(async (): Promise<void> => {
    if (!memosApi) return
    setLoadingMemos(true)
    try {
      const items = await memosApi.getMemos()
      setMemos(items)
      const current =
        items.find(({ id }) => id === activeIdRef.current) ?? items[0]
      if (current) selectMemoState(current)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoadingMemos(false)
    }
  }, [memosApi, selectMemoState])

  useEffect(() => {
    void loadMemos()
  }, [loadMemos])

  const switchMemo = async (memo: WorkbenchMemo): Promise<void> => {
    if (memo.id === activeIdRef.current) return
    await flush()
    selectMemoState(memo)
  }

  const changeDocument = (next: WorkbenchMemoDocument): void => {
    const memoId = activeIdRef.current
    if (!memoId) return
    documentRef.current = next
    localDraftsRef.current.set(memoId, next)
    pendingRef.current = true
    setDocument(next)
    setStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined
      void savePending()
    }, 600)
  }

  const createMemo = async (): Promise<void> => {
    if (!memosApi || creating) return
    await flush()
    setCreating(true)
    try {
      const memo = await memosApi.createMemo({
        requestId: requestId(),
        title: t('workbenchHub.memo.untitled'),
        document: createEmptyWorkbenchMemoDocument()
      })
      setMemos((current) => [...current, memo])
      selectMemoState(memo)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setCreating(false)
    }
  }

  const beginRename = (memo: WorkbenchMemo): void => {
    setRenamingId(memo.id)
    setRenameValue(memo.title)
  }

  const commitRename = async (memo: WorkbenchMemo): Promise<void> => {
    if (!memosApi || !renameValue.trim() || renameValue.trim() === memo.title) {
      setRenamingId(undefined)
      return
    }
    const result = await memosApi.updateMemo({
      requestId: requestId(),
      memoId: memo.id,
      expectedRevision: memo.revision,
      title: renameValue.trim()
    })
    if (result.ok) {
      setMemos((current) =>
        current.map((item) => (item.id === memo.id ? result.value : item))
      )
      if (memo.id === activeIdRef.current) {
        revisionRef.current = result.value.revision
      }
    } else if (memo.id === activeIdRef.current) {
      revisionRef.current = result.currentRevision
      setStatus('error')
    }
    setRenamingId(undefined)
  }

  const confirmDelete = async (): Promise<void> => {
    if (!memosApi || !deleteMemo) return
    const result = await memosApi.deleteMemo({
      requestId: requestId(),
      memoId: deleteMemo.id,
      expectedRevision: deleteMemo.revision
    })
    if (result.ok) {
      const deletedIndex = memos.findIndex(({ id }) => id === deleteMemo.id)
      const remaining = memos.filter(({ id }) => id !== deleteMemo.id)
      const focusTarget =
        remaining[Math.min(Math.max(deletedIndex, 0), remaining.length - 1)]
      setMemos(remaining)
      localDraftsRef.current.delete(deleteMemo.id)
      if (activeIdRef.current === deleteMemo.id) {
        const next = remaining[0]
        if (next) selectMemoState(next)
        else {
          activeIdRef.current = undefined
          setActiveMemoId(undefined)
        }
      }
      if (focusTarget) {
        setTimeout(() => memoButtonRefs.current.get(focusTarget.id)?.focus(), 0)
      }
    }
    setDeleteMemo(undefined)
  }

  const moveMemoToIndex = async (
    source: WorkbenchMemo,
    targetIndex: number
  ): Promise<void> => {
    const sourceIndex = memos.findIndex(({ id }) => id === source.id)
    if (!memosApi || sourceIndex < 0 || sourceIndex === targetIndex) return
    const result = await memosApi.updateMemo({
      requestId: requestId(),
      memoId: source.id,
      expectedRevision: source.revision,
      position: targetIndex
    })
    if (!result.ok) {
      setStatus('error')
      return
    }
    const items = await memosApi.getMemos()
    setMemos(items)
  }

  const Editor = EditorSurface ?? LazyMemoEditorSurface
  return (
    <WorkbenchSplitPage
      navigation={
        <div className="workbench-memo-navigation">
          <div className="workbench-memo-list">
          {memos.map((memo, index) => (
            <WorkbenchNavigationItem
              key={memo.id}
              active={memo.id === activeMemoId}
              editing={renamingId === memo.id}
              dragging={draggedMemoId === memo.id}
              dropTarget={dropTargetMemoId === memo.id}
              primary={renamingId === memo.id ? (
                <input name="workbench-hub-memo-rename" autoComplete="off"
                  autoFocus
                  aria-label={t('workbenchHub.memo.rename')}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => void commitRename(memo)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitRename(memo)
                    if (event.key === 'Escape') setRenamingId(undefined)
                  }}
                />
              ) : (
                <button
                  type="button"
                  ref={(node) => {
                    if (node) memoButtonRefs.current.set(memo.id, node)
                    else memoButtonRefs.current.delete(memo.id)
                  }}
                  onClick={() => void switchMemo(memo)}
                  onDoubleClick={() => beginRename(memo)}
                  aria-label={`${memo.title} ${formatUpdatedAt(memo.updatedAt, locale)}`}
                >
                  <span>{memo.title}</span>
                </button>
              )}
              actions={
                <>
                <DragHandle
                  name={memo.title}
                  draggable
                  onDragStart={(event) => {
                    beginNativeDrag(
                      event,
                      event.currentTarget.closest(
                        '.workbench-navigation-item'
                      )!
                    )
                    setDraggedMemoId(memo.id)
                  }}
                  onDragEnd={(event) => {
                    finishNativeDrag(
                      event.currentTarget.closest<HTMLElement>(
                        '.workbench-navigation-item'
                      )
                    )
                    setDraggedMemoId(undefined)
                    setDropTargetMemoId(undefined)
                  }}
                />
                <button
                  type="button"
                  className="danger"
                  aria-label={t('workbenchHub.memo.deleteNamed', {
                    name: memo.title
                  })}
                  title={t('tooltip.delete')}
                  onClick={() => setDeleteMemo(memo)}
                >
                  <Trash2 size={13} />
                </button>
                </>
              }
              onDragOver={(event) => {
                event.preventDefault()
                setDropTargetMemoId(memo.id)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const source = memos.find(({ id }) => id === draggedMemoId)
                finishNativeDrag(
                  event.currentTarget.parentElement?.querySelector(
                    '[data-dragging="true"]'
                  )
                )
                setDraggedMemoId(undefined)
                setDropTargetMemoId(undefined)
                if (source) void moveMemoToIndex(source, index)
              }}
            />
          ))}
          </div>
        </div>
      }
      createLabel={t('workbenchHub.memo.create')}
      createIconOnly
      onCreate={() => void createMemo()}
    >
      <div className="workbench-memo-page">
        <div
          className="workbench-memo-content"
          data-has-alert={loadError || undefined}
        >
          {loadError ? (
            <InlineAlert
              className="workbench-memo-alert"
              tone="danger"
              role="alert"
              title={t('workbenchHub.memo.loadFailed')}
              actionLabel={t('common.retry')}
              actionLoading={loadingMemos}
              onAction={() => void loadMemos()}
            >
              {memos.length > 0 ? t('workbenchHub.stale') : null}
            </InlineAlert>
          ) : null}
          {activeMemo ? (
            <Suspense fallback={<div>{t('common.loading')}</div>}>
              <Editor
                memoId={activeMemo.id}
                document={document}
                attachmentsApi={attachmentsApi}
                onChange={changeDocument}
              />
            </Suspense>
          ) : (
            <div className="workbench-memo-empty">
              {t('workbenchHub.memo.empty')}
            </div>
          )}
        </div>
        {activeMemo ? (
          <div className="workbench-memo-save-state" data-status={status}>
            {status === 'saving'
              ? t('workbenchHub.memo.saving')
              : status === 'saved'
                ? t('workbenchHub.memo.saved')
                : status === 'error'
                  ? (
                      <>
                        <span>{t('workbenchHub.memo.saveFailed')}</span>
                        <button type="button" onClick={() => void savePending()}>
                          {t('workbenchHub.memo.retry')}
                        </button>
                      </>
                    )
                  : null}
          </div>
        ) : null}
      </div>
      {deleteMemo ? (
        <Dialog
          open
          size="compact"
          aria-label={t('workbenchHub.memo.delete')}
          onOpenChange={(open) => {
            if (!open) setDeleteMemo(undefined)
          }}
        >
          <DialogHeader>
            <strong>{t('workbenchHub.memo.delete')}</strong>
            <IconButton
              aria-label={t('common.close')}
              title={t('common.close')}
              variant="ghost"
              size="compact"
              onClick={() => setDeleteMemo(undefined)}
            >
              <X size={16} />
            </IconButton>
          </DialogHeader>
          <DialogBody>
            <p>{t('workbenchHub.memo.deleteConfirm', { name: deleteMemo.title })}</p>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setDeleteMemo(undefined)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              aria-label={t('workbenchHub.memo.confirmDelete')}
              onClick={() => void confirmDelete()}
            >
              {t('workbenchHub.memo.delete')}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </WorkbenchSplitPage>
  )
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `memo-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatUpdatedAt(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}
