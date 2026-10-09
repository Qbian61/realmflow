import type { FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
} from "../../components/ui";

export type WorkspaceNameDialogState =
  | { kind: "space" }
  | { kind: "requirement"; spacePath: string; spaceLabel: string }
  | { kind: "rename-space"; spacePath: string; spaceLabel: string }
  | {
      kind: "rename-requirement";
      spacePath: string;
      requirementId: string;
      requirementTitle: string;
    }
  | { kind: "delete-space"; spacePath: string; spaceLabel: string }
  | {
      kind: "delete-requirement";
      spacePath: string;
      requirementId: string;
      requirementTitle: string;
    };

type WorkspaceNameDialogProps = {
  dialog: WorkspaceNameDialogState;
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function WorkspaceNameDialog({
  dialog,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
}: WorkspaceNameDialogProps): JSX.Element {
  const { t } = useLocalization();
  const isDelete =
    dialog.kind === "delete-space" || dialog.kind === "delete-requirement";
  const isRename =
    dialog.kind === "rename-space" || dialog.kind === "rename-requirement";
  const inputLabel =
    dialog.kind === "space"
      ? t("workspace.name")
      : dialog.kind === "requirement"
        ? t("requirement.name")
        : isRename
          ? t("dialog.renameInput")
          : dialog.kind === "delete-space"
            ? t("workspace.deleteInput")
            : t("requirement.deleteInput");
  const title =
    dialog.kind === "space"
      ? t("workspace.createDialog")
      : dialog.kind === "requirement"
        ? t("requirement.createDialog")
        : dialog.kind === "rename-space"
          ? t("workspace.renameDialog")
          : dialog.kind === "rename-requirement"
            ? t("requirement.renameDialog")
            : dialog.kind === "delete-space"
              ? t("workspace.deleteDialog")
              : t("requirement.deleteDialog");

  return (
    <Dialog
      open
      size="compact"
      aria-labelledby="name-dialog-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        className="name-dialog-form"
        onSubmit={onSubmit}
      >
        <DialogHeader>
          <h2 id="name-dialog-title">{title}</h2>
        </DialogHeader>
        <DialogBody className="name-dialog-body">
          {isRename && (
            <p className="name-dialog-current">
              {t("workspace.currentName", {
                name:
                  dialog.kind === "rename-space"
                    ? dialog.spaceLabel
                    : dialog.requirementTitle,
              })}
            </p>
          )}
          {dialog.kind === "delete-space" && (
            <div className="name-dialog-warning">
              <TriangleAlert size={18} />
              <p>{t("workspace.deleteWarning", { name: dialog.spaceLabel })}</p>
            </div>
          )}
          {dialog.kind === "delete-requirement" && (
            <div className="name-dialog-warning">
              <TriangleAlert size={18} />
              <p>
                {t("requirement.deleteWarning", {
                  name: dialog.requirementTitle,
                })}
              </p>
            </div>
          )}
          <Field name="workspace-name-dialog-draft" label={inputLabel}>
          <input
            data-autofocus
            value={draft}
            maxLength={64}
            placeholder={
              dialog.kind === "space"
                ? t("workspace.namePlaceholder")
                : dialog.kind === "requirement"
                  ? t("requirement.namePlaceholder", {
                      name: dialog.spaceLabel,
                    })
                  : dialog.kind === "rename-space"
                    ? t("workspace.renamePlaceholder")
                    : dialog.kind === "rename-requirement"
                      ? t("requirement.renamePlaceholder")
                      : dialog.kind === "delete-space"
                        ? t("workspace.deletePlaceholder", {
                            name: dialog.spaceLabel,
                          })
                        : t("requirement.deletePlaceholder", {
                            name: dialog.requirementTitle,
                          })
            }
            onChange={(event) => onDraftChange(event.target.value)}
          />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant={isDelete ? "danger" : "primary"}
            type="submit"
            aria-label={
              dialog.kind === "space"
                ? t("workspace.createConfirm")
                : dialog.kind === "requirement"
                  ? t("requirement.createConfirm")
                  : dialog.kind === "rename-space"
                    ? t("workspace.renameConfirm")
                    : dialog.kind === "rename-requirement"
                      ? t("requirement.renameConfirm")
                      : dialog.kind === "delete-space"
                        ? t("workspace.deleteConfirm")
                        : t("requirement.deleteConfirm")
            }
            disabled={
              dialog.kind === "delete-space"
                ? draft !== dialog.spaceLabel
                : dialog.kind === "delete-requirement"
                  ? draft !== dialog.requirementTitle
                  : dialog.kind === "rename-space"
                    ? !draft.trim() || draft.trim() === dialog.spaceLabel
                    : dialog.kind === "rename-requirement"
                      ? !draft.trim() ||
                        draft.trim() === dialog.requirementTitle
                      : !draft.trim()
            }
          >
            {isDelete
              ? t("dialog.delete")
              : isRename
                ? t("dialog.update")
                : t("dialog.create")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
