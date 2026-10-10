import { useCallback, useState } from "react";
import {
  createHashRouter,
  RouterProvider,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router-dom";
import type { RendererRepositories } from "./application/ports/repositories";
import { AppRoutes } from "./app/AppRoutes";
import { useWorkspaceController } from "./app/hooks/use-workspace-controller";
import {
  publishWorkspaceOperationNotice
} from "./app/hooks/workspace-toast";
import { useAiRunController } from "./app/hooks/use-ai-run-controller";
import { WorkspaceLayout } from "./features/navigation/WorkspaceLayout";
import { PermissionPromptHost } from "./features/permissions/PermissionPromptHost";
import {
  ToastProvider,
  useToast
} from "./features/toast/ToastProvider";
import { TooltipProvider } from "./features/tooltip/TooltipProvider";
import { UnsavedChangesProvider } from "./features/unsaved-changes/UnsavedChangesProvider";
import { WorkbenchProvider } from "./features/workbench/WorkbenchProvider";
import { createInMemoryRendererRepositories } from "./infrastructure/storage/renderer-repositories";
import {
  LocalizationProvider,
  useLocalization,
} from "./localization/LocalizationProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import type { ReasoningPreference } from "../domain/reasoning-router";
import type { ConversationAttachmentSubmission } from "../shared/conversation-attachments";
import type { SendFollowUpSuggestionCommand } from "../shared/business";

function AppShell({
  repositories: providedRepositories,
  degraded,
}: {
  repositories?: RendererRepositories;
  degraded: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionRoute = useMatch("/sessions/:sessionId");
  const { locale, t } = useLocalization();
  const toast = useToast();
  const handleWorkspaceOperationNotice = useCallback(
    (notice: Parameters<typeof publishWorkspaceOperationNotice>[1]) => {
      publishWorkspaceOperationNotice(toast, notice);
    },
    [toast]
  );
  const [repositories] = useState(
    () => providedRepositories ?? createInMemoryRendererRepositories(),
  );
  const {
    spaces,
    requirementsBySpace,
    sessions,
    recentSessions,
    recentFolderPaths,
    recentFilters,
    recentSessionsLoading,
    updateRecentFilters,
    createSpace,
    renameSpace,
    relocateSpace,
    deleteSpace,
    moveSpace,
    createRequirement,
    renameRequirement,
    deleteRequirement,
    moveRequirement,
    createSession,
    appendSessionMessage,
    renameConversation,
    deleteConversation,
    sessionsLoading,
    persistenceIssues,
  } = useWorkspaceController({
    navigationRepository: repositories.workspaceNavigation,
    sessionRepository: repositories.chatSessions,
    business: window.realmflow?.business,
    activeSessionId: sessionRoute?.params.sessionId,
    applicationLocale: locale,
    onOperationNotice: handleWorkspaceOperationNotice,
  });
  const aiRuns = useAiRunController(window.realmflow?.aiRuns);
  const sendFollowUpSuggestion = window.realmflow?.business.sendFollowUpSuggestion
    ? async (command: SendFollowUpSuggestionCommand): Promise<void> => {
        await window.realmflow?.business.sendFollowUpSuggestion(command);
      }
    : undefined;

  const createSpaceSession = (
    spacePath: string,
    prompt: string,
    modelProfileId?: string,
    reasoningMode: ReasoningPreference = "auto",
    attachments?: ConversationAttachmentSubmission,
  ): Promise<void> => {
    return createSession(
      spacePath,
      prompt,
      modelProfileId,
      reasoningMode,
      attachments,
    ).then(
      (sessionId) => {
        navigate(`/sessions/${sessionId}`);
      },
    );
  };
  const deleteRecentConversation = async (
    sessionId: string,
  ): Promise<boolean> => {
    const deleted = await deleteConversation(sessionId);
    if (deleted && location.pathname === `/sessions/${sessionId}`) {
      navigate("/chat/new");
    }
    return deleted;
  };

  return (
    <>
      <WorkspaceLayout
        spaces={spaces}
        requirementsBySpace={requirementsBySpace}
        recentSessions={recentSessions}
        recentFolderPaths={recentFolderPaths}
        recentFilters={recentFilters}
        recentSessionsLoading={recentSessionsLoading}
        business={window.realmflow?.business}
        onRecentFilterChange={updateRecentFilters}
        onRenameConversation={renameConversation}
        onDeleteConversation={deleteRecentConversation}
        onCreateSpace={createSpace}
        onRenameSpace={renameSpace}
        onRelocateSpace={relocateSpace}
        onDeleteSpace={deleteSpace}
        onMoveSpace={moveSpace}
        onCreateRequirement={createRequirement}
        onRenameRequirement={renameRequirement}
        onDeleteRequirement={deleteRequirement}
        onMoveRequirement={moveRequirement}
        status={
          degraded || persistenceIssues.length > 0 ? (
            <div
              className="persistence-notice"
              role="status"
              aria-label={t("app.persistenceStatus")}
            >
              {t("app.persistenceUnavailable")}
            </div>
          ) : null
        }
      >
        <AppRoutes
          spaces={spaces}
          requirementsBySpace={requirementsBySpace}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          onCreateRequirement={createRequirement}
          onCreateSession={createSpaceSession}
          onAppendMessage={appendSessionMessage}
          onSendFollowUpSuggestion={sendFollowUpSuggestion}
          aiRuns={aiRuns}
        />
      </WorkspaceLayout>
      <PermissionPromptHost />
    </>
  );
}

export default function App({
  repositories,
  degraded = false,
}: {
  repositories?: RendererRepositories;
  degraded?: boolean;
}): JSX.Element {
  const [router] = useState(() =>
    createHashRouter([
      {
        path: "*",
        element: (
          <UnsavedChangesProvider>
            <WorkbenchProvider>
              <AppShell repositories={repositories} degraded={degraded} />
            </WorkbenchProvider>
          </UnsavedChangesProvider>
        ),
      },
    ]),
  );

  return (
    <ThemeProvider>
      <LocalizationProvider>
        <TooltipProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </TooltipProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
