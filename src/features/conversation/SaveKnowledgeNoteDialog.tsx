import { BookMarked, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  BusinessApi,
  ConversationMessageDto,
} from "../../../shared/business";
import type { KnowledgeNoteKind } from "../../../domain/knowledge-note";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
} from "../../components/ui";

type Props = {
  business: BusinessApi;
  workspaceId: string;
  sessionId: string;
  messages: readonly Pick<ConversationMessageDto, "id" | "content">[];
  onClose: () => void;
  onSaved: () => void;
};

export function SaveKnowledgeNoteDialog({
  business,
  workspaceId,
  sessionId,
  messages,
  onClose,
  onSaved,
}: Props): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [kind, setKind] = useState<KnowledgeNoteKind>("conversation_note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(
    messages.map((message) => message.content.trim()).join("\n\n"),
  );
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      await business.createKnowledgeNote({
        id: crypto.randomUUID(),
        versionId: crypto.randomUUID(),
        workspaceId,
        sessionId,
        kind,
        sourceMessageIds: messages.map(({ id }) => id),
        title: title.trim(),
        content: content.trim(),
      });
      onSaved();
    } catch {
      toast.error("knowledgeNote.saveFailed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      locked={saving}
      closeOnBackdrop={false}
      aria-labelledby="save-knowledge-note-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        className="knowledge-note-dialog"
        onSubmit={(event) => void submit(event)}
      >
        <DialogHeader>
          <BookMarked size={18} />
          <h2 id="save-knowledge-note-title">
            {t("knowledgeNote.capture")}
          </h2>
        </DialogHeader>
        <DialogBody className="knowledge-note-dialog__body">
          <Field name="knowledge-note-kind" label={t("knowledgeNote.kind")}>
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as KnowledgeNoteKind)
              }
            >
              <option value="conversation_note">
                {t("knowledgeNote.kind.conversation")}
              </option>
              <option value="decision">{t("knowledgeNote.kind.decision")}</option>
              <option value="retrospective">
                {t("knowledgeNote.kind.retrospective")}
              </option>
            </select>
          </Field>
          <Field name="knowledge-note-title" label={t("knowledgeNote.title")}>
            <input
              data-autofocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field name="knowledge-note-content" label={t("knowledgeNote.content")}>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={saving} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={saving || !title.trim() || !content.trim()}
            loading={saving}
            leadingIcon={<Save size={14} />}
          >
            {t(saving ? "knowledgeNote.saving" : "knowledgeNote.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
