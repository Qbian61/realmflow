import { FileText, ImageOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConversationMessageAttachment } from "../../../domain/conversation-input";

export function UserMessageAttachments({
  attachments,
  onOpenAttachment,
  openAttachmentLabel,
}: {
  attachments: readonly ConversationMessageAttachment[];
  onOpenAttachment?: (attachmentId: string) => void | Promise<void>;
  openAttachmentLabel: (fileName: string) => string;
}): JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div className="chat-message-user-attachments">
      {attachments.map((attachment) =>
        attachment.mediaKind === "image" ? (
          <UserImageAttachment
            attachment={attachment}
            key={attachment.id}
            onOpen={onOpenAttachment}
            openLabel={openAttachmentLabel(attachment.fileName)}
          />
        ) : (
          <UserDocumentAttachment
            attachment={attachment}
            key={attachment.id}
            onOpen={onOpenAttachment}
            openLabel={openAttachmentLabel(attachment.fileName)}
          />
        ),
      )}
    </div>
  );
}

function UserImageAttachment({
  attachment,
  onOpen,
  openLabel,
}: {
  attachment: ConversationMessageAttachment;
  onOpen?: (attachmentId: string) => void | Promise<void>;
  openLabel: string;
}): JSX.Element {
  const [opening, setOpening] = useState(false);
  const [preview, setPreview] = useState<
    | { state: "loading" }
    | { state: "ready"; source: string }
    | { state: "failed" }
  >(
    attachment.status === "failed"
      ? { state: "failed" }
      : { state: "loading" },
  );

  useEffect(() => {
    if (attachment.status === "failed") {
      setPreview({ state: "failed" });
      return;
    }
    if (attachment.status !== "ready") {
      setPreview({ state: "loading" });
      return;
    }
    const readImage = window.realmflow?.conversationAttachments?.readImage;
    if (!readImage) {
      setPreview({ state: "failed" });
      return;
    }
    let active = true;
    setPreview({ state: "loading" });
    void readImage(attachment.id).then(
      (source) => {
        if (active) setPreview({ state: "ready", source });
      },
      () => {
        if (active) setPreview({ state: "failed" });
      },
    );
    return () => {
      active = false;
    };
  }, [attachment.id, attachment.status]);

  return (
    <button
      type="button"
      className="chat-message-user-image"
      data-attachment-id={attachment.id}
      data-preview-state={preview.state}
      title={attachment.errorMessage ?? attachment.fileName}
      aria-label={openLabel}
      aria-busy={opening ? "true" : undefined}
      disabled={attachment.status !== "ready" || !onOpen || opening}
      onClick={() => openAttachment(attachment.id, onOpen, setOpening)}
    >
      {preview.state === "ready" ? (
        <img
          alt={attachment.fileName}
          src={preview.source}
          width="100"
          height="100"
          loading="lazy"
          decoding="async"
          draggable="false"
          onError={() => setPreview({ state: "failed" })}
        />
      ) : preview.state === "loading" ? (
        <LoaderCircle aria-hidden="true" className="is-loading" size={20} />
      ) : (
        <span className="chat-message-user-image-fallback">
          <ImageOff aria-hidden="true" size={20} />
          <span>{attachment.fileName}</span>
        </span>
      )}
    </button>
  );
}

function UserDocumentAttachment({
  attachment,
  onOpen,
  openLabel,
}: {
  attachment: ConversationMessageAttachment;
  onOpen?: (attachmentId: string) => void | Promise<void>;
  openLabel: string;
}): JSX.Element {
  const [opening, setOpening] = useState(false);
  return (
    <button
      type="button"
      className="chat-message-user-file"
      data-attachment-id={attachment.id}
      data-attachment-status={attachment.status}
      title={attachment.errorMessage ?? attachment.fileName}
      aria-label={openLabel}
      aria-busy={opening ? "true" : undefined}
      disabled={attachment.status !== "ready" || !onOpen || opening}
      onClick={() => openAttachment(attachment.id, onOpen, setOpening)}
    >
      <span className="chat-message-user-file-icon" aria-hidden="true">
        <FileText size={32} />
      </span>
      <span className="chat-message-user-file-meta">
        <span className="chat-message-user-file-name">
          {attachment.fileName}
        </span>
        <span className="chat-message-user-file-extension">
          {fileExtension(attachment.fileName)}
        </span>
      </span>
    </button>
  );
}

function openAttachment(
  attachmentId: string,
  onOpen: ((attachmentId: string) => void | Promise<void>) | undefined,
  setOpening: (opening: boolean) => void,
): void {
  if (!onOpen) return;
  setOpening(true);
  try {
    Promise.resolve(onOpen(attachmentId)).then(
      () => setOpening(false),
      () => setOpening(false),
    );
  } catch {
    setOpening(false);
  }
}

function fileExtension(fileName: string): string {
  const extension = fileName.match(/\.([^.]+)$/)?.[1]?.trim();
  return extension ? extension.toUpperCase() : "FILE";
}
