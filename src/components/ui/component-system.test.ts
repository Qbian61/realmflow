import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

describe("frontend component system", () => {
  it("defines the supported control and radius scales without color-value tokens", () => {
    const path = resolve(process.cwd(), "src/components/ui/ui.css");

    expect(existsSync(path)).toBe(true);

    const styles = readFileSync(path, "utf8");
    expect(styles).toContain("--ui-control-compact: 28px");
    expect(styles).toContain("--ui-control-default: 32px");
    expect(styles).toContain("--ui-control-comfortable: 36px");
    expect(styles).toContain("--ui-radius-small: 4px");
    expect(styles).toContain("--ui-radius-medium: 6px");
    expect(styles).toContain("--ui-radius-large: 8px");
    expect(styles).not.toMatch(/^\s*--tone-[^:]+:/m);
  });

  it("uses explicit interaction properties and reduced-motion fallbacks", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/components/ui/ui.css"),
      "utf8",
    );

    expect(styles).not.toMatch(/transition:\s*all/);
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toMatch(/\.ui-button:focus-visible\s*\{[^}]*outline:/s);
  });

  it("keeps every stylesheet with motion paired with a local reduced-motion fallback", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const cssFiles = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".css"));

    for (const path of cssFiles) {
      const source = readFileSync(resolve(sourceRoot, path), "utf8");
      if (!/(?:animation(?:-name)?|transition)\s*:/.test(source)) continue;

      expect(source, path).toContain(
        "@media (prefers-reduced-motion: reduce)",
      );
    }
  });

  it("keeps spinner animation and programmatic motion on shared primitives", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const productionFiles = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter(
        (path) =>
          /\.(?:css|ts|tsx)$/.test(path) &&
          !path.endsWith(".test.ts") &&
          !path.endsWith(".test.tsx"),
      );
    const source = productionFiles
      .map((path) => readFileSync(resolve(sourceRoot, path), "utf8"))
      .join("\n");

    expect(source).not.toMatch(
      /\b(?:spinning|is-spinning|is-refreshing|model-validating-icon)\b/,
    );
    expect(source).not.toMatch(
      /@keyframes\s+(?:artifact-spin|model-validation-spin|support-spin|workbench-dashboard-spin)\b/,
    );
    expect(source).not.toMatch(
      /\.workflow-canvas-add-menu\s*\{[^}]*animation:/s,
    );
    expect(source).toContain("getProgrammaticScrollBehavior");
  });

  it("limits authored keyframe declarations to transform and opacity", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const cssFiles = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".css"));

    for (const path of cssFiles) {
      const source = readFileSync(resolve(sourceRoot, path), "utf8");
      const keyframeStarts = source.matchAll(/@keyframes\s+[\w-]+\s*\{/g);
      for (const match of keyframeStarts) {
        const bodyStart = (match.index ?? 0) + match[0].length;
        let depth = 1;
        let cursor = bodyStart;
        while (cursor < source.length && depth > 0) {
          if (source[cursor] === "{") depth += 1;
          if (source[cursor] === "}") depth -= 1;
          cursor += 1;
        }
        const body = source.slice(bodyStart, cursor - 1);
        const properties = [...body.matchAll(/^\s*([\w-]+)\s*:/gm)].map(
          (property) => property[1],
        );

        for (const property of properties) {
          expect(["opacity", "transform"], `${path}: ${match[0]}`).toContain(
            property,
          );
        }
      }
    }
  });

  it("keeps migrated feature surfaces on shared primitives", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    for (const legacySelector of [
      ".schedule-dialog-backdrop",
      ".template-dialog-backdrop",
      ".template-migration-backdrop",
      ".schedule-field input",
      ".template-migration-dialog footer button",
      ".schedule-recommendation:hover",
    ]) {
      expect(applicationStyles).not.toContain(legacySelector);
    }

    expect(applicationStyles).toMatch(
      /\.schedule-create-dialog\s*\{[^}]*display: contents;/s,
    );
    expect(applicationStyles).toMatch(
      /\.template-migration-dialog\s*\{[^}]*display: contents;/s,
    );
  });

  it("keeps legacy tone declarations inside theme token blocks", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const withoutThemeTokens = applicationStyles
      .replace(/:root\s*\{[^}]*\}/s, "")
      .replace(/\[data-theme='dark'\]\s*\{[^}]*\}/s, "");

    expect(withoutThemeTokens).not.toMatch(/^\s*--tone-[^:]+:/m);
  });

  it("keeps focus restoration alongside shared outline suppression", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/components/ui/ui.css"),
      "utf8",
    );

    expect(styles).toMatch(
      /\.ui-field (?:input|select|textarea)[^{]*\{[^}]*outline: 0;/s,
    );
    expect(styles).toMatch(
      /\.ui-field input:focus-visible,[\s\S]*?\.ui-field textarea:focus-visible\s*\{[^}]*outline: 2px solid/s,
    );
    expect(styles).toMatch(
      /\.ui-menu-item:focus-visible\s*\{[^}]*box-shadow: inset 0 0 0 1px var\(--color-focus\)/s,
    );
  });

  it("uses named overlay layers and dynamic viewport dialog geometry", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/components/ui/ui.css"),
      "utf8",
    );

    expect(styles).toContain("--ui-layer-menu: 80");
    expect(styles).toContain("--ui-layer-overlay: 100");
    expect(styles).toContain("--ui-layer-dialog: 120");
    expect(styles).toContain("--ui-layer-toast: 140");
    expect(styles).toContain("--ui-layer-tooltip: 160");
    expect(styles).toMatch(
      /\.ui-dialog-backdrop\s*\{[^}]*z-index: var\(--ui-layer-dialog\);[^}]*overflow: hidden;/s,
    );
    expect(styles).toMatch(
      /\.ui-dialog\s*\{[^}]*max-height: calc\(100dvh - 32px\);[^}]*min-height: 0;/s,
    );
    expect(styles).toMatch(
      /\.ui-dialog__body\s*\{[^}]*min-height: 0;[^}]*flex: 1 1 auto;[^}]*overflow: auto;/s,
    );
  });

  it("keeps migrated long-dialog surfaces out of scroll ownership", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    const ruleBodies = (
      selector: string,
    ): string[] =>
      [...applicationStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) =>
          match[1]
            ?.split(",")
            .map((candidate) => candidate.trim())
            .includes(selector),
        )
        .map((match) => match[2] ?? "");
    const forbiddenShellProperties =
      /(?:^|;)\s*(?:max-height|overflow(?:-y)?|padding|color|background|border(?:-radius)?|box-shadow)\s*:/;

    for (const selector of [
      ".space-resource-dialog",
      ".model-editor",
      ".capability-import-dialog",
      ".workflow-template-dialog",
      ".workflow-node-dialog",
      ".workflow-node-config-dialog",
      ".workbench-hub-settings-dialog",
    ]) {
      for (const body of ruleBodies(selector)) {
        expect(body).not.toMatch(forbiddenShellProperties);
      }
    }

    for (const compatibilitySelector of [
      ".model-editor.ui-dialog",
      ".capability-import-dialog.ui-dialog",
      ".workflow-template-dialog.ui-dialog",
      ".workflow-node-dialog.ui-dialog",
    ]) {
      expect(applicationStyles).not.toContain(compatibilitySelector);
    }

    for (const orphanSelector of [
      ".workbench-site-modal",
      ".workbench-memo-modal",
    ]) {
      expect(applicationStyles).not.toContain(orphanSelector);
    }

    expect(applicationStyles).toMatch(
      /\.repository-snapshot-preview\s*\{[^}]*overflow: hidden;/s,
    );
    expect(applicationStyles).toMatch(
      /\.workflow-node-config-dialog__form\s*\{[^}]*min-height: 0;[^}]*flex: 1 1 auto;/s,
    );
    expect(applicationStyles).not.toMatch(
      /@media \(max-width: 720px\)\s*\{[\s\S]*?\.capability-builder-dialog\s*\{[^}]*max-height:/,
    );
  });

  it("does not reintroduce private dialog backdrop systems", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const files = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter(
        (path) =>
          /\.(?:css|tsx)$/.test(path) && !path.endsWith(".test.tsx"),
      );
    const source = files
      .map((path) => readFileSync(resolve(sourceRoot, path), "utf8"))
      .join("\n");

    for (const legacyBackdrop of [
      "space-resource-dialog-backdrop",
      "model-editor-backdrop",
      "workflow-template-dialog-backdrop",
      "modal-backdrop",
      "workbench-site-modal-backdrop",
      "workbench-task-modal-backdrop",
      "workbench-memo-modal-backdrop",
      "workbench-hub-dialog-backdrop",
      "global-url-dialog-backdrop",
    ]) {
      expect(source).not.toContain(legacyBackdrop);
    }
  });

  it("does not use native browser confirmation or input dialogs", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const files = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter(
        (path) =>
          /\.(?:ts|tsx)$/.test(path) &&
          !path.endsWith(".test.ts") &&
          !path.endsWith(".test.tsx"),
      );

    for (const path of files) {
      const source = readFileSync(resolve(sourceRoot, path), "utf8");
      expect(source, path).not.toMatch(
        /\bwindow\.(?:confirm|prompt|alert)\s*\(/,
      );
    }
  });

  it("keeps feature confirmations on the shared ConfirmDialog shell", () => {
    const taskDialogs = readFileSync(
      resolve(
        process.cwd(),
        "src/features/workbench-hub/tasks/TaskDialogs.tsx",
      ),
      "utf8",
    );
    const siteWorkbench = readFileSync(
      resolve(
        process.cwd(),
        "src/features/workbench-hub/sites/SiteWorkbenchPage.tsx",
      ),
      "utf8",
    );
    const nodeTodoDialog = readFileSync(
      resolve(
        process.cwd(),
        "src/features/workflow/NodeTodoDeleteDialog.tsx",
      ),
      "utf8",
    );

    expect(taskDialogs).toMatch(
      /export function TaskConfirmDialog[\s\S]*?return \(\s*<ConfirmDialog/,
    );
    expect(siteWorkbench).not.toMatch(/function ConfirmDialog\s*\(/);
    expect(siteWorkbench).toContain("<ConfirmDialog");
    expect(nodeTodoDialog).toContain("<ConfirmDialog");
    expect(nodeTodoDialog).not.toContain("<Dialog");
  });

  it("keeps sortable feature surfaces on the shared drag-only handle", () => {
    const sortableSources = [
      "pages/WorkbenchHubPage.tsx",
      "features/navigation/WorkspaceSidebar.tsx",
      "features/workbench-hub/tasks/TaskTableNavigation.tsx",
      "features/workbench-hub/tasks/TaskTableGrid.tsx",
      "features/workbench-hub/memos/MemoWorkbenchPage.tsx",
      "features/workbench-hub/sites/SiteWorkbenchPage.tsx",
      "features/workbench-hub/terminal/TerminalWorkbenchPage.tsx",
    ].map((path) => ({
      path,
      source: readFileSync(resolve(process.cwd(), "src", path), "utf8"),
    }));

    for (const { path, source } of sortableSources) {
      expect(source, path).toContain("<DragHandle");
      expect(source, path).not.toContain("<ReorderMenu");
    }

    const taskGrid = sortableSources.find(
      ({ path }) =>
        path === "features/workbench-hub/tasks/TaskTableGrid.tsx",
    )!.source;
    expect(taskGrid).not.toContain('className="workbench-task-record-open"');
    expect(taskGrid).not.toContain("workbench-task-open-column");
    expect(taskGrid).not.toMatch(/<tr[\s\S]{0,500}\bonClick=/);

    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    expect(applicationStyles).toMatch(
      /\[data-dragging='true'\]\s*\{[^}]*user-select: none;/s,
    );
    expect(applicationStyles).not.toContain("workbench-task-open-column");
    expect(applicationStyles).not.toContain("workbench-task-record-open");
    expect(applicationStyles).toMatch(
      /\.workbench-task-table th\.workbench-task-fill-column,[\s\S]*?\.workbench-task-table td\.workbench-task-fill-column\s*\{[^}]*width: auto;[^}]*min-width: 0;[^}]*border-right: 0;/s,
    );
  });

  it("keeps migrated command surfaces on shared button primitives", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const migratedSources = [
      "features/conversation/ConversationShareController.tsx",
      "features/conversation/KnowledgeNoteCapture.tsx",
    ].map((path) =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8"),
    );

    for (const source of migratedSources) {
      expect(source).not.toMatch(
        /className=["'][^"']*\b(?:primary|icon-button)\b/,
      );
    }

    for (const privateSelector of [
      ".conversation-share-header .icon-button",
      ".conversation-share-actions button.primary",
      ".knowledge-note-capture-toolbar button.primary",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }
  });

  it("keeps migrated dialog forms on shared field visual ownership", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    for (const privateSelector of [
      ".model-editor .model-form-grid label",
      ".model-editor .model-form-grid input",
      ".space-resource-dialog > label input",
      ".workbench-task-field-manager form > label",
      ".workbench-task-field-manager input,",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }

    const sharedStyles = readFileSync(
      resolve(process.cwd(), "src/components/ui/ui.css"),
      "utf8",
    );
    expect(sharedStyles).toMatch(
      /\.ui-field input,[\s\S]*?\.ui-field textarea\s*\{[^}]*min-height: var\(--ui-control-comfortable\);[^}]*border-radius: var\(--ui-radius-medium\);/s,
    );
  });

  it("keeps Settings field combinations on shared Field ownership", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const generalSettings = readFileSync(
      resolve(
        process.cwd(),
        "src/features/settings/GeneralSettings.tsx",
      ),
      "utf8",
    );
    const builtinProvider = readFileSync(
      resolve(
        process.cwd(),
        "src/features/settings/BuiltinProviderDialog.tsx",
      ),
      "utf8",
    );
    const sharedStyles = readFileSync(
      resolve(process.cwd(), "src/components/ui/ui.css"),
      "utf8",
    );

    expect(generalSettings).toContain("<Field");
    expect(builtinProvider).toContain('endAdornment={');
    expect(sharedStyles).toMatch(
      /\.ui-field__control-group\s*\{[^}]*height: var\(--ui-control-comfortable\);[^}]*box-sizing: border-box;[^}]*border-radius: var\(--ui-radius-medium\);/s,
    );

    for (const privateSelector of [
      ".settings-default-model-field > span",
      ".settings-default-model-field select",
      ".settings-default-model-field select:focus-visible",
      ".builtin-provider-key-field > label",
      ".builtin-provider-key-field > div",
      ".builtin-provider-key-field > div:focus-within",
      ".builtin-provider-key-field input",
      ".builtin-provider-key-field .ui-icon-button",
      ".builtin-provider-key-field > small",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }
    expect(applicationStyles).not.toMatch(
      /\.builtin-provider-key-field[^}]*40px/s,
    );
  });

  it("keeps persistent local errors on shared inline alert visuals", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const migratedSources = [
      "features/settings/BackupSettings.tsx",
      "features/resources/KnowledgeNotesPanel.tsx",
      "features/workbench-hub/dashboard/WorkbenchDashboardPage.tsx",
      "features/workbench-hub/tasks/TaskWorkbenchPage.tsx",
      "features/workflow/RequirementExecutionSnapshot.tsx",
      "features/workflow/RequirementDetailExecutionWorkbench.tsx",
      "pages/UpdatesPage.tsx",
      "features/workbench-hub/system/SystemStatusPage.tsx",
      "features/workbench-hub/memos/MemoWorkbenchPage.tsx",
      "features/settings/BuiltinProviderDialog.tsx",
      "features/conversation/ConversationShareController.tsx",
      "features/resources/KnowledgeIndexJobDialog.tsx",
    ].map((path) =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8"),
    );

    for (const source of migratedSources) {
      expect(source).toContain("<InlineAlert");
    }

    const ruleBodies = (selector: string): string[] =>
      [...applicationStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) =>
          match[1]
            ?.split(",")
            .map((candidate) => candidate.trim())
            .includes(selector),
        )
        .map((match) => match[2] ?? "");
    const privateVisualProperties =
      /(?:^|;)\s*(?:padding|color|background|border(?:-radius)?|font(?:-size)?)\s*:/;

    for (const selector of [
      ".knowledge-notes-error",
      ".workbench-dashboard-error",
      ".workbench-task-error",
      ".requirement-execution-error",
      ".support-error",
      ".system-status-error",
      ".workbench-memo-error",
      ".builtin-provider-discovery-error",
      ".knowledge-index-job-message.error",
      ".conversation-share-error p",
    ]) {
      for (const body of ruleBodies(selector)) {
        expect(body).not.toMatch(privateVisualProperties);
      }
    }

    for (const removedSelector of [
      ".support-error",
      ".system-status-error",
      ".workbench-memo-error",
      ".builtin-provider-discovery-error",
      ".knowledge-index-job-message.error",
      ".conversation-share-error p",
    ]) {
      expect(applicationStyles).not.toContain(removedSelector);
    }

    expect(applicationStyles).not.toContain(
      ".requirement-execution-error button",
    );
  });

  it("uses semantic shared tabs and tables for standard data surfaces", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const workflowEditor = readFileSync(
      resolve(
        process.cwd(),
        "src/features/workflow/WorkflowTemplateNodeEditor.tsx",
      ),
      "utf8",
    );
    const systemStatus = readFileSync(
      resolve(
        process.cwd(),
        "src/features/workbench-hub/system/SystemStatusPage.tsx",
      ),
      "utf8",
    );

    expect(workflowEditor).toContain('variant="segmented"');
    expect(workflowEditor).not.toContain("<DocumentTabs");
    expect(applicationStyles).not.toContain(
      ".workflow-editor-tabs .ui-document-tab",
    );
    expect(systemStatus).toContain("<DataTable");
    expect(systemStatus).not.toContain('<div role="table"');
  });

  it("keeps closeable workbench tabs on the shared document tab system", () => {
    const workbenchLayout = readFileSync(
      resolve(
        process.cwd(),
        "src/features/workbench/WorkbenchLayout.tsx",
      ),
      "utf8",
    );
    const workbenchStyles = readFileSync(
      resolve(
        process.cwd(),
        "src/features/workbench/workbench.css",
      ),
      "utf8",
    );
    const sharedStyles = readFileSync(
      resolve(process.cwd(), "src/components/ui/ui.css"),
      "utf8",
    );

    expect(workbenchLayout).toContain("<DocumentTabs");
    expect(workbenchLayout).toContain("<Toolbar");
    expect(workbenchLayout).toContain("<IconButton");
    expect(workbenchLayout).not.toContain('role="tablist"');
    expect(workbenchStyles).not.toContain(".global-workbench-tabs");
    expect(workbenchStyles).not.toContain(".global-workbench-add");
    expect(workbenchStyles).not.toContain("height: 47px");
    expect(sharedStyles).toMatch(
      /\.ui-document-tabs__list\s*\{[^}]*height: 42px;[^}]*flex: 1 1 auto;/s,
    );
    expect(sharedStyles).toMatch(
      /\.ui-document-tab__leading\s*\{[^}]*width: 14px;[^}]*flex: 0 0 14px;/s,
    );
  });

  it("keeps standard resource and schedule actions on shared button sizes", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const migratedSources = [
      "features/resources/KnowledgeNotesPanel.tsx",
      "features/resources/KnowledgeResourceRow.tsx",
      "features/resources/SpaceKnowledgePanel.tsx",
      "features/schedules/ScheduleRecommendations.tsx",
    ].map((path) =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8"),
    );

    expect(migratedSources[0]).toContain("<IconButton");
    expect(migratedSources[0]).not.toContain("<button");
    expect(migratedSources[1]).toContain('size="compact"');
    expect(migratedSources[2]).toContain("<Button");
    expect(migratedSources[3]).toContain("<IconButton");
    expect(migratedSources[3]).not.toContain("<button");

    for (const privateSelector of [
      ".knowledge-note-actions button",
      ".space-resource-row-actions button",
      ".schedule-recommendation button",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }

    const resourceActionRules = [
      ...applicationStyles.matchAll(
        /([^{}]+)\{([^{}]*)\}/g,
      ),
    ]
      .filter((match) =>
        match[1]
          ?.split(",")
          .map((candidate) => candidate.trim())
          .includes(".space-resource-actions button"),
      )
      .map((match) => match[2] ?? "");
    const privateVisualProperties =
      /(?:^|;)\s*(?:min-height|height|padding|color|background|border(?:-radius)?|font(?:-size)?)\s*:/;
    for (const body of resourceActionRules) {
      expect(body).not.toMatch(privateVisualProperties);
    }
  });

  it("keeps support page commands on shared comfortable buttons", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const migratedSources = [
      "pages/UpdatesPage.tsx",
      "pages/HelpPage.tsx",
    ].map((path) =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8"),
    );

    for (const source of migratedSources) {
      expect(source).toContain('size="comfortable"');
      expect(source).not.toContain("<button");
    }

    for (const privateSelector of [
      ".update-version button",
      ".update-release button",
      ".help-online-actions button:last-child",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }

    const responsiveHelpRules = [
      ...applicationStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ]
      .filter((match) =>
        match[1]
          ?.split(",")
          .map((candidate) => candidate.trim())
          .includes(".help-online-actions button"),
      )
      .map((match) => match[2] ?? "");
    const privateVisualProperties =
      /(?:^|;)\s*(?:min-height|height|padding|color|background|border(?:-radius)?|font(?:-size|weight)?)\s*:/;
    for (const body of responsiveHelpRules) {
      expect(body).not.toMatch(privateVisualProperties);
    }
  });

  it("keeps standard drawer forms on shared field and button visuals", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const drawerSources = [
      "features/workbench-hub/tasks/TaskRecordDrawer.tsx",
      "features/workbench-hub/sites/SiteDrawer.tsx",
    ].map((path) =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8"),
    );

    for (const source of drawerSources) {
      expect(source).toContain("<Field");
      expect(source).toContain("<DrawerFooter");
    }

    for (const privateSelector of [
      ".workbench-task-drawer-fields input",
      ".workbench-task-drawer-fields input:focus",
      ".workbench-site-drawer input",
      ".workbench-site-drawer footer button",
      ".workbench-task-drawer footer button",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }
  });

  it("keeps workflow template forms on shared field and button visuals", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const edgeEditor = readFileSync(
      resolve(
        process.cwd(),
        "src/features/workflow/WorkflowTemplateEdgeEditor.tsx",
      ),
      "utf8",
    );

    expect(edgeEditor).toContain("<Field");
    expect(edgeEditor).toContain("<Button");
    expect(edgeEditor).toContain("<IconButton");
    expect(edgeEditor).not.toContain("<button");

    for (const privateSelector of [
      ".workflow-template-dialog input",
      ".workflow-template-dialog textarea",
      ".workflow-template-dialog select",
      ".workflow-edge-form button",
      ".workflow-edge-row button",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }
  });

  it("keeps generic page, workbench and settings commands on shared buttons", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const readSource = (path: string): string =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8");
    const sourceExpectations = [
      {
        path: "pages/SpaceDetailPage.tsx",
        privateButton:
          /<button[\s\S]{0,160}className="space-detail-create"/,
      },
      {
        path: "pages/WorkbenchHubPage.tsx",
        privateButton:
          /<button[\s\S]{0,200}aria-label=\{t\("workbenchHub\.(?:addModule|manageTabs)"\)\}/,
      },
      {
        path: "features/workbench-hub/system/SystemStatusPage.tsx",
        privateButton:
          /<button[\s\S]{0,160}className="system-status-refresh"/,
      },
      {
        path: "features/workbench-hub/dashboard/WorkbenchDashboardPage.tsx",
        privateButton:
          /<button[\s\S]{0,160}className="workbench-dashboard-refresh"/,
      },
      {
        path: "features/settings/GeneralSettings.tsx",
        privateButton: /<button[\s\S]{0,120}className="model-action"/,
      },
      {
        path: "features/settings/ModelSettings.tsx",
        privateButton:
          /<button[\s\S]{0,160}className="model-provider-(?:remove|add|edit)"/,
      },
      {
        path: "features/settings/ConnectorSettings.tsx",
        privateButton: /<button[\s\S]{0,120}className="model-action"/,
      },
      {
        path: "features/settings/BackupSettings.tsx",
        privateButton: /<button[\s\S]{0,120}className="model-action"/,
      },
      {
        path: "features/capabilities/McpServerSettings.tsx",
        privateButton: /<button[\s\S]{0,120}className="model-action"/,
      },
    ];

    for (const { path, privateButton } of sourceExpectations) {
      expect(readSource(path)).not.toMatch(privateButton);
    }

    const ruleBodies = (selector: string): string[] =>
      [...applicationStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) =>
          match[1]
            ?.split(",")
            .map((candidate) => candidate.trim())
            .includes(selector),
        )
        .map((match) => match[2] ?? "");
    const privateVisualProperties =
      /(?:^|;)\s*(?:width|height|min-height|padding|color|background|border(?:-radius)?|font(?:-size|weight)?)\s*:/;

    for (const selector of [
      ".space-detail-create",
      ".schedule-page-create",
      ".workflow-templates-create",
      ".workbench-hub-add > button",
      ".workbench-hub-settings-button",
      ".system-status-refresh",
      ".workbench-dashboard-refresh",
      ".model-action",
      ".model-provider-remove",
      ".model-provider-add",
      ".model-provider-edit",
      ".model-credential-action",
    ]) {
      for (const body of ruleBodies(selector)) {
        expect(body).not.toMatch(privateVisualProperties);
      }
    }

    for (const privateSelector of [
      ".model-row-meta button",
      ".workflow-template-actions button",
      ".space-resource-toolbar > div button",
      ".workflow-parallelism-control > button",
      ".workbench-task-toolbar button",
      ".workbench-task-pagination button",
      ".workbench-task-attachment-field > button",
      ".workbench-task-attachment-list button",
      ".repository-header-icon-button",
      ".repository-file-retry",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }
  });

  it("keeps workflow gate and question forms on shared fields and buttons", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const readSource = (path: string): string =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8");

    for (const path of [
      "features/workflow/NodeGateActions.tsx",
      "features/workflow/NodeQuestionsPanel.tsx",
    ]) {
      const source = readSource(path);
      expect(source).toContain("<Field");
      expect(source).toContain("<Button");
      expect(source).not.toContain("<button");
    }

    for (const privateSelector of [
      ".node-approval-controls textarea:focus",
      ".node-question input:focus",
      ".node-question button",
      ".node-question-create button",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }

    const privateControlRules = [
      /\.node-approval-controls textarea\s*\{([^}]*)\}/s,
      /\.node-question input\s*\{([^}]*)\}/s,
      /\.node-question-create > input\s*\{([^}]*)\}/s,
    ];
    for (const rule of privateControlRules) {
      const body = applicationStyles.match(rule)?.[1] ?? "";
      expect(body).not.toMatch(
        /(?:height:\s*32px|outline:\s*(?:none|0)|border(?:-radius)?:|background:|color:)/,
      );
    }
  });

  it("keeps generic command menus on shared menu surfaces", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const readSource = (path: string): string =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8");

    for (const path of [
      "pages/WorkbenchHubPage.tsx",
      "features/settings/ModelSettings.tsx",
      "components/Composer.tsx",
    ]) {
      const source = readSource(path);
      expect(source).toContain("<Menu");
      expect(source).toContain("<MenuContent");
      expect(source).toContain("<MenuItem");
    }

    const taskTags = readSource(
      "features/workbench-hub/tasks/TaskMultiSelectTagEditor.tsx",
    );
    expect(taskTags).toContain("ui-popover workbench-task-multi-select-menu");
    expect(taskTags).toContain('className="ui-menu-item"');

    for (const privateSelector of [
      ".workbench-hub-module-menu button",
      ".model-profile-bulk-menu > button",
      ".model-profile-bulk-menu [role^='menuitem']",
      ".attachment-menu button",
      ".attachment-menu-rule",
      ".workbench-task-multi-select-menu > button:hover",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }
  });

  it("keeps workspace page headers on the shared toolbar variant", () => {
    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const sharedStyles = readFileSync(
      resolve(process.cwd(), "src/components/ui/ui.css"),
      "utf8",
    );

    for (const path of [
      "pages/SpaceDetailPage.tsx",
      "pages/SchedulePage.tsx",
      "pages/WorkflowTemplatesPage.tsx",
      "pages/SettingsPage.tsx",
      "pages/WorkbenchHubPage.tsx",
    ]) {
      const source = readFileSync(
        resolve(process.cwd(), "src", path),
        "utf8",
      );
      expect(source).toMatch(
        /<Toolbar[\s\S]{0,160}variant="workspace-header"/,
      );
    }

    expect(sharedStyles).toMatch(
      /\.ui-toolbar--workspace-header\s*\{[^}]*width: 100%;[^}]*height: 100%;[^}]*pointer-events: none;/s,
    );
    expect(sharedStyles).toMatch(
      /\.ui-toolbar--workspace-header\s+[^}]*-webkit-app-region: no-drag;/s,
    );

    for (const privateSelector of [
      ".space-detail-create",
      ".schedule-page-create",
      ".workflow-templates-create",
    ]) {
      expect(applicationStyles).not.toContain(privateSelector);
    }

    for (const selector of [
      "space-detail-header",
      "schedule-page-header",
      "workflow-templates-page-header",
      "settings-page-header",
      "workbench-hub-header",
    ]) {
      const body =
        applicationStyles.match(
          new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`),
        )?.[1] ?? "";
      expect(body).not.toMatch(
        /(?:display:|width:|height:|align-items:|justify-content:|box-sizing:|padding:|pointer-events:|-webkit-app-region:)/,
      );
    }
  });

  it("keeps high-growth lists on bounded rendering strategies", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(packageJson.dependencies?.["@tanstack/react-virtual"]).toBeTruthy();

    const readSource = (path: string): string =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8");
    expect(
      readSource("features/conversation/ConversationMessageList.tsx"),
    ).toContain("useVirtualizer");

    for (const path of [
      "features/resources/RepositorySnapshotDialog.tsx",
      "features/sessions/RecentSessions.tsx",
      "features/conversation/AssistantExecutionTimeline.tsx",
      "features/resources/KnowledgeNotesPanel.tsx",
      "features/resources/SpaceKnowledgePanel.tsx",
      "features/capabilities/InstalledCapabilityList.tsx",
      "features/capabilities/ToolCatalogPanel.tsx",
    ]) {
      expect(readSource(path)).toContain("useListPagination");
      expect(readSource(path)).toContain("<ListPagination");
    }

    const taskPage = readSource(
      "features/workbench-hub/tasks/TaskWorkbenchPage.tsx",
    );
    expect(taskPage).toContain("<TaskPagination");
    expect(taskPage).toContain("records={snapshot.records}");
  });

  it("keeps shareable page state on the shared URL query contract", () => {
    const readSource = (path: string): string =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8");

    for (const path of [
      "pages/SpaceDetailPage.tsx",
      "pages/WorkflowTemplatesPage.tsx",
      "pages/CapabilitiesPage.tsx",
      "pages/SchedulePage.tsx",
      "features/capabilities/ToolCatalogPanel.tsx",
      "features/capabilities/ConnectorCatalogPanel.tsx",
      "features/resources/SpaceKnowledgePanel.tsx",
      "features/workbench-hub/dashboard/WorkbenchDashboardPage.tsx",
    ]) {
      expect(readSource(path)).toContain("useUrlQueryState");
    }

    for (const path of [
      "pages/WorkflowTemplatesPage.tsx",
      "pages/CapabilitiesPage.tsx",
      "pages/SchedulePage.tsx",
    ]) {
      expect(readSource(path)).not.toMatch(
        /useState<[^>]*>\(\s*["'](?:published|tools|templates)["']/,
      );
    }

    const repositoryDialog = readSource(
      "features/resources/RepositorySnapshotDialog.tsx",
    );
    expect(repositoryDialog).not.toContain("useUrlQueryState");
  });

  it("keeps route pages on one shared main landmark and one page heading", () => {
    const readSource = (path: string): string =>
      readFileSync(resolve(process.cwd(), "src", path), "utf8");
    const routePages = [
      "pages/WorkbenchHubPage.tsx",
      "pages/NewChatPage.tsx",
      "pages/SchedulePage.tsx",
      "pages/CapabilitiesPage.tsx",
      "pages/AnalyticsPage.tsx",
      "pages/WorkflowTemplatesPage.tsx",
      "pages/SettingsPage.tsx",
      "pages/UpdatesPage.tsx",
      "pages/HelpPage.tsx",
      "pages/SpaceDetailPage.tsx",
      "pages/RequirementDetailPage.tsx",
      "pages/ChatSessionPage.tsx",
    ];

    for (const path of routePages) {
      const source = readSource(path);
      expect(source, path).not.toContain("<main");
      expect(source, path).toContain("<h1");
    }

    expect(readSource("features/workflow/canvas/WorkflowTemplateCanvasView.tsx"))
      .toContain("<h1");

    const routes = readSource("app/AppRoutes.tsx");
    expect(routes).toContain('as="main"');
    expect(routes).toContain('id="main-content"');

    const toolCatalog = readSource(
      "features/capabilities/ToolCatalogPanel.tsx",
    );
    expect(toolCatalog).toContain("<h2>{title}</h2>");
    expect(toolCatalog).not.toContain("<h3>{title}</h3>");

    const mcpSettings = readSource(
      "features/capabilities/McpServerSettings.tsx",
    );
    expect(mcpSettings).toContain(
      '<h2 id="mcp-heading">{t(\'capabilities.mcp.heading\')}</h2>',
    );
    expect(mcpSettings).not.toContain('h3 id="mcp-heading"');

    const settings = readSource("pages/SettingsPage.tsx");
    expect(settings).toMatch(
      /<WorkspaceHeaderPortal>[\s\S]*?<h1 className="sr-only">[\s\S]*?<h2 className="settings-page-header-title">/,
    );

    const schedule = readSource("pages/SchedulePage.tsx");
    expect(schedule).toContain(
      '<h2 className="sr-only">{t("schedule.tab.templates")}</h2>',
    );
    expect(schedule).toContain(
      '<h2 className="sr-only">{t("schedule.tab.active", { count: schedules.length })}</h2>',
    );
  });

  it("keeps every Renderer image stable, deferred where appropriate, and recoverable", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const imageFiles = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter(
        (path) =>
          path.endsWith(".tsx") &&
          !path.endsWith(".test.tsx") &&
          readFileSync(resolve(sourceRoot, path), "utf8").includes("<img"),
      );
    const imageElements = imageFiles.flatMap((path) => {
      const source = readFileSync(resolve(sourceRoot, path), "utf8");
      return [...source.matchAll(/<img\b[\s\S]*?\/>/g)].map((match) => ({
        path,
        source: match[0],
      }));
    });

    expect(imageElements).toHaveLength(6);
    for (const image of imageElements) {
      expect(image.source, image.path).toMatch(/\bloading=/);
      expect(image.source, image.path).toContain('decoding="async"');
      expect(image.source, image.path).toMatch(/\bonError=/);
      expect(
        /\bwidth=/.test(image.source) && /\bheight=/.test(image.source)
          ? "sized"
          : image.source.includes('data-media-layout="contained"')
            ? "contained"
            : "unstable",
        image.path,
      ).not.toBe("unstable");
    }

    const applicationStyles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const artifactStyles = readFileSync(
      resolve(
        process.cwd(),
        "src/features/artifacts/artifact-workbench.css",
      ),
      "utf8",
    );
    expect(applicationStyles).toMatch(
      /\.conversation-share-preview > img\s*\{[^}]*object-fit: contain;/s,
    );
    expect(applicationStyles).toMatch(
      /\.workbench-site-card-open img,[^}]*\{[^}]*width: 32px;[^}]*height: 32px;[^}]*object-fit: contain;/s,
    );
    expect(applicationStyles).toMatch(
      /\.workbench-memo-image\s*\{[^}]*position: relative;[^}]*aspect-ratio: 16 \/ 9;/s,
    );
    expect(applicationStyles).toMatch(
      /\.workbench-memo-image img\s*\{[^}]*position: absolute;[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 100%;[^}]*max-width: 100%;[^}]*max-height: 100%;[^}]*object-fit: contain;/s,
    );
    expect(artifactStyles).toMatch(
      /\.artifact-image-preview\s*\{[^}]*width: 100%;[^}]*height: 100%;/s,
    );
    expect(artifactStyles).toMatch(
      /\.artifact-image-preview img\s*\{[^}]*object-fit: contain;/s,
    );
  });

  it("keeps native theme metadata synchronized with the resolved theme", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const provider = readFileSync(
      resolve(process.cwd(), "src/theme/ThemeProvider.tsx"),
      "utf8",
    );
    const themes = readFileSync(
      resolve(process.cwd(), "src/theme/themes.ts"),
      "utf8",
    );

    expect(html).toContain(
      '<meta name="theme-color" content="#f1f1f1" />',
    );
    expect(provider).toContain("root.style.colorScheme = theme.resolvedTheme");
    expect(provider).toContain(
      "themeColor.content = THEME_META_COLORS[theme.resolvedTheme]",
    );
    expect(themes).toContain("light: '#f1f1f1'");
    expect(themes).toContain("dark: '#141516'");
  });
});
