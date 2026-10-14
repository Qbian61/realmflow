import { X } from "lucide-react";
import type { SpaceResource } from "../../domain/space-resource";
import {
  Button,
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { KnowledgeResourceStatusSummary } from "./KnowledgeResourceStatusSummary";
import {
  KnowledgeIndexJobDetails,
  type KnowledgeIndexJobDetailsProps,
} from "./KnowledgeIndexJobDialog";
import {
  getResourceDisplayType,
  resourceDisplayTypeLabelKeys,
} from "./resource-display-type";
import { getResourceIcon } from "./resource-presentation";

type ResourceDetailIndexJob = Pick<
  KnowledgeIndexJobDetailsProps,
  "name" | "view" | "loading" | "error"
>;

export function ResourceDetailDialog({
  resource,
  loading,
  indexJob,
  onRetryIndexJob,
  onOpen,
  onClose,
}: {
  resource: SpaceResource;
  loading: boolean;
  indexJob?: ResourceDetailIndexJob;
  onRetryIndexJob: () => void;
  onOpen: (resource: SpaceResource) => Promise<void>;
  onClose: () => void;
}): JSX.Element {
  const { t } = useLocalization();
  const ResourceIcon = getResourceIcon(resource);

  return (
    <Dialog
      open
      className="space-resource-detail-dialog"
      aria-labelledby="space-resource-detail-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogHeader className="space-resource-detail-header">
        <div>
          <ResourceIcon size={17} aria-hidden="true" />
          <span>
            <h2 id="space-resource-detail-title">{resource.name}</h2>
            <small>
              {t(resourceDisplayTypeLabelKeys[getResourceDisplayType(resource)])}
            </small>
          </span>
        </div>
        <IconButton
          aria-label={t("resources.detail.close")}
          title={t("resources.detail.close")}
          variant="ghost"
          size="compact"
          onClick={onClose}
        >
          <X size={16} />
        </IconButton>
      </DialogHeader>
      <DialogBody className="space-resource-detail-body">
        <Button
          className="space-resource-detail-open"
          variant="ghost"
          leadingIcon={<ResourceIcon size={14} />}
          loading={loading}
          aria-label={t("resources.detail.openInWorkbench", {
            name: resource.name,
          })}
          onClick={() => void onOpen(resource)}
        >
          {resource.name}
        </Button>
        <KnowledgeResourceStatusSummary resource={resource} />
        {indexJob ? (
          <KnowledgeIndexJobDetails
            {...indexJob}
            className="space-resource-index-job"
            showHeading
            onRetry={onRetryIndexJob}
          />
        ) : null}
      </DialogBody>
    </Dialog>
  );
}
