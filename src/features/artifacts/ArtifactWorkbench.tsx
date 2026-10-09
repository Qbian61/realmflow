import {
  Check,
  Code2,
  Eye,
  FolderOpen,
  Link2,
  PanelRightClose,
  Save,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type {
  RequirementManifest,
  WorkspaceApi,
  WorkspaceBinding,
  WorkspaceEntry,
  WorkspaceFile,
} from "../../../shared/workspace";
import type { RequirementStageId } from "../../domain/requirement";
import {
  Button,
  DocumentTabs,
  EmptyState,
  IconButton,
  InlineAlert,
  Spinner,
  Toolbar,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";
import { useUnsavedChangesGuard } from "../unsaved-changes/UnsavedChangesProvider";
import { ArtifactBinaryPreview } from "./ArtifactBinaryPreview";
import { ArtifactFileBrowser } from "./ArtifactFileBrowser";
import { ArtifactFixedLayoutPreview } from "./ArtifactFixedLayoutPreview";
import { ArtifactImagePreview } from "./ArtifactImagePreview";
import { fixedLayoutFileType } from "./fixed-layout-file-type";
import "./artifact-workbench.css";

const CodeEditor = lazy(() => import("./CodeEditor"));
const EMPTY_FILES: WorkspaceFile[] = [];

type OpenDocument = {
  file: WorkspaceFile;
  draft: string;
};

type ViewMode = "edit" | "preview";

type ArtifactWorkbenchProps = {
  requirementId: string;
  activeStage?: RequirementStageId;
  initialPath?: string;
  initialFiles?: WorkspaceFile[];
  workspaceApi?: WorkspaceApi;
  onClose?: () => void;
};

function defaultViewMode(file: WorkspaceFile): ViewMode {
  return ["markdown", "html", "image", "fixed-layout", "binary"].includes(file.kind)
    ? "preview"
    : "edit";
}

export default function ArtifactWorkbench({
  requirementId,
  activeStage,
  initialPath,
  initialFiles = EMPTY_FILES,
  workspaceApi,
  onClose,
}: ArtifactWorkbenchProps): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const api = workspaceApi ?? window.realmflow?.workspace;
  const [binding, setBinding] = useState<WorkspaceBinding | null>(null);
  const [manifest, setManifest] = useState<RequirementManifest | null>(null);
  const [entriesByDirectory, setEntriesByDirectory] = useState<
    Record<string, WorkspaceEntry[]>
  >({});
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    new Set(),
  );
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [viewModes, setViewModes] = useState<Record<string, ViewMode>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const documentsRef = useRef<OpenDocument[]>([]);

  const activeDocument = useMemo(
    () => documents.find((document) => document.file.path === activePath),
    [activePath, documents],
  );
  const activeMode = activePath ? (viewModes[activePath] ?? "edit") : "edit";
  const dirty =
    activeDocument !== undefined &&
    activeDocument.draft !== activeDocument.file.content;
  const hasDirtyDocuments = documents.some(
    (document) => document.draft !== document.file.content,
  );
  const hasOpenDocuments = documents.length > 0;

  const loadWorkspace = useCallback(
    async (nextBinding: WorkspaceBinding): Promise<void> => {
      if (!api) return;
      const [rootEntries, nextManifest] = await Promise.all([
        api.listDirectory(requirementId),
        api.readManifest(requirementId),
      ]);
      setBinding(nextBinding);
      setEntriesByDirectory({ "": rootEntries });
      setExpandedDirectories(new Set());
      setManifest(nextManifest);
    },
    [api, requirementId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setBinding(null);
    setManifest(null);
    setEntriesByDirectory({});
    documentsRef.current = [];
    const initialDocuments = initialFiles.map((file) => ({
      file,
      draft: file.content,
    }));
    documentsRef.current = initialDocuments;
    setDocuments(initialDocuments);
    setActivePath(initialDocuments[0]?.file.path);
    setViewModes(
      Object.fromEntries(
        initialFiles.map((file) => [file.path, defaultViewMode(file)]),
      ),
    );

    if (!api) {
      setLoading(false);
      return;
    }

    void api
      .getBinding(requirementId)
      .then(async (nextBinding) => {
        if (cancelled) return;
        if (nextBinding) await loadWorkspace(nextBinding);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("artifact.error.loadWorkspace"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, initialFiles, loadWorkspace, requirementId, t]);

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      if (!api) return;
      const existingDocument = documentsRef.current.find(
        (document) => document.file.path === path,
      );
      if (existingDocument) {
        setActivePath(path);
        return;
      }

      try {
        const file = await api.readFile(requirementId, path);
        const nextDocuments = [
          ...documentsRef.current,
          { file, draft: file.content },
        ];
        documentsRef.current = nextDocuments;
        setDocuments(nextDocuments);
        setActivePath(path);
        setViewModes((current) => ({
          ...current,
          [path]: defaultViewMode(file),
        }));
        if (
          file.kind === "html" ||
          file.kind === "image"
        ) {
          const previewUrl = await api.getPreviewUrl(requirementId, path);
          setPreviewUrls((current) => ({ ...current, [path]: previewUrl }));
        }
      } catch {
        toast.error("artifact.error.open");
      }
    },
    [api, requirementId, toast],
  );

  useEffect(() => {
    if (!activeStage) return;
    const stageArtifacts = manifest?.stages[activeStage]?.artifacts ?? [];
    const primaryArtifact =
      stageArtifacts.find((artifact) => artifact.primary) ?? stageArtifacts[0];
    if (primaryArtifact) void openFile(primaryArtifact.path);
  }, [activeStage, manifest, openFile]);

  useEffect(() => {
    if (initialPath) void openFile(initialPath);
  }, [initialPath, openFile]);

  const chooseDirectory = async (): Promise<void> => {
    if (!api) return;
    try {
      const nextBinding = await api.chooseDirectory(requirementId);
      if (nextBinding) await loadWorkspace(nextBinding);
    } catch {
      toast.error("artifact.error.bind");
    }
  };

  const toggleDirectory = async (path: string): Promise<void> => {
    if (!api) return;
    if (expandedDirectories.has(path)) {
      setExpandedDirectories((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
      return;
    }

    if (!entriesByDirectory[path]) {
      try {
        const entries = await api.listDirectory(requirementId, path);
        setEntriesByDirectory((current) => ({ ...current, [path]: entries }));
      } catch {
        toast.error("artifact.error.expand");
        return;
      }
    }
    setExpandedDirectories((current) => new Set(current).add(path));
  };

  const saveDocument = useCallback(async (path: string): Promise<boolean> => {
    if (!api) return false;
    const document = documentsRef.current.find(
      (candidate) => candidate.file.path === path,
    );
    if (!document || document.draft === document.file.content) return true;
    setSaving(true);
    try {
      const savedFile = await api.writeFile({
        requirementId,
        path: document.file.path,
        content: document.draft,
        expectedVersion: document.file.version,
      });
      const nextDocuments = documentsRef.current.map((candidate) =>
        candidate.file.path === document.file.path
          ? { file: savedFile, draft: savedFile.content }
          : candidate,
      );
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      setStatus(t("artifact.saved"));
      return true;
    } catch {
      toast.error("artifact.error.save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [api, requirementId, t, toast]);

  const saveActiveFile = useCallback(async (): Promise<boolean> => {
    if (!activeDocument || !dirty || saving) return false;
    return saveDocument(activeDocument.file.path);
  }, [activeDocument, dirty, saveDocument, saving]);

  const discardDocument = useCallback((path: string): void => {
    const nextDocuments = documentsRef.current.map((document) =>
      document.file.path === path
        ? { ...document, draft: document.file.content }
        : document,
    );
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
  }, []);

  const saveAllDocuments = useCallback(async (): Promise<boolean> => {
    const paths = documentsRef.current
      .filter((document) => document.draft !== document.file.content)
      .map((document) => document.file.path);
    for (const path of paths) {
      if (!(await saveDocument(path))) return false;
    }
    return true;
  }, [saveDocument]);

  const discardAllDocuments = useCallback((): void => {
    const nextDocuments = documentsRef.current.map((document) => ({
      ...document,
      draft: document.file.content,
    }));
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
  }, []);

  const unsavedChanges = useUnsavedChangesGuard({
    id: `artifact:${requirementId}`,
    dirty: hasDirtyDocuments,
    save: saveAllDocuments,
    discard: discardAllDocuments,
  });

  useEffect(() => {
    const saveOnShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveFile();
      }
    };
    window.addEventListener("keydown", saveOnShortcut);
    return () => window.removeEventListener("keydown", saveOnShortcut);
  }, [saveActiveFile]);

  const closeDocument = (path: string): void => {
    const document = documentsRef.current.find(
      (item) => item.file.path === path,
    );
    const close = (): void => {
      const remainingDocuments = documentsRef.current.filter(
        (item) => item.file.path !== path,
      );
      documentsRef.current = remainingDocuments;
      setDocuments(remainingDocuments);
      if (activePath === path) {
        setActivePath(remainingDocuments.at(-1)?.file.path);
      }
    };
    unsavedChanges.requestScoped(close, {
      dirty: Boolean(
        document && document.draft !== document.file.content,
      ),
      save: () => saveDocument(path),
      discard: () => discardDocument(path),
    });
  };

  const associateWithStage = async (): Promise<void> => {
    if (!api || !activeDocument || !manifest || !activeStage) return;
    const existingArtifacts = manifest.stages[activeStage]?.artifacts ?? [];
    const nextArtifacts = existingArtifacts
      .filter((artifact) => artifact.path !== activeDocument.file.path)
      .map((artifact) => ({ ...artifact, primary: false }));
    nextArtifacts.push({ path: activeDocument.file.path, primary: true });
    const nextManifest: RequirementManifest = {
      ...manifest,
      stages: {
        ...manifest.stages,
        [activeStage]: { artifacts: nextArtifacts },
      },
    };

    try {
      const savedManifest = await api.writeManifest(
        requirementId,
        nextManifest,
      );
      setManifest(savedManifest);
      setStatus(
        t("artifact.associated", {
          stage: t(`artifact.stage.${activeStage}`),
        }),
      );
    } catch {
      toast.error("artifact.error.associate");
    }
  };

  if (loading) {
    return (
      <aside
        className="artifact-workbench artifact-workbench-loading"
        role="status"
        aria-busy="true"
      >
        <Spinner size={20} />
        <span>{t("artifact.loading")}</span>
      </aside>
    );
  }

  return (
    <aside
      className="artifact-workbench"
      aria-label={t("artifact.workspaceAria")}
    >
      <header className="artifact-workbench-header">
        <div>
          <span>ARTIFACTS</span>
          <strong>{t("artifact.title")}</strong>
        </div>
        <div className="artifact-workbench-header-actions">
          {binding && (
            <IconButton
              size="compact"
              variant="ghost"
              aria-label={t("artifact.showInFinderAria")}
              title={t("artifact.showInFinder")}
              onClick={() => void api?.showItem(requirementId, "")}
            >
              <FolderOpen size={16} />
            </IconButton>
          )}
          {onClose ? (
            <IconButton
              size="compact"
              variant="ghost"
              aria-label={t("artifact.close")}
              title={t("artifact.close")}
              onClick={() => unsavedChanges.request(onClose)}
            >
              <PanelRightClose size={16} />
            </IconButton>
          ) : null}
        </div>
      </header>

      {!api ? (
        <EmptyState
          className="artifact-empty-state"
          icon={<FolderOpen size={28} strokeWidth={1.5} />}
          title={t("artifact.desktopOnly")}
          description={t("artifact.desktopOnlyDescription")}
        />
      ) : !binding && !hasOpenDocuments ? (
        <EmptyState
          className="artifact-empty-state"
          icon={<FolderOpen size={30} strokeWidth={1.5} />}
          title={t("artifact.bindTitle")}
          description={t("artifact.bindDescription")}
          action={
            <Button variant="primary" onClick={() => void chooseDirectory()}>
              {t("artifact.bind")}
            </Button>
          }
        />
      ) : (
        <div className={binding ? "artifact-workbench-body" : "artifact-workbench-body documents-only"}>
          {binding ? (
            <ArtifactFileBrowser
              activePath={activePath}
              binding={binding}
              entriesByDirectory={entriesByDirectory}
              expandedDirectories={expandedDirectories}
              labels={{
                changeDirectory: t("artifact.changeDirectory"),
                fileList: t("artifact.fileList"),
              }}
              onChangeDirectory={() => void chooseDirectory()}
              onOpenFile={(path) => void openFile(path)}
              onToggleDirectory={(path) => void toggleDirectory(path)}
            />
          ) : null}

          <section className="artifact-editor-pane">
            <DocumentTabs
              className="artifact-tabs"
              value={activePath ?? ""}
              items={documents.map((document) => ({
                value: document.file.path,
                label: document.file.name,
                dirty: document.draft !== document.file.content,
                closable: true,
              }))}
              onValueChange={setActivePath}
              onClose={closeDocument}
              getCloseLabel={(item) =>
                t("artifact.closeFile", { name: item.label })
              }
              aria-label={t("artifact.openFiles")}
            />

            {activeDocument ? (
              <>
                <Toolbar
                  className="artifact-editor-toolbar"
                  aria-label={t("artifact.openFiles")}
                >
                  <div className="artifact-view-switch">
                    {["markdown", "html"].includes(activeDocument.file.kind) ? (
                      <>
                        <button
                          className={activeMode === "edit" ? "active" : ""}
                          type="button"
                          aria-label={t("artifact.editFile")}
                          onClick={() =>
                            setViewModes((current) => ({
                              ...current,
                              [activeDocument.file.path]: "edit",
                            }))
                          }
                        >
                          <Code2 size={15} />
                          {t("artifact.edit")}
                        </button>
                        <button
                          className={activeMode === "preview" ? "active" : ""}
                          type="button"
                          aria-label={t("artifact.previewFile")}
                          onClick={() =>
                            setViewModes((current) => ({
                              ...current,
                              [activeDocument.file.path]: "preview",
                            }))
                          }
                        >
                          <Eye size={15} />
                          {t("artifact.preview")}
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div className="artifact-editor-actions">
                    {activeStage ? (
                      <button
                        type="button"
                        aria-label={t("artifact.associateAria", {
                          stage: t(`artifact.stage.${activeStage}`),
                        })}
                        title={t("artifact.associate")}
                        onClick={() => void associateWithStage()}
                      >
                        <Link2 size={15} />
                        {t("artifact.associate")}
                      </button>
                    ) : null}
                    {!["image", "fixed-layout", "binary"].includes(
                      activeDocument.file.kind,
                    ) ? (
                      <button
                        type="button"
                        aria-label={t("artifact.saveFile")}
                        title={t("artifact.saveFile")}
                        disabled={!dirty || saving}
                        aria-busy={saving || undefined}
                        onClick={() => void saveActiveFile()}
                      >
                        {saving ? (
                          <Spinner size={15} />
                        ) : status === t("artifact.saved") && !dirty ? (
                          <Check size={15} />
                        ) : (
                          <Save size={15} />
                        )}
                        {t("artifact.save")}
                      </button>
                    ) : null}
                  </div>
                </Toolbar>

                <div className="artifact-editor-content">
                  {activeDocument.file.kind === "markdown" &&
                  activeMode === "preview" ? (
                    <article className="artifact-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                      >
                        {activeDocument.draft}
                      </ReactMarkdown>
                    </article>
                  ) : activeDocument.file.kind === "html" &&
                    activeMode === "preview" ? (
                    <iframe
                      title={t("artifact.htmlPreview", {
                        name: activeDocument.file.name,
                      })}
                      sandbox=""
                      src={previewUrls[activeDocument.file.path]}
                    />
                  ) : activeDocument.file.kind === "image" ? (
                    <ArtifactImagePreview
                      src={previewUrls[activeDocument.file.path]}
                      alt={activeDocument.file.name}
                      failedLabel={t("artifact.imageFailed")}
                      retryLabel={t("artifact.retryImage")}
                    />
                  ) : activeDocument.file.kind === "fixed-layout" ? (
                    <ArtifactFixedLayoutPreview
                      fileType={fixedLayoutFileType(activeDocument.file)}
                      loadBytes={() => {
                        if (!api?.readPreviewBytes) {
                          return Promise.reject(
                            new Error("Fixed-layout preview is unavailable"),
                          );
                        }
                        return api.readPreviewBytes(
                          requirementId,
                          activeDocument.file.path,
                        );
                      }}
                      name={activeDocument.file.name}
                      loadingLabel={
                        fixedLayoutFileType(activeDocument.file) === "pdf"
                          ? t("artifact.pdfLoading")
                          : t("artifact.fixedLayoutLoading")
                      }
                      failedLabel={
                        fixedLayoutFileType(activeDocument.file) === "pdf"
                          ? t("artifact.pdfFailed")
                          : t("artifact.fixedLayoutFailed")
                      }
                    />
                  ) : activeDocument.file.kind === "binary" ? (
                    <ArtifactBinaryPreview
                      name={activeDocument.file.name}
                      unsupportedLabel={t("artifact.binaryPreviewUnsupported")}
                      showInFinderLabel={t("artifact.showInFinder")}
                      onShowInFinder={() =>
                        void api?.showItem(
                          requirementId,
                          activeDocument.file.path,
                        )
                      }
                    />
                  ) : (
                    <Suspense
                      fallback={
                        <div className="artifact-editor-loading">
                          {t("artifact.editorLoading")}
                        </div>
                      }
                    >
                      <CodeEditor
                        language={activeDocument.file.language}
                        path={activeDocument.file.path}
                        value={activeDocument.draft}
                        onChange={(value) => {
                          setStatus("");
                          const nextDocuments = documentsRef.current.map(
                            (document) =>
                              document.file.path === activeDocument.file.path
                                ? { ...document, draft: value }
                                : document,
                          );
                          documentsRef.current = nextDocuments;
                          setDocuments(nextDocuments);
                        }}
                      />
                    </Suspense>
                  )}
                </div>
              </>
            ) : (
              <div className="artifact-editor-empty">
                <Code2 size={26} strokeWidth={1.5} />
                <strong>{t("artifact.selectFile")}</strong>
                {activeStage ? (
                  <p>
                    {t("artifact.currentStage", {
                      stage: t(`artifact.stage.${activeStage}`),
                    })}
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}

      {error ? (
        <InlineAlert
          className="artifact-message error"
          tone="danger"
          title={error}
        />
      ) : status ? (
        <div className="artifact-message" role="status">
          {status}
        </div>
      ) : null}
    </aside>
  );
}
