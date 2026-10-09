import { ArrowUpRight, Check, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  UpdateCheckErrorCode,
  UpdateCheckRecord,
} from "../../domain/app-support";
import { Button, InlineAlert } from "../components/ui";
import { useToast } from "../features/toast/ToastProvider";
import { useLocalization } from "../localization/LocalizationProvider";
import type { TranslationKey } from "../localization/translate";

const ERROR_KEYS: Readonly<Record<UpdateCheckErrorCode, TranslationKey>> = {
  audit_unavailable: "updates.error.auditUnavailable",
  service_unavailable: "updates.error.serviceUnavailable",
  request_timeout: "updates.error.requestTimeout",
  service_rejected: "updates.error.serviceRejected",
  invalid_response: "updates.error.invalidResponse",
  storage_unavailable: "updates.error.storageUnavailable",
};

export default function UpdatesPage(): JSX.Element {
  const { locale, t } = useLocalization();
  const toast = useToast();
  const business = window.realmflow?.business;
  const [currentVersion, setCurrentVersion] = useState("");
  const [result, setResult] = useState<UpdateCheckRecord>();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [opening, setOpening] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadSupportInfo = useCallback(async (): Promise<void> => {
    if (!business) {
      setLoadError(t("updates.unavailable"));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const info = await business.getAppSupportInfo();
      setCurrentVersion(info.currentVersion);
      setResult(info.lastCheck);
      setLoadError("");
    } catch {
      setLoadError(t("updates.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [business, t]);

  useEffect(() => {
    void loadSupportInfo();
  }, [loadSupportInfo]);

  const checkForUpdates = (): void => {
    if (!business || checking) return;
    setChecking(true);
    void business
      .checkForUpdates({ requestId: crypto.randomUUID() })
      .then((nextResult) => {
        setCurrentVersion(nextResult.currentVersion);
        if (
          nextResult.status === "failed" &&
          nextResult.errorCode &&
          result &&
          result.status !== "failed"
        ) {
          toast.error(ERROR_KEYS[nextResult.errorCode], {
            dedupeKey: "updates-check-failed",
          });
          return;
        }
        setResult(nextResult);
      })
      .catch(() =>
        toast.error("updates.checkFailed", {
          dedupeKey: "updates-check-failed",
        }),
      )
      .finally(() => setChecking(false));
  };

  const openReleases = (): void => {
    if (!business || opening) return;
    setOpening(true);
    void business
      .openSupportLink({
        requestId: crypto.randomUUID(),
        target: "releases",
      })
      .then((openResult) => {
        if (openResult.status === "failed") {
          toast.error(
            openResult.errorCode === "audit_unavailable"
              ? "support.error.auditUnavailable"
              : "support.error.targetUnavailable",
            { dedupeKey: "updates-open-releases-failed" },
          );
        }
      })
      .catch(() =>
        toast.error("support.error.targetUnavailable", {
          dedupeKey: "updates-open-releases-failed",
        }),
      )
      .finally(() => setOpening(false));
  };

  const resultError =
    result?.status === "failed" && result.errorCode
      ? t(ERROR_KEYS[result.errorCode])
      : "";

  return (
    <div className="support-page updates-page">
      <header className="support-page-heading">
        <div>
          <span>{t("updates.kicker")}</span>
          <h1>{t("navigation.updates")}</h1>
          <p>{t("navigation.updatesDescription")}</p>
        </div>
        <span className="support-local-mark">{t("updates.manualOnly")}</span>
      </header>

      <section
        className="update-version"
        aria-label={t("updates.versionAria")}
      >
        <div>
          <span>{t("updates.currentVersion")}</span>
          <strong>{loading ? t("common.loading") : currentVersion || "—"}</strong>
        </div>
        <Button
          size="comfortable"
          variant="primary"
          leadingIcon={<RefreshCw size={16} />}
          loading={checking}
          onClick={checkForUpdates}
          disabled={!business || loading}
        >
          {checking
            ? t("updates.checking")
            : result?.status === "failed"
              ? t("updates.recheck")
              : t("updates.check")}
        </Button>
      </section>

      {loadError ? (
        <InlineAlert
          className="support-page-alert"
          tone="danger"
          role="alert"
          title={loadError}
          actionLabel={business ? t("common.retry") : undefined}
          actionLoading={loading}
          onAction={business ? () => void loadSupportInfo() : undefined}
        />
      ) : null}

      <section
        className="update-result"
        aria-label={t("updates.resultAria")}
        role={result?.status === "failed" ? "alert" : undefined}
      >
        {!loading && !result ? (
          <div className="update-result-empty">
            <span>{t("updates.lastCheck")}</span>
            <strong>{t("updates.neverChecked")}</strong>
            <p>{t("updates.neverCheckedDescription")}</p>
          </div>
        ) : null}

        {result ? (
          <>
            <div
              className="update-status"
              data-status={result.status}
              role={result.status === "failed" ? undefined : "status"}
            >
              <span className="update-status-icon" aria-hidden="true">
                {result.status === "up_to_date" ? (
                  <Check size={17} />
                ) : (
                  <RefreshCw size={17} />
                )}
              </span>
              <div>
                <strong>{statusLabel(result, t)}</strong>
                <span>
                  {t("updates.checkedAt", {
                    time: new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(result.checkedAt),
                  })}
                </span>
              </div>
            </div>
            {result.status === "failed" ? (
              <p className="update-result-message">{resultError}</p>
            ) : (
              <div className="update-release">
                <div>
                  <span>{t("updates.latestVersion")}</span>
                  <strong>{result.latestVersion}</strong>
                </div>
                {result.status === "update_available" ? (
                  <Button
                    size="comfortable"
                    variant="primary"
                    leadingIcon={<ArrowUpRight size={16} />}
                    onClick={openReleases}
                    loading={opening}
                  >
                    {t("updates.openReleases")}
                  </Button>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

function statusLabel(
  result: UpdateCheckRecord,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  if (result.status === "update_available") return t("updates.updateAvailable");
  if (result.status === "up_to_date") return t("updates.upToDate");
  return t("updates.failed");
}
