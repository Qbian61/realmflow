import { ArrowUpRight } from "lucide-react";
import { lazy, Suspense } from "react";
import {
  type Location,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import type { AiRunController } from "./hooks/use-ai-run-controller";
import { PageBody, PageShell } from "../components/ui";
import type { ChatSession } from "../domain/chat-session";
import type { WorkspaceRequirement, WorkspaceSpace } from "../domain/workspace";
import { WorkspaceRouteCache } from "../features/navigation/WorkspaceRouteCache";
import { useLocalization } from "../localization/LocalizationProvider";
import { getPrimaryNavigation, getUtilityPages } from "../navigation";
import AnalyticsPage from "../pages/AnalyticsPage";
import CapabilitiesPage from "../pages/CapabilitiesPage";
import ChatSessionPage from "../pages/ChatSessionPage";
import HelpPage from "../pages/HelpPage";
import { NewChatPage } from "../pages/NewChatPage";
import type { ReasoningPreference } from "../../domain/reasoning-router";
import type { ConversationAttachmentSubmission } from "../../shared/conversation-attachments";
import type { SendFollowUpSuggestionCommand } from "../../shared/business";
import RequirementDetailPage from "../pages/RequirementDetailPage";
import SchedulePage from "../pages/SchedulePage";
import SettingsPage from "../pages/SettingsPage";
import SpaceDetailPage from "../pages/SpaceDetailPage";
import UpdatesPage from "../pages/UpdatesPage";
import WorkbenchHubPage from "../pages/WorkbenchHubPage";
import WorkflowTemplatesPage from "../pages/WorkflowTemplatesPage";

const WorkflowTemplateCanvasPage = lazy(
  () => import("../pages/WorkflowTemplateCanvasPage"),
);

const DYNAMIC_WORKSPACE_PATHS = [
  /^\/templates\/[^/]+\/edit$/,
  /^\/templates\/[^/]+\/versions\/[^/]+$/,
  /^\/sessions\/[^/]+$/,
  /^\/spaces\/[^/]+$/,
  /^\/spaces\/[^/]+\/requirements\/[^/]+$/,
];

type AppRoutesProps = {
  spaces: WorkspaceSpace[];
  requirementsBySpace: Record<string, WorkspaceRequirement[]>;
  sessions: ChatSession[];
  sessionsLoading: boolean;
  onCreateRequirement: (
    spacePath: string,
    title: string,
    templateVersionId?: string,
  ) => void | Promise<void>;
  onCreateSession: (
    spacePath: string,
    prompt: string,
    modelProfileId?: string,
    reasoningMode?: ReasoningPreference,
    attachments?: ConversationAttachmentSubmission,
  ) => void | Promise<void>;
  onAppendMessage: (
    sessionId: string,
    content: string,
    modelProfileId?: string,
    reasoningMode?: ReasoningPreference,
    attachments?: ConversationAttachmentSubmission,
  ) => void | Promise<void>;
  onSendFollowUpSuggestion?: (
    command: SendFollowUpSuggestionCommand,
  ) => void | Promise<void>;
  aiRuns: AiRunController;
};

export function AppRoutes({
  spaces,
  requirementsBySpace,
  sessions,
  sessionsLoading,
  onCreateRequirement,
  onCreateSession,
  onAppendMessage,
  onSendFollowUpSuggestion,
  aiRuns,
}: AppRoutesProps): JSX.Element {
  const { t } = useLocalization();
  const allPages = [
    ...getPrimaryNavigation(t),
    ...spaces,
    ...getUtilityPages(t),
  ];
  const staticPaths = new Set(allPages.map(({ path }) => path));
  const shouldCache = (location: Location): boolean =>
    staticPaths.has(location.pathname) ||
    DYNAMIC_WORKSPACE_PATHS.some((pattern) =>
      pattern.test(location.pathname),
    );

  return (
    <PageShell className="app-route-page">
      <PageBody
        as="main"
        id="main-content"
        tabIndex={-1}
        mode="workspace"
        className="app-route-page__body"
      >
        <WorkspaceRouteCache shouldCache={shouldCache}>
          {(location) => (
            <Routes location={location}>
              <Route path="/" element={<WorkbenchHubPage />} />
              <Route
                path="/chat/new"
                element={
                  <NewChatPage
                    spaces={spaces}
                    onCreateSession={onCreateSession}
                  />
                }
              />
              <Route path="/schedules" element={<SchedulePage />} />
              <Route path="/capabilities" element={<CapabilitiesPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/workflows" element={<WorkflowTemplatesPage />} />
              <Route
                path="/templates/:templateId/edit"
                element={
                  <Suspense
                    fallback={<div role="status">{t("common.loading")}</div>}
                  >
                    <WorkflowTemplateCanvasPage />
                  </Suspense>
                }
              />
              <Route
                path="/templates/:templateId/versions/:versionId"
                element={
                  <Suspense
                    fallback={<div role="status">{t("common.loading")}</div>}
                  >
                    <WorkflowTemplateCanvasPage />
                  </Suspense>
                }
              />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/updates" element={<UpdatesPage />} />
              <Route path="/feedback" element={<HelpPage />} />
              <Route
                path="/spaces/:spaceId"
                element={
                  <SpaceDetailPage
                    spaces={spaces}
                    requirementsBySpace={requirementsBySpace}
                    onCreateRequirement={onCreateRequirement}
                    onCreateSession={onCreateSession}
                  />
                }
              />
              <Route
                path="/sessions/:sessionId"
                element={
                  <ChatSessionPage
                    sessions={sessions}
                    spaces={spaces}
                    loading={sessionsLoading}
                    onAppendMessage={onAppendMessage}
                    onSendFollowUpSuggestion={onSendFollowUpSuggestion}
                  />
                }
              />
              <Route
                path="/spaces/:spaceId/requirements/:requirementId"
                element={
                  <RequirementDetailPage
                    spaces={spaces}
                    requirementsBySpace={requirementsBySpace}
                    aiRuns={aiRuns}
                    loading={sessionsLoading}
                  />
                }
              />
              {allPages
                .filter(
                  ({ path }) =>
                    path !== "/" &&
                    path !== "/chat/new" &&
                    path !== "/schedules" &&
                    path !== "/capabilities" &&
                    path !== "/analytics" &&
                    path !== "/workflows" &&
                    path !== "/settings" &&
                    path !== "/updates" &&
                    path !== "/feedback" &&
                    !path.startsWith("/spaces/"),
                )
                .map(({ path, label, description }) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <EmptyPage title={label} description={description} />
                    }
                  />
                ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </WorkspaceRouteCache>
      </PageBody>
    </PageShell>
  );
}

function EmptyPage({
  title,
  description,
}: {
  title: string;
  description: string;
}): JSX.Element {
  const { t } = useLocalization();

  return (
    <div className="page">
      <div className="page-kicker">REALMFLOW / {title.toUpperCase()}</div>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="page-mark" aria-hidden="true">
          <ArrowUpRight size={22} strokeWidth={1.7} />
        </div>
      </div>
      <div className="page-rule" />
      <section className="empty-state">
        <span>{t("page.ready")}</span>
        <strong>{title}</strong>
      </section>
    </div>
  );
}
