import {
  ArrowUpRight,
  Database,
  GitPullRequest,
  Layers3,
  LifeBuoy,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type { SupportLinkTarget } from "../../domain/app-support";
import { Button } from "../components/ui";
import { useToast } from "../features/toast/ToastProvider";
import { useLocalization } from "../localization/LocalizationProvider";

const HELP_SECTIONS = [
  {
    title: "help.local.spaces.title",
    body: "help.local.spaces.body",
    icon: Layers3,
  },
  {
    title: "help.local.runs.title",
    body: "help.local.runs.body",
    icon: GitPullRequest,
  },
  {
    title: "help.local.privacy.title",
    body: "help.local.privacy.body",
    icon: ShieldCheck,
  },
] as const;

export default function HelpPage(): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const business = window.realmflow?.business;
  const [pendingTarget, setPendingTarget] = useState<SupportLinkTarget>();
  const [message, setMessage] = useState("");

  const openTarget = (target: SupportLinkTarget): void => {
    if (!business || pendingTarget) return;
    setPendingTarget(target);
    setMessage("");
    void business
      .openSupportLink({ requestId: crypto.randomUUID(), target })
      .then((result) => {
        if (result.status === "opened") {
          setMessage(t("support.opened"));
          return;
        }
        toast.error(
          result.errorCode === "audit_unavailable"
            ? "support.error.auditUnavailable"
            : "support.error.targetUnavailable",
          { dedupeKey: `support-open-${target}-failed` },
        );
      })
      .catch(() =>
        toast.error("support.error.targetUnavailable", {
          dedupeKey: `support-open-${target}-failed`,
        }),
      )
      .finally(() => setPendingTarget(undefined));
  };

  return (
    <div className="support-page help-page">
      <header className="support-page-heading">
        <div>
          <span>{t("help.kicker")}</span>
          <h1>{t("navigation.feedback")}</h1>
          <p>{t("navigation.feedbackDescription")}</p>
        </div>
        <span className="support-local-mark">{t("help.offlineReady")}</span>
      </header>

      <section className="help-local" aria-label={t("help.localAria")}>
        <div className="help-section-heading">
          <div>
            <span>{t("help.localLabel")}</span>
            <h2>{t("help.localTitle")}</h2>
          </div>
          <Database size={19} aria-hidden="true" />
        </div>
        <div className="help-topic-list">
          {HELP_SECTIONS.map(({ title, body, icon: Icon }, index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Icon size={18} aria-hidden="true" />
              <div>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="help-online" aria-label={t("help.onlineAria")}>
        <div>
          <span>{t("help.onlineLabel")}</span>
          <h2>{t("help.onlineTitle")}</h2>
          <p>{t("help.onlineDescription")}</p>
        </div>
        <div className="help-online-actions">
          <Button
            size="comfortable"
            variant="primary"
            leadingIcon={<LifeBuoy size={17} />}
            loading={pendingTarget === "online_help"}
            onClick={() => openTarget("online_help")}
            disabled={!business || Boolean(pendingTarget)}
          >
            {t("help.openOnline")}
            <ArrowUpRight
              className="help-online-actions__trailing"
              size={15}
            />
          </Button>
          <Button
            size="comfortable"
            variant="neutral"
            leadingIcon={<MessageSquareText size={17} />}
            loading={pendingTarget === "feedback"}
            onClick={() => openTarget("feedback")}
            disabled={!business || Boolean(pendingTarget)}
          >
            {t("help.sendFeedback")}
            <ArrowUpRight
              className="help-online-actions__trailing"
              size={15}
            />
          </Button>
        </div>
      </section>

      {message ? (
        <p className="support-message" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
