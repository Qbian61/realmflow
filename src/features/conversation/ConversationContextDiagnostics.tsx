import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type {
  BusinessApi,
  ConversationContextDiagnosticsDto,
} from "../../../shared/business";
import { Button } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

export function ConversationContextDiagnostics({
  sessionId,
  business = window.realmflow?.business,
}: {
  sessionId: string;
  business?: Pick<BusinessApi, "getConversationContextDiagnostics">;
}): JSX.Element | null {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] =
    useState<ConversationContextDiagnosticsDto>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!business) return null;

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (!next || diagnostics || loading) return;
    setLoading(true);
    setFailed(false);
    void business
      .getConversationContextDiagnostics({ sessionId })
      .then((value) => {
        if (value) setDiagnostics(value);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  return (
    <section className="conversation-context-diagnostics">
      <Button
        type="button"
        className="conversation-context-diagnostics__trigger"
        variant="ghost"
        size="compact"
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        {t("conversation.contextDiagnostics.title")}
      </Button>
      {open ? (
        <div className="conversation-context-diagnostics__body">
          {loading ? (
            <span role="status">
              {t("conversation.contextDiagnostics.loading")}
            </span>
          ) : failed ? (
            <span role="status">
              {t("conversation.contextDiagnostics.failed")}
            </span>
          ) : diagnostics ? (
            <>
              <div className="conversation-context-diagnostics__summary">
                <strong>{diagnostics.relation}</strong>
                <span>
                  {t("conversation.contextDiagnostics.selected")}:{" "}
                  {diagnostics.selectedMessageCount}
                </span>
                <span>
                  {t("conversation.contextDiagnostics.tokens")}:{" "}
                  {diagnostics.estimatedTokens}
                </span>
                <code>{diagnostics.projectionDigest.slice(0, 12)}</code>
              </div>
              <div className="conversation-context-diagnostics__details">
                {diagnostics.excluded.map(({ reason, count }) => (
                  <span key={reason}>
                    {reason}: {count}
                  </span>
                ))}
                {diagnostics.leases.map((lease, index) => (
                  <span key={`${lease.resourceType}:${lease.epoch}:${index}`}>
                    {lease.resourceType} · {lease.status} · epoch {lease.epoch}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span>{t("conversation.contextDiagnostics.empty")}</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
