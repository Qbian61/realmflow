import { useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  Copy,
  Eye,
  GitBranchPlus,
  History,
  Pencil,
  Plus,
  Rocket,
  Workflow,
  X,
} from "lucide-react";
import type {
  WorkflowTemplateLibraryItemDto,
  WorkflowTemplatePublicationIssueDto,
  WorkflowTemplateVersionSummaryDto,
} from "../../shared/business";
import { WorkspaceHeaderPortal } from "../features/navigation/WorkspaceLayout";
import { useToast } from "../features/toast/ToastProvider";
import { useLocalization } from "../localization/LocalizationProvider";
import type { Translator } from "../localization/translate";
import { useUrlQueryState } from "../navigation/url-query-state";
import { workflowTemplateTabCodec } from "./page-query-state";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  IconButton,
  InlineAlert,
  Tab,
  TabList,
  Tabs,
  Toolbar,
} from "../components/ui";

type EditorState =
  | {
      mode: "create" | "copy" | "edit";
      sourceId?: string;
      templateId?: string;
      expectedRevision?: number;
      name: string;
      description: string;
    }
  | undefined;

type ConfirmationState =
  | {
      kind: "transition";
      template: WorkflowTemplateLibraryItemDto;
      action: "publish" | "archive";
    }
  | {
      kind: "version";
      template: WorkflowTemplateLibraryItemDto;
    };

export default function WorkflowTemplatesPage(): JSX.Element {
  const { locale, t } = useLocalization();
  const toast = useToast();
  const business = window.realmflow?.business;
  const [templates, setTemplates] = useState<WorkflowTemplateLibraryItemDto[]>(
    [],
  );
  const [editor, setEditor] = useState<EditorState>();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [confirmation, setConfirmation] = useState<ConfirmationState>();
  const [confirmationError, setConfirmationError] = useState("");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string>();
  const [versionHistory, setVersionHistory] = useState<
    Record<string, WorkflowTemplateVersionSummaryDto[]>
  >({});
  const [error, setError] = useState("");
  const [publicationIssues, setPublicationIssues] = useState<
    WorkflowTemplatePublicationIssueDto[]
  >([]);
  const [activeTab, setActiveTab] = useUrlQueryState(
    "tab",
    workflowTemplateTabCodec,
  );

  useEffect(() => {
    if (!business) {
      setError(t("workflowTemplates.unavailable"));
      setLoading(false);
      return;
    }
    void business
      .listWorkflowTemplateLibrary()
      .then((templates) => {
        setTemplates(templates);
      })
      .catch((reason: unknown) =>
        setError(errorMessage(reason, t("workflowTemplates.loadFailed"))),
      )
      .finally(() => setLoading(false));
  }, [business, t]);

  function upsert(template: WorkflowTemplateLibraryItemDto): void {
    setTemplates((current) => [
      template,
      ...current.filter((item) => item.id !== template.id),
    ]);
  }

  async function submitEditor(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!business || !editor) return;
    const operationId = editor.templateId ?? editor.sourceId ?? "new-template";
    setBusyId(operationId);
    setError("");
    setPublicationIssues([]);
    try {
      const saved =
        editor.mode === "edit"
          ? await business.updateWorkflowTemplate({
              id: editor.templateId!,
              expectedRevision: editor.expectedRevision!,
              name: editor.name,
              description: editor.description,
            })
          : editor.mode === "copy"
            ? await business.copyWorkflowTemplate({
                id: crypto.randomUUID(),
                sourceTemplateId: editor.sourceId!,
                name: editor.name,
                description: editor.description,
              })
            : await business.createWorkflowTemplate({
                id: crypto.randomUUID(),
                name: editor.name,
                description: editor.description,
              });
      upsert(saved);
      if (saved.status === "draft") setActiveTab("draft");
      setEditor(undefined);
    } catch {
      toast.error("workflowTemplates.saveFailed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function confirmTransition(): Promise<void> {
    if (!business || confirmation?.kind !== "transition") return;
    const { template, action } = confirmation;
    const verb = t(`workflowTemplates.action.${action}`);
    setBusyId(template.id);
    setError("");
    setConfirmationError("");
    setPublicationIssues([]);
    try {
      const saved =
        action === "publish"
          ? await business.publishWorkflowTemplate({
              id: template.id,
              expectedRevision: template.revision,
            })
          : await business.archiveWorkflowTemplate({
              id: template.id,
              expectedRevision: template.revision,
            });
      if ("outcome" in saved) {
        setConfirmation(undefined);
        setError(t("workflowTemplates.publishValidationFailed"));
        setPublicationIssues(saved.validation.issues);
        return;
      }
      upsert(saved);
      setConfirmation(undefined);
      if (saved.status === "published") setActiveTab("published");
    } catch {
      setConfirmationError(
        t("workflowTemplates.transitionFailed", {
          action: verb,
        }),
      );
      toast.error("workflowTemplates.transitionFailed", {
        values: { action: verb },
      });
    } finally {
      setBusyId(undefined);
    }
  }

  async function confirmCreateNextVersion(): Promise<void> {
    if (!business || confirmation?.kind !== "version") return;
    const { template } = confirmation;
    setBusyId(template.id);
    setError("");
    setConfirmationError("");
    setPublicationIssues([]);
    try {
      const saved = await business.createWorkflowTemplateVersion({
        id: template.id,
        sourceVersionId: template.currentVersion.id,
        expectedRevision: template.revision,
      });
      upsert(saved);
      setConfirmation(undefined);
      setActiveTab("draft");
      if (expandedHistoryId === template.id) {
        const versions = await business.listWorkflowTemplateVersions({
          templateId: template.id,
        });
        setVersionHistory((current) => ({
          ...current,
          [template.id]: versions,
        }));
      }
    } catch {
      setConfirmationError(t("workflowTemplates.createVersionFailed"));
      toast.error("workflowTemplates.createVersionFailed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function toggleHistory(
    template: WorkflowTemplateLibraryItemDto,
  ): Promise<void> {
    if (!business) return;
    if (expandedHistoryId === template.id) {
      setExpandedHistoryId(undefined);
      return;
    }
    setExpandedHistoryId(template.id);
    if (versionHistory[template.id]) return;
    setError("");
    setPublicationIssues([]);
    try {
      const versions = await business.listWorkflowTemplateVersions({
        templateId: template.id,
      });
      setVersionHistory((current) => ({
        ...current,
        [template.id]: versions,
      }));
    } catch (reason) {
      setExpandedHistoryId(undefined);
      setError(errorMessage(reason, t("workflowTemplates.historyLoadFailed")));
    }
  }

  const publishedCount = templates.filter(
    (template) => template.status === "published",
  ).length;
  const draftCount = templates.filter(
    (template) => template.status === "draft",
  ).length;
  const visibleTemplates = templates.filter(
    (template) => template.status === activeTab,
  );

  return (
    <div className="workflow-templates-page">
      <h1 className="sr-only">{t("navigation.workflows")}</h1>
      <WorkspaceHeaderPortal>
        <Toolbar
          variant="workspace-header"
          className="workflow-templates-page-header"
          aria-label={t("workflowTemplates.tabs")}
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "published" | "draft")
            }
          >
            <TabList
              className="workflow-templates-tabs"
              aria-label={t("workflowTemplates.tabs")}
            >
              <Tab value="published">
                {t("workflowTemplates.tab.published", {
                  count: publishedCount,
                })}
              </Tab>
              <Tab value="draft">
                {t("workflowTemplates.tab.draft", { count: draftCount })}
              </Tab>
            </TabList>
          </Tabs>
          <Button
            size="default"
            variant="primary"
            leadingIcon={<Plus size={15} aria-hidden="true" />}
            onClick={() =>
              setEditor({
                mode: "create",
                name: "",
                description: "",
              })
            }
          >
            {t("workflowTemplates.create")}
          </Button>
        </Toolbar>
      </WorkspaceHeaderPortal>

      {error ? (
        <InlineAlert
          className="workflow-template-error"
          tone="danger"
          title={error}
        >
          {publicationIssues.length > 0 ? (
            <ul>
              {publicationIssues.map((issue, index) => (
                <li
                  key={`${issue.code}:${issue.nodeId ?? issue.edgeId ?? index}`}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </InlineAlert>
      ) : null}

      <section
        id="workflow-templates-panel"
        className="workflow-template-list"
        role="tabpanel"
        aria-labelledby={`workflow-templates-${activeTab}-tab`}
      >
        {loading ? (
          <p className="workflow-template-empty">{t("common.loading")}</p>
        ) : null}
        {!loading && visibleTemplates.length === 0 ? (
          <EmptyState
            className="workflow-template-empty"
            icon={<Workflow size={22} />}
            title={t(`workflowTemplates.empty.${activeTab}.title`)}
            description={t(
              `workflowTemplates.empty.${activeTab}.description`,
            )}
          />
        ) : null}
        {visibleTemplates.map((template) => (
          <Card
            as="article"
            className="workflow-template-row"
            key={template.id}
          >
            <div className="workflow-template-copy">
              <div className="workflow-template-title">
                <strong>{template.name}</strong>
                <Badge
                  className="workflow-template-status"
                  data-status={template.status}
                  tone={
                    template.status === "published" ? "success" : "warning"
                  }
                >
                  {statusLabel(template.status, t)}
                </Badge>
              </div>
              <p>
                {template.description || t("workflowTemplates.noDescription")}
              </p>
              <span className="workflow-template-meta">
                {t("workflowTemplates.meta", {
                  version: template.currentVersion.version,
                  nodes: template.currentVersion.nodeCount,
                  edges: template.currentVersion.edgeCount,
                })}
              </span>
            </div>
            <div className="workflow-template-actions">
              {template.status === "draft" ? (
                <IconButton
                  size="default"
                  variant="ghost"
                  aria-label={t("workflowTemplates.editAria", {
                    name: template.name,
                  })}
                  title={t("workflowTemplates.editInfo")}
                  disabled={busyId === template.id}
                  onClick={() => {
                    window.location.hash = `/templates/${encodeURIComponent(template.id)}/edit`;
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                </IconButton>
              ) : null}
              <IconButton
                size="default"
                variant="ghost"
                aria-label={t("workflowTemplates.copyAria", {
                  name: template.name,
                })}
                title={t("workflowTemplates.copy")}
                disabled={busyId === template.id}
                onClick={() =>
                  setEditor({
                    mode: "copy",
                    sourceId: template.id,
                    name: t("workflowTemplates.copyName", {
                      name: template.name,
                    }),
                    description: template.description,
                  })
                }
              >
                <Copy size={16} aria-hidden="true" />
              </IconButton>
              <IconButton
                size="default"
                variant="ghost"
                aria-label={t("workflowTemplates.historyAria", {
                  name: template.name,
                })}
                title={t("workflowTemplates.history")}
                aria-expanded={expandedHistoryId === template.id}
                disabled={busyId === template.id}
                onClick={() => void toggleHistory(template)}
              >
                <History size={16} aria-hidden="true" />
              </IconButton>
              {template.status === "draft" ? (
                <IconButton
                  size="default"
                  variant="ghost"
                  aria-label={t("workflowTemplates.publishAria", {
                    name: template.name,
                  })}
                  title={t("workflowTemplates.action.publish")}
                  disabled={busyId === template.id}
                  onClick={() => {
                    setConfirmationError("");
                    setConfirmation({
                      kind: "transition",
                      template,
                      action: "publish",
                    });
                  }}
                >
                  <Rocket size={16} aria-hidden="true" />
                </IconButton>
              ) : null}
              {template.status === "published" ? (
                <>
                  <IconButton
                    size="default"
                    variant="ghost"
                    aria-label={t("workflowTemplates.createVersionAria", {
                      name: template.name,
                    })}
                    title={t("workflowTemplates.createVersion")}
                    disabled={busyId === template.id}
                    onClick={() => {
                      setConfirmationError("");
                      setConfirmation({ kind: "version", template });
                    }}
                  >
                    <GitBranchPlus size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    size="default"
                    variant="ghost"
                    aria-label={t("workflowTemplates.archiveAria", {
                      name: template.name,
                    })}
                    title={t("workflowTemplates.action.archive")}
                    disabled={busyId === template.id}
                    onClick={() => {
                      setConfirmationError("");
                      setConfirmation({
                        kind: "transition",
                        template,
                        action: "archive",
                      });
                    }}
                  >
                    <Archive size={16} aria-hidden="true" />
                  </IconButton>
                </>
              ) : null}
            </div>
            {expandedHistoryId === template.id ? (
              <div
                className="workflow-template-history"
                aria-label={t("workflowTemplates.versionHistoryAria", {
                  name: template.name,
                })}
              >
                {(versionHistory[template.id] ?? []).map((version) => (
                  <div key={version.id}>
                    <strong>v{version.version}</strong>
                    <span>{statusLabel(version.status, t)}</span>
                    <span>
                      {t("workflowTemplates.meta", {
                        version: version.version,
                        nodes: version.nodeCount,
                        edges: version.edgeCount,
                      }).replace(/^.*? · /, "")}
                    </span>
                    <code>{version.checksum.slice(0, 8)}</code>
                    <time>
                      {formatVersionTime(
                        version.publishedAt ?? version.createdAt,
                        locale,
                        t("workflowTemplates.unknownTime"),
                      )}
                    </time>
                    <IconButton
                      size="compact"
                      variant="ghost"
                      aria-label={t("workflowTemplates.previewVersionAria", {
                        version: version.version,
                      })}
                      title={t("workflowTemplates.previewVersion")}
                      onClick={() => {
                        window.location.hash = `/templates/${template.id}/versions/${version.id}`;
                      }}
                    >
                      <Eye size={15} aria-hidden="true" />
                    </IconButton>
                  </div>
                ))}
                {!versionHistory[template.id] ? (
                  <span>{t("common.loading")}</span>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
      </section>

      {editor ? (
        <Dialog
          open
          size="default"
          className="workflow-template-dialog"
          aria-label={
            editor.mode === "create"
              ? t("workflowTemplates.dialog.create")
              : editor.mode === "copy"
                ? t("workflowTemplates.dialog.copy")
                : t("workflowTemplates.dialog.edit")
          }
          locked={busyId !== undefined}
          onOpenChange={(open) => {
            if (!open) setEditor(undefined);
          }}
        >
          <form
            onSubmit={(event) => void submitEditor(event)}
          >
            <DialogHeader>
              <h2>
                {editor.mode === "create"
                  ? t("workflowTemplates.dialogHeading.create")
                  : editor.mode === "copy"
                    ? t("workflowTemplates.dialogHeading.copy")
                    : t("workflowTemplates.dialogHeading.edit")}
              </h2>
              <IconButton
                aria-label={t("common.close")}
                title={t("common.close")}
                variant="ghost"
                size="compact"
                onClick={() => setEditor(undefined)}
              >
                <X size={17} />
              </IconButton>
            </DialogHeader>
            <DialogBody className="workflow-node-form__body">
              <Field name="workflow-templates-name" label={t("workflowTemplates.name")}>
                <input
                  data-autofocus
                  required
                  maxLength={160}
                  value={editor.name}
                  onChange={(event) =>
                    setEditor({ ...editor, name: event.target.value })
                  }
                />
              </Field>
              <Field name="workflow-templates-description-field" label={t("workflowTemplates.descriptionField")}>
                <textarea
                  maxLength={4000}
                  rows={4}
                  value={editor.description}
                  onChange={(event) =>
                    setEditor({ ...editor, description: event.target.value })
                  }
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setEditor(undefined)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                type="submit"
                loading={busyId !== undefined}
                disabled={!editor.name.trim() || busyId !== undefined}
              >
                {editor.mode === "create"
                  ? t("workflowTemplates.createAction")
                  : editor.mode === "copy"
                    ? t("workflowTemplates.copyAction")
                    : t("workflowTemplates.saveAction")}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={confirmation !== undefined}
        title={
          confirmation?.kind === "transition"
            ? t(`workflowTemplates.action.${confirmation.action}`)
            : t("workflowTemplates.createVersion")
        }
        description={
          confirmation?.kind === "transition"
            ? t("workflowTemplates.transitionConfirm", {
                action: t(
                  `workflowTemplates.action.${confirmation.action}`,
                ),
                name: confirmation.template.name,
              })
            : confirmation
              ? t("workflowTemplates.createVersionConfirm", {
                  version: confirmation.template.currentVersion.version,
                })
              : ""
        }
        confirmLabel={
          confirmation?.kind === "transition"
            ? t(`workflowTemplates.action.${confirmation.action}`)
            : t("workflowTemplates.createVersion")
        }
        cancelLabel={t("common.cancel")}
        variant={
          confirmation?.kind === "transition" &&
          confirmation.action === "archive"
            ? "neutral"
            : "primary"
        }
        pending={busyId === confirmation?.template.id}
        error={confirmationError}
        onCancel={() => {
          setConfirmationError("");
          setConfirmation(undefined);
        }}
        onConfirm={
          confirmation?.kind === "transition"
            ? confirmTransition
            : confirmCreateNextVersion
        }
      />

    </div>
  );
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function statusLabel(
  status: WorkflowTemplateLibraryItemDto["status"],
  t: Translator,
): string {
  return t(`workflowTemplates.status.${status}`);
}

function formatVersionTime(
  timestamp: number | undefined,
  locale: string,
  unknownTime: string,
): string {
  return timestamp === undefined
    ? unknownTime
    : new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(timestamp);
}
