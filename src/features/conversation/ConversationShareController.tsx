import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  X,
} from "lucide-react";
import html2canvas from "html2canvas";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  IconButton,
  InlineAlert,
  Spinner,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";
import { ConversationMessageList } from "./ConversationMessageList";
import {
  ConversationShareCard,
  type ShareableConversationMessage,
} from "./ConversationShareCard";

type Props = {
  title: string;
  messages: readonly ShareableConversationMessage[];
  children: (shareMessage: (messageId: string) => void) => ReactNode;
};

type SharePng = {
  url: string;
  width: number;
  height: number;
};

export function ConversationShareController({
  title,
  messages,
  children,
}: Props): JSX.Element {
  const { locale, t } = useLocalization();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"select" | "preview">("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<SharePng>();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const imageUrl = imagePreview?.url ?? "";
  const eligible = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.status === "completed" &&
          (message.role === "user" || message.role === "assistant") &&
          Boolean(message.content.trim()),
      ),
    [messages],
  );
  const eligibleIds = eligible.map(({ id }) => id);
  const selectedMessages = useMemo(
    () => eligible.filter((message) => selectedIds.includes(message.id)),
    [eligible, selectedIds],
  );
  const allSelected =
    eligibleIds.length > 0 &&
    eligibleIds.every((messageId) => selectedIds.includes(messageId));

  const close = useCallback((): void => {
    setOpen(false);
    setPhase("select");
    setSelectedIds([]);
    setImagePreview(undefined);
    setError("");
    setCopied(false);
  }, []);
  const shareMessage = (messageId: string): void => {
    setSelectedIds(eligibleIds.includes(messageId) ? [messageId] : []);
    setPhase("select");
    setImagePreview(undefined);
    setError("");
    setCopied(false);
    setOpen(true);
  };
  const toggle = (messageId: string): void => {
    setSelectedIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId],
    );
  };
  const showPreview = (): void => {
    setImagePreview(undefined);
    setError("");
    setCopied(false);
    setGenerating(true);
    setPhase("preview");
  };
  const backToSelection = (): void => {
    setPhase("select");
    setImagePreview(undefined);
    setError("");
    setCopied(false);
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (phase !== "preview" || imageUrl || error) return;
    let cancelled = false;
    const task = window.setTimeout(() => {
      const node = captureRef.current;
      if (!node) {
        setGenerating(false);
        setError(t("chat.share.generateFailed"));
        return;
      }
      void generateSharePng(node)
        .then((preview) => {
          if (!cancelled) setImagePreview(preview);
        })
        .catch(() => {
          if (!cancelled) setError(t("chat.share.generateFailed"));
        })
        .finally(() => {
          if (!cancelled) setGenerating(false);
        });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(task);
    };
  }, [error, imageUrl, phase, t]);

  const copyImage = async (): Promise<void> => {
    if (
      !imageUrl ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === "undefined"
    ) {
      toast.error("chat.share.copyFailed");
      return;
    }
    try {
      const blob = pngDataUrlToBlob(imageUrl);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setError("");
    } catch {
      toast.error("chat.share.copyFailed");
    }
  };
  const downloadImage = (): void => {
    if (!imageUrl) return;
    const date = new Date().toISOString().slice(0, 10);
    const safeTitle =
      title.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) ||
      "conversation";
    const anchor = document.createElement("a");
    anchor.href = imageUrl;
    anchor.download = `${safeTitle}-${date}.png`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <>
      {children(shareMessage)}
      <Dialog
        open={open}
        size="workspace"
        className="conversation-share-dialog"
        aria-label={t("chat.share.dialog")}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close();
        }}
      >
        {phase === "select" ? (
          <>
                <DialogHeader className="conversation-share-header">
                  <div>
                    <h2>{t("chat.share.selectTitle")}</h2>
                    <p>{title}</p>
                  </div>
                  <IconButton
                    className="conversation-share-close"
                    size="compact"
                    variant="ghost"
                    aria-label={t("chat.share.cancel")}
                    title={t("chat.share.cancel")}
                    onPointerDown={close}
                    onClick={close}
                  >
                    <X size={18} />
                  </IconButton>
                </DialogHeader>
                <DialogBody className="conversation-share-selection">
                  <ConversationMessageList
                    messages={eligible}
                    selection={{
                      eligibleIds,
                      selectedIds,
                      selectLabel: (preview) =>
                        t("chat.share.selectMessage", { preview }),
                      onToggle: toggle,
                    }}
                    labels={{
                      messages: t("chat.share.messages"),
                      messageIndex: t("chat.messageIndex"),
                      jumpToMessage: (index, preview) =>
                        t("chat.jumpToMessage", { index, preview }),
                      tool: t("chat.tool"),
                      generating: t("chat.generating"),
                    }}
                  />
                </DialogBody>
                <DialogFooter className="conversation-share-actions">
                  <label>
                    <input name="chat-share-select-all" autoComplete="off"
                      type="checkbox"
                      checked={allSelected}
                      aria-label={t("chat.share.selectAll")}
                      onChange={() =>
                        setSelectedIds(allSelected ? [] : [...eligibleIds])
                      }
                    />
                    <span>{t("chat.share.selectAll")}</span>
                  </label>
                  <Button
                    variant="primary"
                    disabled={selectedIds.length === 0}
                    onClick={showPreview}
                  >
                    {t("chat.share.generate")}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader className="conversation-share-header">
                  <div className="conversation-share-preview-title">
                    <IconButton
                      size="compact"
                      variant="ghost"
                      aria-label={t("chat.share.back")}
                      title={t("chat.share.back")}
                      onClick={backToSelection}
                    >
                      <ArrowLeft size={18} />
                    </IconButton>
                    <div>
                      <h2>{t("chat.share.previewTitle")}</h2>
                      <p>{title}</p>
                    </div>
                  </div>
                  <IconButton
                    className="conversation-share-close"
                    size="compact"
                    variant="ghost"
                    aria-label={t("chat.share.cancel")}
                    title={t("chat.share.cancel")}
                    onPointerDown={close}
                    onClick={close}
                  >
                    <X size={18} />
                  </IconButton>
                </DialogHeader>
                <DialogBody className="conversation-share-preview">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={t("chat.share.previewAlt")}
                      width={imagePreview?.width}
                      height={imagePreview?.height}
                      loading="eager"
                      decoding="async"
                      data-media-layout="contained"
                      onError={() => {
                        setImagePreview(undefined);
                        setError(t("chat.share.generateFailed"));
                      }}
                    />
                  ) : error ? (
                    <div className="conversation-share-error">
                      <InlineAlert
                        tone="danger"
                        role="alert"
                        title={error}
                        actionLabel={t("chat.share.retryGenerate")}
                        onAction={showPreview}
                      />
                    </div>
                  ) : (
                    <>
                      <ConversationShareCard
                        captureRef={captureRef}
                        title={title}
                        messages={selectedMessages}
                        locale={locale}
                        aiDisclaimer={t("chat.share.aiDisclaimer")}
                      />
                      {generating ? (
                        <div
                          className="conversation-share-generating"
                          role="status"
                        >
                          <Spinner size={18} />
                          {t("chat.share.generating")}
                        </div>
                      ) : null}
                    </>
                  )}
                </DialogBody>
                <DialogFooter className="conversation-share-actions preview">
                  <span />
                  <div>
                    <Button
                      leadingIcon={
                        copied ? <Check size={15} /> : <Copy size={15} />
                      }
                      disabled={!imageUrl}
                      onClick={() => void copyImage()}
                    >
                      {copied
                        ? t("chat.share.copiedImage")
                        : t("chat.share.copyImage")}
                    </Button>
                    <Button
                      variant="primary"
                      leadingIcon={<Download size={15} />}
                      disabled={!imageUrl}
                      onClick={downloadImage}
                    >
                      {t("chat.share.downloadImage")}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            )}
      </Dialog>
    </>
  );
}

function generateSharePng(node: HTMLElement): Promise<SharePng> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error("Share image generation timed out")),
      15_000,
    );
  });
  return Promise.race([
    html2canvas(node, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 1.5,
      useCORS: true,
    }).then((canvas) => ({
      url: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    })),
    timeout,
  ]).finally(() => window.clearTimeout(timeoutId));
}

function pngDataUrlToBlob(dataUrl: string): Blob {
  const separator = dataUrl.indexOf(",");
  if (
    separator < 0 ||
    !dataUrl.slice(0, separator).includes("image/png") ||
    !dataUrl.slice(0, separator).includes(";base64")
  ) {
    throw new Error("Invalid PNG data URL");
  }
  const binary = window.atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "image/png" });
}
