import type { CapabilityImportProposalDto } from '../../../shared/capability-catalog'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'

type CapabilityImportDialogProps = {
  proposal: CapabilityImportProposalDto
  installing: boolean
  onCancel: () => void
  onInstall: () => void
}

export function CapabilityImportDialog({
  proposal,
  installing,
  onCancel,
  onInstall
}: CapabilityImportDialogProps): JSX.Element {
  const { t } = useLocalization()
  const { definition, validationReport } = proposal

  return (
    <Dialog
      open
      size="default"
      className="capability-import-dialog"
      aria-labelledby="capability-import-title"
      locked={installing}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogHeader>
        <div>
          <h2 id="capability-import-title">
            {t('capabilities.importProposal.title')}
          </h2>
          <p>{proposal.source.displayName}</p>
        </div>
        <span className="capability-import-kind">{definition.kind}</span>
      </DialogHeader>

      <DialogBody>
        <div className="capability-import-summary">
          <strong>{definition.name}</strong>
          <span>v{definition.version}</span>
          <p>{definition.description}</p>
        </div>

        <dl className="capability-import-details">
          <div>
            <dt>{t('capabilities.importProposal.scope')}</dt>
            <dd>{t('capabilities.importProposal.global')}</dd>
          </div>
          <div>
            <dt>{t('capabilities.importProposal.permissions')}</dt>
            <dd>{definition.permissions.maximumRisk}</dd>
          </div>
          <div>
            <dt>{t('capabilities.importProposal.dependencies')}</dt>
            <dd>{validationReport.dependencyStatus}</dd>
          </div>
          <div>
            <dt>{t('capabilities.importProposal.tests')}</dt>
            <dd>
              {validationReport.tests.length}{' '}
              {t('capabilities.importProposal.passed')}
            </dd>
          </div>
        </dl>

        <p className="capability-import-notice">
          {t('capabilities.importProposal.disabledNotice')}
        </p>
      </DialogBody>

      <DialogFooter>
        <Button onClick={onCancel} disabled={installing}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={onInstall}
          loading={installing}
        >
          {installing
            ? t('capabilities.importProposal.installing')
            : t('capabilities.importProposal.install')}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
