import { BookMarked, Check, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { BusinessApi } from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";
import { Button } from "../../components/ui";
import type { ConversationMessageSelection } from "./ConversationMessageList";
import { SaveKnowledgeNoteDialog } from "./SaveKnowledgeNoteDialog";

type CaptureMessage = {
  id: string;
  role?: "user" | "assistant" | "tool";
  status?: "pending" | "completed" | "failed";
  content: string;
};

type Props = {
  business?: BusinessApi;
  workspaceId?: string;
  sessionId: string;
  messages: readonly CaptureMessage[];
  children: (selection?: ConversationMessageSelection) => ReactNode;
};

export function KnowledgeNoteCapture({
  business,
  workspaceId,
  sessionId,
  messages,
  children,
}: Props): JSX.Element {
  const { t } = useLocalization();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const eligible = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.status === "completed" &&
          (message.role === "user" || message.role === "assistant"),
      ),
    [messages],
  );
  const enabled = Boolean(
    business?.createKnowledgeNote && workspaceId && eligible.length > 0,
  );
  const selectedMessages = eligible.filter((message) =>
    selectedIds.includes(message.id),
  );
  const cancel = (): void => {
    setSelecting(false);
    setSelectedIds([]);
  };

  const selection: ConversationMessageSelection | undefined = selecting
    ? {
        selectedIds,
        eligibleIds: eligible.map(({ id }) => id),
        selectLabel: (preview) =>
          t("knowledgeNote.selectMessage", { preview }),
        onToggle: (messageId) =>
          setSelectedIds((current) =>
            current.includes(messageId)
              ? current.filter((id) => id !== messageId)
              : [...current, messageId],
          ),
      }
    : undefined;

  return (
    <div className="knowledge-note-capture">
      <div className="knowledge-note-capture-toolbar">
        {!selecting ? (
          enabled ? (
            <Button
              size="compact"
              leadingIcon={<BookMarked size={15} />}
              onClick={() => setSelecting(true)}
            >
              {t("knowledgeNote.capture")}
            </Button>
          ) : null
        ) : (
          <>
            <Button
              size="compact"
              leadingIcon={<X size={15} />}
              onClick={cancel}
            >
              {t("knowledgeNote.cancelSelection")}
            </Button>
            <Button
              size="compact"
              variant="primary"
              leadingIcon={<Check size={15} />}
              disabled={selectedIds.length === 0}
              onClick={() => setConfirming(true)}
            >
              {t("knowledgeNote.confirmRange")}
            </Button>
          </>
        )}
      </div>
      {children(selection)}
      {confirming && business && workspaceId ? (
        <SaveKnowledgeNoteDialog
          business={business}
          workspaceId={workspaceId}
          sessionId={sessionId}
          messages={selectedMessages}
          onClose={() => setConfirming(false)}
          onSaved={() => {
            setConfirming(false);
            cancel();
          }}
        />
      ) : null}
    </div>
  );
}
