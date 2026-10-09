import { BookOpen, X } from "lucide-react";
import type { OnlineDocumentSnapshotViewDto } from "../../../shared/business";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

type OnlineDocumentSnapshotDialogProps = {
  name: string;
  view: OnlineDocumentSnapshotViewDto;
  onClose: () => void;
};

export function OnlineDocumentSnapshotDialog({
  name,
  view,
  onClose,
}: OnlineDocumentSnapshotDialogProps): JSX.Element {
  const { t } = useLocalization();

  return (
    <Dialog
      open
      size="wide"
      className="online-document-preview"
      aria-labelledby="online-document-preview-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogHeader>
        <div>
          <BookOpen size={17} />
          <span>
            <h2 id="online-document-preview-title">{name}</h2>
            <small>{view.document.path}</small>
          </span>
        </div>
        <IconButton
          aria-label={t("resources.documentPreview.close")}
          title={t("resources.documentPreview.close")}
          variant="ghost"
          size="compact"
          onClick={onClose}
        >
          <X size={16} />
        </IconButton>
      </DialogHeader>
      <DialogBody className="online-document-preview__body">
        {view.snapshot ? (
          <>
            <div className="online-document-preview-meta">
              <span>
                {t("resources.documentPreview.version", {
                  version: view.snapshot.version,
                })}
              </span>
              <span>{view.snapshot.mediaType}</span>
              <span>{view.snapshot.byteSize} bytes</span>
            </div>
            <pre>{view.snapshot.content}</pre>
          </>
        ) : (
          <div className="space-empty-block">
            <BookOpen size={20} />
            <strong>{t("resources.documentPreview.empty")}</strong>
            <span>{t("resources.documentPreview.emptyDescription")}</span>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
