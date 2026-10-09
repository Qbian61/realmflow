import { useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import type { ChatSession } from "../../domain/chat-session";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
} from "../../components/ui";

type ConversationActionDialogProps = {
  session: ChatSession;
  mode: "rename" | "delete";
  pending: boolean;
  onClose: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
};

export function ConversationActionDialog({
  session,
  mode,
  pending,
  onClose,
  onRename,
  onDelete,
}: ConversationActionDialogProps): JSX.Element {
  const { t } = useLocalization();
  const [title, setTitle] = useState(session.title);
  const normalizedTitle = title.trim();
  const renameInvalid =
    !normalizedTitle ||
    normalizedTitle.length > 240 ||
    normalizedTitle === session.title;
  const isDelete = mode === "delete";

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (pending) return;
    if (isDelete) {
      onDelete();
      return;
    }
    if (!renameInvalid) onRename(normalizedTitle);
  };

  return (
    <Dialog
      open
      size="compact"
      locked={pending}
      aria-label={
        isDelete
          ? t("recent.actions.deleteDialog")
          : t("recent.actions.renameDialog")
      }
      onOpenChange={(open) => !open && onClose()}
    >
      <form className="conversation-action-dialog" onSubmit={submit}>
        <DialogHeader>
          <h2>
            {isDelete
              ? t("recent.actions.deleteDialog")
              : t("recent.actions.renameDialog")}
          </h2>
        </DialogHeader>
        <DialogBody>
          {isDelete ? (
            <div className="name-dialog-warning">
              <TriangleAlert size={18} />
              <p>
                {t("recent.actions.deleteWarning", { name: session.title })}
              </p>
            </div>
          ) : (
            <Field
              name="conversation-title"
              label={t("recent.actions.renameInput")}
              error={
                title.length > 240
                  ? t("recent.actions.renameTooLong")
                  : undefined
              }
            >
              <input
                data-autofocus
                value={title}
                maxLength={241}
                disabled={pending}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={pending} onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button
            type="submit"
            variant={isDelete ? "danger" : "primary"}
            disabled={pending || (!isDelete && renameInvalid)}
            aria-label={
              isDelete
                ? t("recent.actions.deleteConfirm")
                : t("recent.actions.renameConfirm")
            }
          >
            {isDelete ? t("dialog.delete") : t("dialog.update")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
