import { Archive, BookMarked, Pencil, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type {
  BusinessApi,
  KnowledgeNoteDto,
} from "../../../shared/business";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton,
  InlineAlert,
  ListPagination,
  useListPagination,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";

type Props = {
  workspaceId: string;
  business?: BusinessApi;
};

export function KnowledgeNotesPanel({
  workspaceId,
  business,
}: Props): JSX.Element | null {
  const { locale, t } = useLocalization();
  const toast = useToast();
  const [notes, setNotes] = useState<KnowledgeNoteDto[]>([]);
  const [editing, setEditing] = useState<KnowledgeNoteDto>();
  const [archiving, setArchiving] = useState<KnowledgeNoteDto>();
  const [error, setError] = useState("");
  const notePagination = useListPagination(notes);

  useEffect(() => {
    if (!business?.listKnowledgeNotes) return;
    let disposed = false;
    void business
      .listKnowledgeNotes({ workspaceId })
      .then((result) => {
        if (!disposed) setNotes(result);
      })
      .catch(() => {
        if (!disposed) {
          setError(t("knowledgeNote.loadFailed"));
        }
      });
    return () => {
      disposed = true;
    };
  }, [business, t, workspaceId]);

  if (!business?.listKnowledgeNotes) return null;

  const archive = async (): Promise<void> => {
    if (!archiving || !business.archiveKnowledgeNote) return;
    try {
      await business.archiveKnowledgeNote({
        noteId: archiving.id,
        expectedRevision: archiving.revision,
      });
      setNotes((current) =>
        current.filter((note) => note.id !== archiving.id),
      );
      setArchiving(undefined);
    } catch {
      toast.error("knowledgeNote.archiveFailed");
      setArchiving(undefined);
    }
  };

  return (
    <section
      className="knowledge-notes-section"
      aria-label={t("knowledgeNote.list")}
    >
      <header className="knowledge-notes-header">
        <div>
          <h2>
            <BookMarked size={17} />
            {t("knowledgeNote.list")}
          </h2>
          <p>{t("knowledgeNote.listDescription")}</p>
        </div>
        <span>{t("knowledgeNote.count", { count: notes.length })}</span>
      </header>
      {error ? (
        <InlineAlert
          className="knowledge-notes-error"
          tone="danger"
          title={error}
        />
      ) : null}
      {notes.length > 0 ? (
        <div className="knowledge-notes-list">
          {notePagination.pageItems.map((note) => (
            <div className="knowledge-note-row" key={note.id}>
              <div>
                <span className="knowledge-note-kind">
                  {t(kindKey(note.kind))}
                </span>
                <strong>{note.title}</strong>
                <p>{note.content}</p>
              </div>
              <time dateTime={new Date(note.updatedAt).toISOString()}>
                {new Intl.DateTimeFormat(locale, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }).format(note.updatedAt)}
              </time>
              <div className="knowledge-note-actions">
                <IconButton
                  size="compact"
                  variant="ghost"
                  aria-label={t("knowledgeNote.editAction", {
                    title: note.title,
                  })}
                  title={t("tooltip.edit")}
                  onClick={() => {
                    setError("");
                    setEditing(note);
                  }}
                >
                  <Pencil size={15} />
                </IconButton>
                <IconButton
                  className="knowledge-note-actions__archive"
                  size="compact"
                  variant="ghost"
                  aria-label={t("knowledgeNote.archiveAction", {
                    title: note.title,
                  })}
                  title={t("tooltip.archive")}
                  onClick={() => {
                    setError("");
                    setArchiving(note);
                  }}
                >
                  <Archive size={15} />
                </IconButton>
              </div>
            </div>
          ))}
          <ListPagination
            total={notes.length}
            page={notePagination.page}
            pageSize={notePagination.pageSize}
            onPageChange={notePagination.setPage}
          />
        </div>
      ) : (
        <div className="space-empty-block">
          <BookMarked size={21} />
          <strong>{t("knowledgeNote.empty")}</strong>
          <span>{t("knowledgeNote.emptyDescription")}</span>
        </div>
      )}
      {editing ? (
        <EditKnowledgeNoteDialog
          note={editing}
          business={business}
          onClose={() => setEditing(undefined)}
          onSaved={(saved) => {
            setNotes((current) =>
              current.map((note) => (note.id === saved.id ? saved : note)),
            );
            setEditing(undefined);
          }}
        />
      ) : null}
      {archiving ? (
        <Dialog
          open
          size="compact"
          className="knowledge-note-confirm-dialog"
          aria-labelledby="archive-knowledge-note-title"
          onOpenChange={(open) => {
            if (!open) setArchiving(undefined);
          }}
        >
          <DialogHeader>
            <Archive size={18} />
            <h2 id="archive-knowledge-note-title">
              {t("knowledgeNote.archiveTitle")}
            </h2>
          </DialogHeader>
          <DialogBody>
            <p>{t("knowledgeNote.archiveDescription")}</p>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setArchiving(undefined)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              leadingIcon={<Archive size={14} />}
              onClick={() => void archive()}
            >
              {t("knowledgeNote.archiveConfirm")}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </section>
  );
}

function EditKnowledgeNoteDialog({
  note,
  business,
  onClose,
  onSaved,
}: {
  note: KnowledgeNoteDto;
  business: BusinessApi;
  onClose: () => void;
  onSaved: (note: KnowledgeNoteDto) => void;
}): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      const saved = await business.editKnowledgeNote({
        noteId: note.id,
        versionId: crypto.randomUUID(),
        expectedRevision: note.revision,
        title: title.trim(),
        content: content.trim(),
      });
      onSaved(saved);
    } catch {
      toast.error("knowledgeNote.editFailed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      size="default"
      className="knowledge-note-dialog"
      aria-labelledby="edit-knowledge-note-title"
      locked={saving}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        onSubmit={(event) => void submit(event)}
      >
        <DialogHeader>
          <Pencil size={18} />
          <h2 id="edit-knowledge-note-title">
            {t("knowledgeNote.editTitle")}
          </h2>
        </DialogHeader>
        <DialogBody className="knowledge-note-dialog__body">
          <Field name="knowledge-note-title" label={t("knowledgeNote.title")}>
            <input
              data-autofocus
              aria-label={t("knowledgeNote.title")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field name="knowledge-note-content" label={t("knowledgeNote.content")}>
            <textarea
              aria-label={t("knowledgeNote.content")}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button disabled={saving} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={saving}
            disabled={saving || !title.trim() || !content.trim()}
            leadingIcon={<Save size={14} />}
          >
            {t("knowledgeNote.saveChanges")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function kindKey(kind: KnowledgeNoteDto["kind"]) {
  return kind === "decision"
    ? ("knowledgeNote.kind.decision" as const)
    : kind === "retrospective"
      ? ("knowledgeNote.kind.retrospective" as const)
      : ("knowledgeNote.kind.conversation" as const);
}
