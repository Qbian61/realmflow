import { RotateCcw, X } from 'lucide-react'
import { useLocalization } from '../../localization/LocalizationProvider'
import {
  Button,
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton
} from '../../components/ui'

export type RecentlyDeletedItem = {
  id: string
  name: string
  deletedAt: number
}

export function RecentlyDeletedDialog({
  items,
  loading,
  restoringId,
  onClose,
  onRestore
}: {
  items: RecentlyDeletedItem[]
  loading: boolean
  restoringId?: string
  onClose: () => void
  onRestore: (id: string) => void
}): JSX.Element {
  const { t, locale } = useLocalization()

  return (
    <Dialog
      open
      size="compact"
      aria-label={t('workbenchHub.recentlyDeleted')}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <>
        <DialogHeader>
          <strong>{t('workbenchHub.recentlyDeleted')}</strong>
          <IconButton
            data-autofocus
            aria-label={t('workbenchHub.close')}
            title={t('workbenchHub.close')}
            variant="ghost"
            onClick={onClose}
          >
            <X size={16} />
          </IconButton>
        </DialogHeader>
        <DialogBody className="workbench-recently-deleted-list">
          {loading ? (
            <p>{t('common.loading')}</p>
          ) : items.length === 0 ? (
            <p>{t('workbenchHub.recentlyDeletedEmpty')}</p>
          ) : (
            items.map((item) => (
              <div key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>{formatDeletedAt(item.deletedAt, locale)}</small>
                </span>
                <Button
                  size="compact"
                  disabled={restoringId !== undefined}
                  aria-label={t('workbenchHub.restoreNamed', {
                    name: item.name
                  })}
                  onClick={() => onRestore(item.id)}
                >
                  <RotateCcw size={14} />
                  {t('workbenchHub.restore')}
                </Button>
              </div>
            ))
          )}
        </DialogBody>
      </>
    </Dialog>
  )
}

function formatDeletedAt(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}
