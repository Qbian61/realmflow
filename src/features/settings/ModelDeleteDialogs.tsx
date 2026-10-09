import { X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  IconButton
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { ProfileRecord, ProviderRecord } from './ModelEditors'

type DeleteDialogProps = {
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ProviderDeleteDialog({
  provider,
  saving,
  onClose,
  onConfirm
}: DeleteDialogProps & { provider: ProviderRecord }): JSX.Element {
  const { t } = useLocalization()
  return (
    <Dialog
      open
      size="compact"
      locked={saving}
      aria-labelledby="provider-delete-title"
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <div className="model-confirm-dialog">
        <DialogHeader>
          <h2 id="provider-delete-title">
            {t('settings.delete.provider.title')}
          </h2>
          <IconButton
            aria-label={t('common.close')}
            title={t('common.close')}
            variant="ghost"
            disabled={saving}
            onClick={onClose}
          >
            <X size={17} />
          </IconButton>
        </DialogHeader>
        <DialogBody>
          <p>
            {t('settings.delete.provider.confirm', { name: provider.name })}
          </p>
        </DialogBody>
        <DeleteDialogActions
          saving={saving}
          onClose={onClose}
          onConfirm={onConfirm}
          confirmLabel={t('settings.delete.provider.action')}
        />
      </div>
    </Dialog>
  )
}

export function ProfileDeleteDialog({
  profile,
  saving,
  onClose,
  onConfirm
}: DeleteDialogProps & { profile: ProfileRecord }): JSX.Element {
  const { t } = useLocalization()
  return (
    <Dialog
      open
      size="compact"
      locked={saving}
      aria-labelledby="profile-delete-title"
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <div className="model-confirm-dialog">
        <DialogHeader>
          <h2 id="profile-delete-title">
            {t('settings.delete.profile.title')}
          </h2>
          <IconButton
            aria-label={t('common.close')}
            title={t('common.close')}
            variant="ghost"
            disabled={saving}
            onClick={onClose}
          >
            <X size={17} />
          </IconButton>
        </DialogHeader>
        <DialogBody>
          <p>
            {t('settings.delete.profile.confirm', {
              name: profile.displayName
            })}
          </p>
        </DialogBody>
        <DeleteDialogActions
          saving={saving}
          onClose={onClose}
          onConfirm={onConfirm}
          confirmLabel={t('settings.delete.profile.action')}
        />
      </div>
    </Dialog>
  )
}

function DeleteDialogActions({
  saving,
  onClose,
  onConfirm,
  confirmLabel
}: DeleteDialogProps & { confirmLabel: string }): JSX.Element {
  const { t } = useLocalization()
  return (
    <DialogFooter>
      <Button type="button" disabled={saving} onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        variant="danger"
        loading={saving}
        disabled={saving}
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </DialogFooter>
  )
}
