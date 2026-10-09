import { BookOpen, GitBranch, Plus } from "lucide-react";
import type { FormEvent } from "react";
import type { ConnectorDto } from "../../../shared/business";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

export function ResourceDialog({
  type,
  name,
  locator,
  connectorId,
  connectors,
  error,
  submitting,
  onNameChange,
  onLocatorChange,
  onConnectorChange,
  onClose,
  onSubmit,
}: {
  type: "document" | "repository";
  name: string;
  locator: string;
  connectorId: string;
  connectors: ConnectorDto[];
  error: string;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onLocatorChange: (value: string) => void;
  onConnectorChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}): JSX.Element {
  const { t } = useLocalization();
  const isDocument = type === "document";
  return (
    <Dialog
      open
      size="compact"
      locked={submitting}
      aria-labelledby="space-resource-dialog-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        className="space-resource-dialog-form"
        onSubmit={(event) => void onSubmit(event)}
      >
        <DialogHeader>
          {isDocument ? <BookOpen size={18} /> : <GitBranch size={18} />}
          <h2 id="space-resource-dialog-title">
            {t(
              isDocument
                ? "resources.document.add"
                : "resources.repository.connect",
            )}
          </h2>
        </DialogHeader>
        <DialogBody className="space-resource-dialog__body">
        <Field name="resources-name" label={t("resources.name")}>
          <input
            data-autofocus
            aria-label={t("resources.name")}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </Field>
        {isDocument ? (
          <Field name="resources-connector" label={t("resources.connector")}>
            <select
              aria-label={t("resources.connector")}
              value={connectorId}
              onChange={(event) => onConnectorChange(event.target.value)}
            >
              {connectors.map(({ connector }) => (
                <option key={connector.id} value={connector.id}>
                  {connector.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field name="resource-dialog-locator"
          label={t(
            isDocument
              ? "resources.document.path"
              : "resources.repository.address",
          )}
        >
          <input
            aria-label={t(
              isDocument
                ? "resources.document.path"
                : "resources.repository.address",
            )}
            value={locator}
            placeholder={isDocument ? "/documents/brief" : "https://"}
            onChange={(event) => onLocatorChange(event.target.value)}
          />
        </Field>
        {error ? <p role="alert">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={submitting} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            leadingIcon={<Plus size={14} />}
            disabled={
              submitting ||
              !name.trim() ||
              !locator.trim() ||
              (isDocument && !connectorId)
            }
          >
            {t(submitting ? "resources.syncing" : "resources.confirmAdd")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
