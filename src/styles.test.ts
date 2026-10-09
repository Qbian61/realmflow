import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const uiStyles = readFileSync(
  resolve(process.cwd(), "src/components/ui/ui.css"),
  "utf8",
);
const workbenchStyles = readFileSync(
  resolve(process.cwd(), "src/features/workbench/workbench.css"),
  "utf8",
);
const artifactWorkbenchStyles = readFileSync(
  resolve(process.cwd(), "src/features/artifacts/artifact-workbench.css"),
  "utf8",
);
const nativeWorkbenchMenuStyles = readFileSync(
  resolve(process.cwd(), "src/features/workbench/native-workbench-menu.css"),
  "utf8",
);
const electronMainSource = readFileSync(
  resolve(process.cwd(), "electron/src/main.ts"),
  "utf8",
);

describe("Theme color architecture", () => {
  it("defines semantic light and dark theme tokens", () => {
    const lightTokens = styles.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
    const darkTokens =
      styles.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)?.[1] ?? "";

    for (const token of [
      "--color-canvas",
      "--color-sidebar",
      "--color-surface",
      "--color-surface-elevated",
      "--color-text",
      "--color-text-muted",
      "--color-border",
      "--color-control",
      "--color-focus",
      "--color-success",
      "--color-warning",
      "--color-error",
      "--color-tooltip-background",
      "--color-tooltip-text",
      "--color-terminal-background",
      "--color-terminal-header",
      "--color-terminal-foreground",
      "--color-terminal-border",
      "--color-terminal-success",
    ]) {
      expect(lightTokens).toContain(`${token}:`);
      expect(darkTokens).toContain(`${token}:`);
    }
  });

  it("uses theme tokens for representative application surfaces", () => {
    for (const selector of [
      ".app-content",
      ".settings-content .model-list",
      ".analytics-summary > div",
    ]) {
      const rule =
        styles.match(
          new RegExp(
            `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
          ),
        )?.[1] ?? "";
      expect(rule).toContain("var(--");
    }
    expect(uiStyles).toMatch(
      /\.ui-dialog-backdrop\s*\{[^}]*background: var\(--/,
    );
    expect(uiStyles).toMatch(
      /\.ui-card\s*\{[^}]*background: var\(--color-surface\)/,
    );

    expect(workbenchStyles).toMatch(
      /\.global-workbench\s*\{[^}]*background: var\(--color-surface\)/,
    );
    expect(artifactWorkbenchStyles).toMatch(
      /\.artifact-workbench\s*\{[^}]*background: var\(--color-surface\)/,
    );
    expect(nativeWorkbenchMenuStyles).toMatch(
      /\.ui-menu\.native-workbench-menu\s*\{[^}]*min-height: 100vh;/,
    );
    expect(uiStyles).toMatch(
      /\.ui-menu\s*\{[^}]*background: var\(--color-surface-elevated\)/,
    );
  });

  it("does not invert renderer content or hard-code colors outside tokens", () => {
    const themeBlocks = /:root(?:\[data-theme='dark'\])?\s*\{[^}]*\}/g;
    const rendererStyles = [
      styles.replace(themeBlocks, ""),
      workbenchStyles,
      artifactWorkbenchStyles,
      nativeWorkbenchMenuStyles,
    ].join("\n");

    expect(rendererStyles).not.toMatch(/filter\s*:\s*invert/i);
    expect(rendererStyles).not.toMatch(
      /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|rgb\([^)]*\)/i,
    );
  });
});

describe("Root viewport styles", () => {
  it("keeps Runtime governance columns visible at the 920px acceptance width", () => {
    expect(styles).toMatch(
      /\.runtime-governance-table-wrap \.ui-data-table\s*\{[^}]*min-width:\s*520px;/s,
    );
    expect(styles).toMatch(
      /@container main-workspace \(max-width: 760px\)[\s\S]*\.runtime-governance-workspace\s*\{[^}]*grid-template-columns:\s*1fr;/,
    );
  });

  it("uses the shared Doubao tooltip surface and directional arrow", () => {
    expect(styles).toMatch(
      /\.global-tooltip\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*200;[^}]*max-width:\s*240px;[^}]*padding:\s*5px 8px;[^}]*color:\s*var\(--color-tooltip-text\);[^}]*background:\s*var\(--color-tooltip-background\);[^}]*border-radius:\s*6px;[^}]*font-size:\s*12px;[^}]*font-weight:\s*400;[^}]*line-height:\s*18px;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.global-tooltip-arrow\s*\{[^}]*position:\s*absolute;[^}]*width:\s*6px;[^}]*height:\s*6px;[^}]*background:\s*var\(--color-tooltip-background\);[^}]*transform:\s*translateX\(-50%\) rotate\(45deg\);/s,
    );
    expect(styles).toMatch(
      /\.global-tooltip\[data-placement='top'\] \.global-tooltip-arrow\s*\{[^}]*bottom:\s*-3px;/s,
    );
    expect(styles).toMatch(
      /\.global-tooltip\[data-placement='bottom'\] \.global-tooltip-arrow\s*\{[^}]*top:\s*-3px;/s,
    );
  });

  it("matches the reference rich preview for recent conversations", () => {
    expect(styles).toMatch(
      /\.recent-session-preview\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*190;[^}]*width:\s*246px;[^}]*min-height:\s*114px;[^}]*padding:\s*12px 14px;[^}]*background:\s*var\(--color-surface-elevated\);[^}]*border:\s*1px solid var\(--tone-e5e5e5\);[^}]*border-radius:\s*10px;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.recent-session-preview-title\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*400;[^}]*line-height:\s*18px;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
    expect(styles).toMatch(
      /\.recent-session-preview-row\s*\{[^}]*grid-template-columns:\s*15px minmax\(0, 1fr\);[^}]*gap:\s*5px;[^}]*color:\s*var\(--tone-8a8a8a\);[^}]*font-size:\s*12px;/s,
    );
    expect(styles).toMatch(
      /\.recent-session-preview-path\s*\{[^}]*direction:\s*rtl;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
    expect(styles).toMatch(
      /\.recent-session-preview-arrow\s*\{[^}]*position:\s*absolute;[^}]*width:\s*10px;[^}]*height:\s*10px;[^}]*transform:\s*rotate\(45deg\);/s,
    );
  });

  it("uses the theme foreground for native drag insertion lines", () => {
    expect(styles).toMatch(
      /\[data-drop-target='before'\]::before\s*\{[^}]*background:\s*var\(--color-text\);/s,
    );
    const rule =
      styles.match(
        /\[data-drop-target='before'\]::before\s*\{([^}]*)\}/s,
      )?.[1] ?? "";
    expect(rule).not.toContain("box-shadow:");
    expect(styles).not.toMatch(
      /\.space-entry\.drag-over[^}]*::before|\.space-requirements li\.drag-over::before/,
    );
    expect(styles).toMatch(
      /\.app-drag-ghost\s*\{[^}]*border:\s*1px solid var\(--color-text\);/s,
    );
  });

  it("keeps task selection controls aligned in a compact column", () => {
    expect(styles).toMatch(
      /\.workbench-task-table th\.workbench-task-drag-column,[\s\S]*?\.workbench-task-table td\.workbench-task-select-column\s*\{[^}]*position:\s*relative;[^}]*padding:\s*0;[^}]*text-align:\s*center;/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-table th\.workbench-task-drag-column,[^{]*\{[^}]*width:\s*20px;[^}]*min-width:\s*20px;[^}]*border-right:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-table th\.workbench-task-select-column,[^{]*\{[^}]*width:\s*24px;[^}]*min-width:\s*24px;[^}]*border-right:\s*0;/s,
    );
    expect(styles).not.toContain("workbench-task-open-column");
    expect(styles).not.toContain("workbench-task-record-open");
    expect(styles).toMatch(
      /\.workbench-task-record-drag\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*width:\s*14px;/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-field-header\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-field-type-icon\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;[^}]*color:\s*var\(--workbench-task-cell-text-color\);/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-record-index\s*\{[^}]*display:\s*inline-grid;[^}]*color:\s*var\(--color-text-muted\);/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-table tbody tr:hover \.workbench-task-record-index,[\s\S]*?\.workbench-task-table tbody tr:focus-within \.workbench-task-record-index,[\s\S]*?\.workbench-task-table tbody tr\[data-selected='true'\] \.workbench-task-record-index\s*\{[^}]*opacity:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-table tbody tr:hover \.workbench-task-select-control,[\s\S]*?\.workbench-task-table tbody tr:focus-within \.workbench-task-select-control,[\s\S]*?\.workbench-task-table tbody tr\[data-selected='true'\] \.workbench-task-select-control\s*\{[^}]*opacity:\s*1;/s,
    );
  });

  it("matches the memo editor toolbar height for task controls and table rows", () => {
    const tableRule =
      styles.match(/\.workbench-task-table\s*\{([^}]*)\}/)?.[1] ?? "";
    const taskToolbarRule =
      styles.match(/\.workbench-task-toolbar\s*\{([^}]*)\}/)?.[1] ?? "";
    const baseCellRule =
      styles.match(
        /\.workbench-task-table th,[\s\S]*?\.workbench-task-table td\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const headerRule =
      styles.match(/\.workbench-task-table th\s*\{([^}]*)\}/)?.[1] ?? "";
    const fieldHeaderRule =
      styles.match(/\.workbench-task-field-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const fieldIconRule =
      styles.match(/\.workbench-task-field-type-icon\s*\{([^}]*)\}/)?.[1] ??
      "";
    const fieldHeaderLabelRule =
      styles.match(
        /\.workbench-task-field-header > span\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const headerCheckboxRule =
      styles.match(
        /\.workbench-task-table \.workbench-task-select-column > input\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const rowCheckboxRule =
      styles.match(
        /\.workbench-task-table \.workbench-task-select-control\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const dragRule =
      styles.match(/\.workbench-task-record-drag\s*\{([^}]*)\}/)?.[1] ?? "";
    const cellButtonRule =
      styles.match(/\.workbench-task-cell\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(tableRule).toContain("--workbench-task-cell-content-inset: 12px;");
    expect(tableRule).toContain(
      "--workbench-task-cell-text-color: var(--color-text);",
    );
    expect(tableRule).toContain("--workbench-task-cell-font-size: 13px;");
    expect(tableRule).toContain("--workbench-task-cell-font-weight: 400;");
    expect(tableRule).toContain("--workbench-task-cell-line-height: 20px;");
    expect(taskToolbarRule).toContain("height: 38px;");
    expect(taskToolbarRule).toContain("min-height: 38px;");
    expect(baseCellRule).toContain("height: 38px;");
    expect(headerRule).toContain("height: 38px;");
    expect(headerRule).toContain("padding: 0;");
    expect(headerRule).toContain("color: var(--workbench-task-cell-text-color);");
    expect(headerRule).toContain("font: inherit;");
    expect(headerRule).toContain("font-size: var(--workbench-task-cell-font-size);");
    expect(headerRule).toContain("font-weight: var(--workbench-task-cell-font-weight);");
    expect(headerRule).toContain("line-height: var(--workbench-task-cell-line-height);");
    expect(fieldHeaderRule).toContain("display: flex;");
    expect(fieldHeaderRule).toContain("height: 100%;");
    expect(fieldHeaderRule).toContain("padding: 0 var(--workbench-task-cell-content-inset);");
    expect(fieldHeaderRule).toContain("align-items: center;");
    expect(fieldHeaderRule).toContain("gap: 8px;");
    expect(fieldHeaderRule).toContain(
      "color: var(--workbench-task-cell-text-color);",
    );
    expect(fieldHeaderRule).toContain(
      "font-size: var(--workbench-task-cell-font-size);",
    );
    expect(fieldHeaderRule).toContain(
      "font-weight: var(--workbench-task-cell-font-weight);",
    );
    expect(fieldHeaderRule).toContain(
      "line-height: var(--workbench-task-cell-line-height);",
    );
    expect(fieldHeaderLabelRule).toContain(
      "color: var(--workbench-task-cell-text-color);",
    );
    expect(fieldHeaderLabelRule).toContain("font: inherit;");
    expect(fieldHeaderLabelRule).toContain(
      "font-size: var(--workbench-task-cell-font-size);",
    );
    expect(fieldHeaderLabelRule).toContain(
      "font-weight: var(--workbench-task-cell-font-weight);",
    );
    expect(fieldHeaderLabelRule).toContain(
      "line-height: var(--workbench-task-cell-line-height);",
    );
    expect(fieldIconRule).toContain("width: 16px;");
    expect(fieldIconRule).toContain("height: 16px;");
    expect(fieldIconRule).toContain(
      "color: var(--workbench-task-cell-text-color);",
    );
    expect(headerCheckboxRule).toContain("width: 16px;");
    expect(headerCheckboxRule).toContain("height: 16px;");
    expect(headerCheckboxRule).toContain("margin: 0;");
    expect(headerCheckboxRule).toContain("transform: translate(-50%, -50%);");
    expect(rowCheckboxRule).toContain("width: 16px;");
    expect(rowCheckboxRule).toContain("height: 16px;");
    expect(rowCheckboxRule).toContain("margin: 0;");
    expect(rowCheckboxRule).toContain("transform: translate(-50%, -50%);");
    expect(dragRule).toContain("top: 50%;");
    expect(dragRule).toContain("height: 28px;");
    expect(dragRule).toContain("transform: translate(-50%, -50%);");
    expect(cellButtonRule).toContain("align-items: center;");
    expect(cellButtonRule).toContain(
      "padding: 0 var(--workbench-task-cell-content-inset);",
    );
    expect(cellButtonRule).toContain(
      "color: var(--workbench-task-cell-text-color);",
    );
    expect(cellButtonRule).toContain(
      "font-size: var(--workbench-task-cell-font-size);",
    );
    expect(cellButtonRule).toContain(
      "font-weight: var(--workbench-task-cell-font-weight);",
    );
    expect(cellButtonRule).toContain(
      "line-height: var(--workbench-task-cell-line-height);",
    );
  });

  it("extends the active task column resize line through the table body", () => {
    expect(styles).toMatch(
      /\.workbench-task-table th\[data-resize-active='true'\],[\s\S]*?\.workbench-task-table td\[data-resize-active='true'\]\s*\{[^}]*box-shadow:\s*1px 0 0 var\(--color-focus\);/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-table th\[data-resize-active='true'\] \.workbench-task-column-resizer::after\s*\{[^}]*background:\s*var\(--color-focus\);/s,
    );
  });

  it("keeps task multi-select tag editors bounded in table cells and drawers", () => {
    expect(styles).toMatch(
      /\.workbench-task-multi-select\s*\{[^}]*position:\s*relative;[^}]*width:\s*100%;[^}]*min-width:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-multi-select-trigger\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.ui-popover\.workbench-task-multi-select-menu\s*\{[^}]*max-width:\s*min\(280px, calc\(100vw - 32px\)\);[^}]*overflow-y:\s*auto;/s,
    );
    expect(uiStyles).toMatch(
      /\.ui-popover\s*\{[^}]*z-index:\s*var\(--ui-layer-menu\);[^}]*box-shadow:\s*var\(--ui-shadow-menu\);/s,
    );
    expect(uiStyles).toMatch(
      /\.ui-menu-item\s*\{[^}]*min-height:\s*var\(--ui-control-default\);/s,
    );
    expect(styles).toMatch(
      /\.workbench-task-option-tag\s*\{[^}]*max-width:\s*120px;[^}]*text-overflow:\s*ellipsis;/s,
    );
  });

  it("keeps workbench tab drag handles borderless", () => {
    expect(styles).toMatch(
      /\.workbench-hub-settings-dialog[^}]*button\.workbench-hub-module-drag\s*\{[^}]*border:\s*0;/s,
    );
  });

  it("lets workspace names use full width until hover actions overlay them", () => {
    expect(styles).toMatch(
      /\.space-item\s*\{[^}]*width:\s*100%;[^}]*flex:\s*1 1 auto;/s,
    );
    expect(styles).toMatch(
      /\.space-row-actions\s*\{[^}]*position:\s*absolute;[^}]*right:\s*5px;/s,
    );
    expect(styles).toMatch(
      /\.space-row-actions\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).not.toMatch(
      /\.space-row-actions\s*\{[^}]*visibility:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.space-requirements li a\s*\{[^}]*padding:\s*0 8px;/s,
    );
    expect(styles).toMatch(
      /\.requirement-row-actions\s*\{[^}]*position:\s*absolute;[^}]*right:\s*4px;[^}]*display:\s*flex;[^}]*background:\s*var\(--tone-e3e3e3\);[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).not.toMatch(
      /\.requirement-row-actions\s*\{[^}]*visibility:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.space-requirements li:hover \.requirement-row-actions,\s*\.space-requirements li:focus-within \.requirement-row-actions\s*\{[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s,
    );
  });

  it("keeps the sidebar toggle above portal header content", () => {
    expect(styles).toMatch(
      /\.sidebar-edge-toggle\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*2;/s,
    );
  });

  it("keeps workbench hub tabs readable and split pages intact at 920px", () => {
    const tabButtonRule =
      uiStyles.match(/\.ui-tab-list--page \.ui-tab\s*\{([^}]*)\}/)?.[1] ?? "";
    const activeIndicatorRule =
      uiStyles.match(
        /\.ui-tab-list--page \.ui-tab\[aria-selected="true"\]::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(uiStyles).toMatch(/\.ui-tab-list--page\s*\{[^}]*overflow-x: auto;/);
    expect(tabButtonRule).toContain("border-bottom: 2px solid transparent;");
    expect(activeIndicatorRule).toContain("bottom: -1px;");
    expect(activeIndicatorRule).toContain("height: 2px;");
    expect(styles).toMatch(
      /\.workbench-split-page\s*\{[^}]*grid-template-columns: var\(--workbench-split-width, 184px\) minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /\.workbench-split-page\[data-collapsed='true'\]\s*\{[^}]*grid-template-columns: 36px minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /\.workbench-split-resizer\s*\{[^}]*left: calc\(var\(--workbench-split-width, 184px\) - 4px\);[^}]*width: 8px;/,
    );
    expect(styles).toMatch(
      /\.workbench-split-resizer::after\s*\{[^}]*background: linear-gradient\(to bottom, transparent 0%, var\(--ink\) 50%, transparent 100%\);/,
    );
    expect(styles).toMatch(
      /\.workbench-task-table-name-input\s*\{[^}]*width: calc\(100% - 8px\);[^}]*margin: 4px;/,
    );
    expect(styles).toMatch(
      /\.workbench-split-navigation\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\) 36px;/,
    );
    expect(styles).toMatch(
      /\.workbench-split-navigation-tools\s*\{[^}]*grid-row: 2;[^}]*padding: 2px;/,
    );
    expect(styles).not.toMatch(
      /\.workbench-split-page\[data-collapsed='true'\] \.workbench-split-navigation-tools button:hover\s*\{/,
    );
    expect(uiStyles).toMatch(
      /\.ui-button:hover:not\(:disabled\)\s*\{[^}]*background: var\(--color-control\);/,
    );
    expect(uiStyles).toMatch(
      /\.ui-icon-button:hover:not\(:disabled\)\s*\{[^}]*border-color: transparent;/,
    );
    expect(uiStyles).toMatch(
      /\.ui-button:focus-visible\s*\{[^}]*outline: 2px solid var\(--color-focus\);/,
    );
    expect(styles).toMatch(
      /\.workbench-task-view-popover\s*\{[^}]*width: min\(456px, calc\(100vw - 24px\)\);/,
    );
    expect(styles).toMatch(
      /\.workbench-task-view-popover\.group\s*\{[^}]*width: min\(376px, calc\(100vw - 24px\)\);/,
    );

    const compactStart = uiStyles.indexOf(
      "@container main-workspace (max-width: 920px)",
    );
    const compactStyles =
      compactStart >= 0 ? uiStyles.slice(compactStart) : "";
    expect(compactStart).toBeGreaterThanOrEqual(0);
    expect(compactStyles).toMatch(
      /\.ui-toolbar--workspace-header\s*\{[^}]*padding-left: 52px;/,
    );
    expect(compactStyles).not.toMatch(
      /\.workbench-split-page\s*\{[^}]*grid-template-columns: 1fr;/,
    );
  });

  it("uses the task menu interaction model for shared workbench menus", () => {
    const actionsRule =
      styles.match(/\.workbench-navigation-item-actions\s*\{([^}]*)\}/)?.[1] ??
      "";
    const revealRule =
      styles.match(
        /\.workbench-navigation-item:hover \.workbench-navigation-item-actions,\s*\.workbench-navigation-item:focus-within \.workbench-navigation-item-actions\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const primaryRule =
      styles.match(
        /\.workbench-navigation-item:hover \.workbench-navigation-item-primary,\s*\.workbench-navigation-item:focus-within \.workbench-navigation-item-primary\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(actionsRule).toContain("top: 5px;");
    expect(actionsRule).toContain("right: 2px;");
    expect(actionsRule).toContain("display: flex;");
    expect(actionsRule).toContain("opacity: 0;");
    expect(actionsRule).toContain("visibility: hidden;");
    expect(actionsRule).toContain("pointer-events: none;");
    expect(revealRule).toContain("opacity: 1;");
    expect(revealRule).toContain("visibility: visible;");
    expect(revealRule).toContain("pointer-events: auto;");
    expect(primaryRule).toContain("width: calc(100% - 50px);");
    expect(styles).not.toMatch(
      /\.workbench-site-card-actions button,\s*\.workbench-site-group-row/,
    );
  });

  it("keeps workbench detail pages aligned with the approved prototype", () => {
    const compactStart = styles.indexOf(
      "@container main-workspace (max-width: 920px)",
    );
    const compactStyles = compactStart >= 0 ? styles.slice(compactStart) : "";

    expect(compactStyles).not.toMatch(
      /\.workbench-task-toolbar button\s*\{[^}]*font-size:\s*0;/,
    );
    expect(styles).toMatch(
      /\.workbench-site-card\s*\{[^}]*min-height:\s*84px;/,
    );
    expect(styles).not.toMatch(/\.workbench-site-card\s*\{[^}]*aspect-ratio:/);
    expect(styles).toMatch(
      /\.workbench-memo-editor\s*\{[^}]*grid-template-rows:\s*38px minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /\.workbench-memo-page\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) 36px;/,
    );
    expect(styles).toMatch(
      /\.workbench-memo-save-state\s*\{[^}]*min-height:\s*36px;/,
    );
    expect(styles).toMatch(
      /\.terminal-workbench-surfaces\s*\{[^}]*background:\s*var\(--color-terminal-background\);/,
    );
  });

  it("keeps task table actions contextual and pagination at the bottom", () => {
    const actionRule =
      styles.match(/\.workbench-task-table-actions\s*\{([^}]*)\}/)?.[1] ?? "";
    const revealRule =
      styles.match(
        /\.workbench-task-table-item:hover \.workbench-task-table-actions\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const actionButtonRule =
      styles.match(
        /\.workbench-task-table-actions button\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const nameRule =
      styles.match(/\.workbench-task-table-select\s*\{([^}]*)\}/)?.[1] ?? "";
    const fabRule =
      styles.match(/\.workbench-split-fab\s*\{([^}]*)\}/)?.[1] ?? "";
    const addConditionRule =
      styles.match(/\.workbench-task-add-condition\s*\{([^}]*)\}/)?.[1] ?? "";
    const pageRule =
      styles.match(/\.workbench-task-page\s*\{([^}]*)\}/)?.[1] ?? "";
    const paginationRule =
      styles.match(/\.workbench-task-pagination\s*\{([^}]*)\}/)?.[1] ?? "";
    const popoverRule =
      styles.match(/\.workbench-task-view-popover\s*\{([^}]*)\}/)?.[1] ?? "";
    const viewToolbarButtonRule =
      styles.match(
        /\.workbench-task-toolbar-primary \.ui-button\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const viewToolbarButtonHoverRule =
      styles.match(
        /\.workbench-task-toolbar-primary \.ui-button:hover:not\(:disabled\),[\s\S]*?\.workbench-task-toolbar-primary \.ui-button\[aria-pressed='true'\]\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(actionRule).toContain("opacity: 0;");
    expect(actionRule).toContain("visibility: hidden;");
    expect(actionRule).toContain("pointer-events: none;");
    expect(revealRule).toContain("opacity: 1;");
    expect(revealRule).toContain("visibility: visible;");
    expect(revealRule).toContain("pointer-events: auto;");
    expect(actionRule).toContain("gap: 0;");
    expect(actionButtonRule).toContain("width: 24px;");
    expect(actionButtonRule).toContain("height: 24px;");
    expect(nameRule).toContain("padding: 0 8px;");
    expect(fabRule).toContain("right: 40px;");
    expect(fabRule).toContain("bottom: 40px;");
    expect(styles).not.toContain(
      ".workbench-task-toolbar button[aria-pressed='true']",
    );
    expect(viewToolbarButtonRule).toContain("border-color: transparent;");
    expect(viewToolbarButtonHoverRule).toContain("border-color: transparent;");
    expect(addConditionRule).toContain("height: 30px;");
    expect(addConditionRule).toContain("align-self: start;");
    expect(pageRule).toContain("grid-template-rows: auto minmax(0, 1fr) 36px;");
    expect(paginationRule).toContain("justify-content: flex-end;");
    expect(uiStyles).toMatch(/\.ui-popover\s*\{[^}]*position: fixed;/s);
    expect(popoverRule).toContain("max-width: calc(100vw - 24px);");
  });

  it("keeps the workflow canvas fluid and overlays its inspector at narrow widths", () => {
    const workspaceRule =
      styles.match(/\.workflow-canvas-workspace\s*\{([^}]*)\}/)?.[1] ?? "";
    const nodeRule =
      styles.match(/\.workflow-canvas-node\s*\{([^}]*)\}/)?.[1] ?? "";
    const narrowStart = styles.indexOf("@media (max-width: 1080px)");
    const narrowStyles = narrowStart >= 0 ? styles.slice(narrowStart) : "";

    expect(workspaceRule).toContain(
      "grid-template-columns: minmax(0, 1fr) 360px;",
    );
    expect(nodeRule).toContain("width: 240px;");
    expect(nodeRule).toContain("height: 104px;");
    expect(narrowStyles).toMatch(
      /\.workflow-canvas-workspace\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(narrowStyles).toMatch(
      /\.workflow-node-inspector\s*\{[^}]*position: absolute;[^}]*width: min\(360px, 100%\);/,
    );
    expect(narrowStyles).toMatch(
      /\.workflow-canvas-shell\[data-inspector-open='true'\]\s+\.workflow-publication-issues\s*\{[^}]*left: 14px;[^}]*width: max\(220px, calc\(100% - 402px\)\);/,
    );
    expect(narrowStyles).toMatch(
      /\.workflow-canvas-shell\[data-inspector-open='true'\]\s+\.workflow-canvas-toolbar\s*\{[^}]*width: 244px;[^}]*flex-wrap: wrap;/,
    );
  });

  it("styles inspector form controls and the minimap in both themes", () => {
    expect(styles).toMatch(
      /\.workflow-inspector-summary\s*>\s*label\s*\{[^}]*display: grid;[^}]*gap: 6px;/,
    );
    expect(styles).toMatch(
      /\.workflow-node-config-form input:not\(\[type='checkbox'\]\)/,
    );
    expect(styles).toMatch(
      /\.workflow-node-config-form input\[type='checkbox'\]\s*\{[^}]*width: auto;/,
    );
    expect(styles).toMatch(
      /\.workflow-canvas-surface \.react-flow__minimap\s*\{[^}]*background: var\(--color-surface\)/,
    );
  });

  it("allows the 900px schedule acceptance viewport without overflow", () => {
    const rootRule =
      styles.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rootRule).toContain("min-width: 760px;");
  });

  it("stacks schedule rows before the 900px acceptance viewport clips actions", () => {
    const mediumStart = styles.indexOf("@media (max-width: 1024px)");
    const narrowStart = styles.indexOf("@media (max-width: 860px)");
    const mediumStyles = styles.slice(mediumStart, narrowStart);

    expect(mediumStyles).toMatch(
      /\.schedule-row\s*\{[^}]*grid-template-columns: 1fr;/,
    );
    expect(mediumStyles).toMatch(
      /\.schedule-actions\s*\{[^}]*justify-self: start;/,
    );
  });

  it("keeps the repository file header visible while its rows scroll", () => {
    const filesRule =
      styles.match(/\.repository-snapshot-files\s*\{([^}]*)\}/)?.[1] ?? "";
    const headerRule =
      styles.match(/\.repository-snapshot-file-header\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(filesRule).toContain("padding: 0 18px 16px;");
    expect(headerRule).toContain("position: sticky;");
    expect(headerRule).toContain("top: 0;");
    expect(headerRule).toContain("z-index:");
    expect(headerRule).toContain("background:");
  });

  it("wraps recommendation descriptions at the 900px acceptance viewport", () => {
    const recommendationRule =
      [...styles.matchAll(/\.schedule-recommendation p\s*\{([^}]*)\}/g)]
        .map((match) => match[1] ?? "")
        .find((rule) => rule.includes("white-space: normal;")) ?? "";

    expect(recommendationRule).toContain("white-space: normal;");
    expect(recommendationRule).toContain("overflow-wrap: anywhere;");
    expect(recommendationRule).not.toContain("text-overflow: ellipsis;");
  });
});

describe("Workflow canvas system style alignment", () => {
  it("uses one compact system toolbar instead of bordered standalone buttons", () => {
    const toolbarRule =
      styles.match(/\.workflow-canvas-toolbar\s*\{([^}]*)\}/)?.[1] ?? "";
    const buttonRule =
      styles.match(
        /\.workflow-canvas-page-header \.icon-button,\s*\.workflow-canvas-toolbar > button,\s*\.workflow-canvas-toolbar > \.workflow-canvas-add > button\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(toolbarRule).toContain("padding: 4px;");
    expect(toolbarRule).toContain("background: var(--color-surface-elevated);");
    expect(toolbarRule).toContain("border-radius: 8px;");
    expect(buttonRule).toContain("width: 32px;");
    expect(buttonRule).toContain("height: 32px;");
    expect(buttonRule).toContain("background: transparent;");
    expect(buttonRule).toContain("border: 1px solid transparent;");
    expect(styles).toMatch(
      /\.workflow-canvas-publish\s*\{[^}]*background: var\(--tone-252525\);[^}]*font-size: 12px;/,
    );
  });

  it("matches avatar-menu density for canvas menus", () => {
    const addMenuRule =
      styles.match(/\.workflow-canvas-add-menu\s*\{([^}]*)\}/)?.[1] ?? "";
    const addItemRule =
      styles.match(/\.workflow-canvas-add-menu button\s*\{([^}]*)\}/)?.[1] ??
      "";
    const quickMenuRule =
      styles.match(/\.ui-menu\.workflow-node-quick-menu\s*\{([^}]*)\}/)?.[1] ??
      "";
    const quickItemRule =
      styles.match(
        /\.workflow-node-quick-menu \.ui-menu-item\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const sharedMenuRule = uiStyles.match(/\.ui-menu\s*\{([^}]*)\}/)?.[1] ?? "";
    const sharedItemRule =
      uiStyles.match(/\.ui-menu-item\s*\{([^}]*)\}/)?.[1] ?? "";
    const quickCopyRule =
      styles.match(/\.workflow-node-quick-menu-copy\s*\{([^}]*)\}/)?.[1] ?? "";
    const quickReasonRule =
      styles.match(/\.workflow-node-quick-menu-reason\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(addMenuRule).toContain("width: 192px;");
    expect(addMenuRule).toContain("border-radius: 8px;");
    expect(addMenuRule).not.toContain("animation:");
    expect(quickMenuRule).toContain("position: fixed;");
    expect(quickMenuRule).toContain("z-index: 90;");
    expect(quickMenuRule).toContain("width: 220px;");
    expect(sharedMenuRule).toContain(
      "background: var(--color-surface-elevated);",
    );
    expect(sharedMenuRule).toContain("border-radius: var(--ui-radius-large);");
    expect(sharedMenuRule).toContain("box-shadow: var(--ui-shadow-menu);");
    expect(sharedMenuRule).toContain(
      "animation: ui-menu-in var(--ui-motion-default) ease-out;",
    );
    expect(addItemRule).toContain("min-height: 34px;");
    expect(addItemRule).toContain("font-size: 12px;");
    expect(addItemRule).toContain("border-radius: 5px;");
    expect(quickItemRule).toContain("min-height: 34px;");
    expect(sharedItemRule).toContain("font-size: 12px;");
    expect(sharedItemRule).toContain("border-radius: 5px;");
    expect(sharedItemRule).toContain(
      "grid-template-columns: 18px minmax(0, 1fr);",
    );
    expect(quickCopyRule).toContain("gap: 2px;");
    expect(quickReasonRule).toContain("font-size: 11px;");
  });

  it("matches settings fields and actions inside the inspector", () => {
    const fieldRule =
      styles.match(
        /\.workflow-inspector-base input:not\(\[type='checkbox'\]\),[\s\S]*?\.workflow-node-config-form textarea\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(fieldRule).toContain("min-height: 36px;");
    expect(fieldRule).toContain("font-size: 13px;");
    expect(fieldRule).toContain("font-weight: 400;");
    expect(fieldRule).toContain("background: var(--color-surface);");
    expect(fieldRule).toContain("border-radius: 6px;");
    expect(styles).toMatch(
      /\.workflow-node-inspector-actions button,[\s\S]*?\.workflow-canvas-detached-actions button\s*\{[^}]*height: 34px;[^}]*font-size: 12px;/,
    );
  });

  it("splits inspector actions between the left and right edges", () => {
    expect(styles).toMatch(
      /\.workflow-node-inspector\s*\{[^}]*display: grid;[^}]*grid-template-rows: minmax\(0, 1fr\) auto;[^}]*overflow: hidden;/,
    );
    expect(styles).toMatch(
      /\.workflow-node-inspector-actions\s*\{[^}]*justify-content: space-between;[^}]*padding: 12px 18px;[^}]*border-top: 1px solid var\(--color-border\);/,
    );
    expect(styles).toMatch(
      /\.workflow-node-inspector-end-actions\s*\{[^}]*display: flex;[^}]*justify-content: flex-end;[^}]*gap: 8px;/,
    );
    expect(styles).toMatch(
      /\.workflow-canvas-detached-actions\s*\{[^}]*position: absolute;[^}]*right: 14px;[^}]*bottom: 14px;/,
    );
    expect(styles).toMatch(
      /\.workflow-canvas-shell\[data-inspector-open='false'\]\[data-detached-actions='true'\][\s\S]*?\.react-flow__minimap\s*\{[^}]*bottom: 58px;/,
    );
  });
});

describe("User preference menu styles", () => {
  it("anchors the submenu beside the avatar menu with stable interaction bounds", () => {
    const submenuRule =
      styles.match(/\.ui-menu\.user-preference-menu\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(submenuRule).toContain("position: fixed;");
    expect(submenuRule).toContain("width: 168px;");
    expect(uiStyles).toMatch(
      /\.ui-menu\s*\{[^}]*max-width: calc\(100vw - 24px\);[^}]*-webkit-app-region: no-drag;/,
    );
    expect(submenuRule).not.toContain("left: calc(100% + 8px);");
  });

  it("reserves checkmark space without shifting preference labels", () => {
    const optionRule =
      styles.match(
        /\.user-preference-menu \.ui-menu-item\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const checkRule =
      styles.match(/\.user-preference-check\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(optionRule).toContain("grid-template-columns: 18px minmax(0, 1fr);");
    expect(checkRule).toContain("opacity: 0;");
    expect(styles).toMatch(
      /\.user-preference-check\[data-visible='true'\]\s*\{[^}]*opacity: 1;/,
    );
  });
});

describe("Template migration dialog styles", () => {
  it("uses the shared dialog controls and wraps diff sections on narrow viewports", () => {
    expect(uiStyles).toMatch(
      /\.ui-dialog--wide\s*\{[^}]*width: min\(720px, 100%\);/,
    );
    expect(styles).not.toContain(".template-migration-backdrop");
    expect(styles).not.toContain(".template-migration-dialog footer button");
    expect(styles).toMatch(
      /\.template-migration-diff\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );

    const narrowStart = styles.indexOf("@media (max-width: 860px)");
    const narrowStyles = styles.slice(narrowStart);
    expect(narrowStyles).toMatch(
      /\.template-migration-diff\s*\{[^}]*grid-template-columns: 1fr;/,
    );
    expect(narrowStyles).toMatch(
      /\.template-migration-version-row\s*\{[^}]*grid-template-columns: 1fr;/,
    );
  });
});

describe("Settings styles", () => {
  it("keeps only the default model field surface in Settings styles", () => {
    const fieldRule =
      styles.match(/\.settings-default-model-field\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(fieldRule).toContain("min-width: 0;");
    expect(fieldRule).toContain("padding: 16px;");
    expect(styles).not.toContain(".settings-default-model-field > span");
    expect(styles).not.toContain(".settings-default-model-field select");
    expect(uiStyles).toMatch(
      /\.ui-field select[^}]*\{[^}]*width: 100%;[^}]*min-width: 0;/s,
    );
  });

  it("keeps model editor checkboxes at their native compact size", () => {
    const checkboxRule =
      styles.match(
        /\.model-form-grid \.model-check input\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(checkboxRule).toContain("width: auto;");
    expect(checkboxRule).toContain("height: auto;");
  });

  it("moves model profile actions below status copy in medium workspaces", () => {
    const mediumStart = styles.indexOf(
      "@container main-workspace (max-width: 760px)",
    );
    const narrowStart = styles.indexOf(
      "@container main-workspace (max-width: 520px)",
      mediumStart,
    );
    const mediumStyles = styles.slice(mediumStart, narrowStart);

    expect(mediumStyles).toMatch(
      /\.settings-content \.model-profile-row\s*\{[^}]*flex-direction: column;/,
    );
    expect(mediumStyles).toMatch(
      /\.model-profile-row \.model-row-meta\s*\{[^}]*justify-content: flex-end;/,
    );
  });

  it("keeps backup summaries stable and wraps them in medium workspaces", () => {
    expect(styles).toMatch(
      /\.backup-summary-grid\s*\{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/,
    );
    expect(styles).toMatch(
      /\.backup-checksum code\s*\{[^}]*overflow-wrap: anywhere;/,
    );

    const mediumStart = styles.indexOf(
      "@container main-workspace (max-width: 760px)",
    );
    const narrowStart = styles.indexOf(
      "@container main-workspace (max-width: 520px)",
      mediumStart,
    );
    const mediumStyles = styles.slice(mediumStart, narrowStart);
    expect(mediumStyles).toMatch(
      /\.backup-summary-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(mediumStyles).toMatch(
      /\.backup-preview-heading,[^{]*\.backup-restart\s*\{[^}]*flex-direction: column;/,
    );
  });
});

describe("Analytics styles", () => {
  it("starts analytics content at the shared page spacing below the header", () => {
    const pageRule = styles.match(/\.analytics-page\s*\{([^}]*)\}/)?.[1] ?? "";
    const productScopeRule =
      styles.match(/\.product-analytics-scope\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(pageRule).toContain("padding-top: 0;");
    expect(productScopeRule).toContain("margin-top: 32px;");
  });

  it("uses stable filter and summary grids", () => {
    expect(styles).toMatch(
      /\.analytics-filters\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/,
    );
    expect(styles).toMatch(
      /\.analytics-summary\s*\{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/,
    );
  });

  it("keeps trend bars proportional without changing row geometry", () => {
    expect(styles).toMatch(
      /\.analytics-trend-track i\s*\{[^}]*transform: scaleX\(var\(--trend-ratio\)\);/,
    );
    expect(styles).toMatch(
      /\.analytics-trend-plot li\s*\{[^}]*grid-template-columns: 52px minmax\(120px, 1fr\) 42px;/,
    );
  });

  it("keeps product analytics dense and responsive", () => {
    expect(styles).toMatch(
      /\.product-analytics-summary\s*\{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/,
    );
    expect(styles).toMatch(
      /\.product-analytics-distributions\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(styles).toMatch(
      /\.product-analytics-activity li\s*\{[^}]*grid-template-columns: 10px minmax\(0, 1fr\) auto;/,
    );
    const mediumStart = styles.indexOf(
      "@container main-workspace (max-width: 760px)",
    );
    const narrowStart = styles.indexOf(
      "@container main-workspace (max-width: 520px)",
      mediumStart,
    );
    const mediumStyles = styles.slice(mediumStart, narrowStart);
    expect(mediumStyles).toMatch(
      /\.product-analytics-summary\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(mediumStyles).toMatch(
      /\.product-analytics-distributions\s*\{[^}]*grid-template-columns: 1fr;/,
    );
  });
});

describe("Support page styles", () => {
  it("keeps update and help actions stable and stacks them in narrow workspaces", () => {
    expect(styles).toMatch(
      /\.support-page\s*\{[^}]*width: 100%;[^}]*min-width: 0;[^}]*overflow-y: auto;/,
    );
    expect(styles).toMatch(
      /\.help-online\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/,
    );

    const narrowStart = styles.indexOf(
      "@container main-workspace (max-width: 520px)",
    );
    const narrowStyles = styles.slice(narrowStart);
    expect(narrowStyles).toMatch(
      /\.support-page-heading,\s*\.update-version,\s*\.update-release\s*\{[^}]*flex-direction: column;/,
    );
    expect(narrowStyles).toMatch(
      /\.help-online-actions\s*\{[^}]*flex-direction: column;/,
    );
  });
});

describe("Composer focus styles", () => {
  it("keeps workspace routes in one full-height grid row after UI styles load", () => {
    expect(styles).toMatch(
      /\.ui-page\.app-route-page\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\);/,
    );
  });

  it("keeps the toolbar and context surface stable as controls wrap", () => {
    expect(styles).toMatch(
      /\.composer-toolbar\s*\{[^}]*display: flex;[^}]*min-width: 0;[^}]*align-items: center;/,
    );
    expect(styles).toMatch(/\.composer-context-surface\s*\{[^}]*min-width: 0;/);
  });

  it("uses only the inner input border as focus feedback", () => {
    expect(styles).not.toMatch(/\.composer:focus-within\s*\{/);
    expect(styles).toMatch(
      /\.composer:focus-within \.composer-input\s*\{[^}]*border-color: var\(--tone-bcbcbc\);[^}]*\}/,
    );
  });

  it("darkens context controls without adding decoration", () => {
    const interactionRule = styles.match(
      /\.composer-context \.select-control:hover,\s*\.composer-context \.select-control:focus-within\s*\{([^}]*)\}/,
    )?.[1];

    expect(interactionRule).toBeDefined();
    expect(interactionRule ?? "").toContain("color: var(--tone-222);");
    expect(interactionRule ?? "").not.toMatch(/background|border|box-shadow/);
    expect(styles).toMatch(
      /\.composer-context \.select-control select\s*\{[^}]*color: inherit;[^}]*\}/,
    );
  });

  it("keeps the composer attachment menu compact", () => {
    const menuRule = styles.match(/\.attachment-menu\s*\{([^}]*)\}/)?.[1] ?? "";
    const optionRule =
      styles.match(/\.attachment-menu \.ui-menu-item\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(menuRule).toContain("width: 218px;");
    expect(optionRule).toContain("font-size: 13px;");
    expect(uiStyles).toMatch(/\.ui-menu\s*\{[^}]*padding: 4px;/s);
    expect(uiStyles).toMatch(
      /\.ui-menu-item\s*\{[^}]*min-height: var\(--ui-control-default\);/s,
    );
    expect(uiStyles).toMatch(
      /\.ui-menu-separator\s*\{[^}]*margin: 3px 6px;/s,
    );
  });

  it("aligns the model selector with the main application menus", () => {
    const triggerRule =
      styles.match(/\.model-selector-trigger\s*\{([^}]*)\}/)?.[1] ?? "";
    const popoverRule =
      styles.match(/\.model-selector-popover\.ui-menu\s*\{([^}]*)\}/)?.[1] ??
      "";
    const optionRule =
      styles.match(
        /\.model-selector-list button,\s*\.model-selector-configure\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(triggerRule).toContain("width: auto;");
    expect(triggerRule).toContain("min-height: 32px;");
    expect(triggerRule).toContain("border-radius: 5px;");
    expect(uiStyles).toMatch(/\.ui-menu\s*\{[^}]*padding: 4px;/);
    expect(uiStyles).toMatch(
      /\.ui-menu\s*\{[^}]*border-radius: var\(--ui-radius-large\);/,
    );
    expect(popoverRule).toContain("width: min(272px, calc(100vw - 32px));");
    expect(uiStyles).toMatch(
      /\.ui-menu\s*\{[^}]*box-shadow: var\(--ui-shadow-menu\);/,
    );
    expect(uiStyles).toMatch(
      /\.ui-menu\s*\{[^}]*animation: ui-menu-in var\(--ui-motion-default\) ease-out;/,
    );
    expect(optionRule).toContain("min-height: 28px;");
    expect(optionRule).toContain("padding: 0 7px;");
    expect(uiStyles).toMatch(/\.ui-menu-item\s*\{[^}]*border-radius: 5px;/);
    expect(optionRule).toContain("font-size: 11px;");
    expect(styles).not.toMatch(/\.model-selector-search/);
    expect(styles).toMatch(
      /\.model-selector-provider-logo\s*\{[^}]*width: 14px;[^}]*height: 14px;/,
    );
    expect(styles).toMatch(
      /\.composer:has\(\.model-selector-popover\)\s*\{[^}]*z-index: 30;/,
    );
  });

  it("keeps elevation on the composer but not the inner input", () => {
    const composerRule =
      styles.match(/(?:^|\n)\.composer\s*\{([^}]*)\}/)?.[1] ?? "";
    const inputRule =
      styles.match(/(?:^|\n)\.composer-input\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(composerRule).toContain("box-shadow:");
    expect(composerRule).toContain(
      "box-shadow: 0 18px 24px -22px var(--tone-rgba-0-0-0-0-14);",
    );
    expect(inputRule).not.toContain("box-shadow:");
  });

  it("centers the new-chat composer unchanged on the space overview", () => {
    const launcherRule = styles.match(/\.space-chat\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(launcherRule).toContain("display: flex;");
    expect(launcherRule).toContain("justify-content: center;");
    expect(styles).not.toMatch(/\.space-chat \.composer-input\s*\{/);
    expect(styles).not.toMatch(/\.space-chat \.composer textarea\s*\{/);
    expect(styles).toMatch(
      /\.composer\.without-context \.composer-input\s*\{[^}]*border-radius: 18px;[^}]*\}/,
    );
  });

  it("aligns space and new-chat composers to the same top position", () => {
    const chatLauncherRule =
      styles.match(/\.chat-launcher\s*\{([^}]*)\}/)?.[1] ?? "";
    const spacePageRule =
      styles.match(/\.space-detail-page\s*\{([^}]*)\}/)?.[1] ?? "";
    const spaceContentRule =
      styles.match(/\.space-detail-content\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(chatLauncherRule).toContain(
      "padding: 89px clamp(36px, 7vw, 96px) 36px;",
    );
    expect(spacePageRule).toContain("grid-template-rows: minmax(0, 1fr);");
    expect(spaceContentRule).toContain("padding: 25px 0 40px;");
  });

  it("keeps space and new-chat composers aligned in narrow workspaces", () => {
    const narrowStyles =
      styles.match(
        /@container main-workspace \(max-width: 520px\) \{([\s\S]*?)\n\}/,
      )?.[1] ?? "";

    expect(narrowStyles).toMatch(
      /\.chat-launcher\s*\{[^}]*padding: 84px 16px 24px;/,
    );
    expect(narrowStyles).toMatch(
      /\.space-detail-content\s*\{[^}]*padding: 20px 0 32px;/,
    );
  });

  it("matches the space detail body width to the new-chat content width", () => {
    const spaceContentRules = [
      ...styles.matchAll(/\.space-detail-content\s*\{([^}]*)\}/g),
    ];

    expect(spaceContentRules).toHaveLength(2);
    expect(spaceContentRules[0]?.[1]).toContain(
      "width: var(--workspace-content-width);",
    );
    expect(spaceContentRules[1]?.[1]).toContain(
      "width: var(--workspace-content-width);",
    );
  });

  it("aligns every workspace page to the space detail content width", () => {
    const workspaceBodyRule =
      styles.match(/\.app-content-body\s*\{([^}]*)\}/)?.[1] ?? "";
    const sharedWidth = "width: var(--workspace-content-width);";
    const ruleForSelector = (selector: string): string =>
      [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((match) =>
        match[1]
          ?.split(",")
          .map((candidate) => candidate.trim())
          .includes(selector),
      )?.[2] ?? "";

    expect(workspaceBodyRule).toContain(
      "--workspace-content-width: min(1180px, calc(100% - clamp(68px, 10vw, 144px)));",
    );

    for (const selector of [
      ".page",
      ".space-detail-content",
      ".schedule-content",
      ".capabilities-content",
      '.analytics-page-content > .ui-page__container > [role="tabpanel"]',
      ".workflow-template-error",
      ".workflow-template-list",
      ".settings-content > *",
      ".requirement-detail-header",
      ".requirement-overview",
      ".requirement-brief",
      ".requirement-execution-summary",
      ".requirement-execution-error",
      ".development-flow",
      ".support-page > *",
      ".template-filters",
      ".template-grid",
    ]) {
      expect(ruleForSelector(selector), selector).toContain(sharedWidth);
    }

    const narrowStart = styles.indexOf(
      "@container main-workspace (max-width: 520px)",
    );
    const narrowStyles = styles.slice(narrowStart);
    expect(narrowStyles).toMatch(
      /\.app-content-body\s*\{[^}]*--workspace-content-width: calc\(100% - 32px\);/,
    );
  });

  it("expands the shared content width when the app has a maximized workspace", () => {
    const wideStart = styles.indexOf(
      "@container main-workspace (min-width: 1280px)",
    );
    const wideStyles = wideStart >= 0 ? styles.slice(wideStart) : "";

    expect(wideStart).toBeGreaterThanOrEqual(0);
    expect(wideStyles).toMatch(
      /\.app-content-body\s*\{[^}]*--workspace-content-width: min\(1360px, calc\(100% - clamp\(56px, 7vw, 112px\)\)\);/,
    );
  });

  it("uses a responsive master-detail layout for model settings", () => {
    const layoutRule =
      styles.match(/\.model-settings-layout\s*\{([^}]*)\}/)?.[1] ?? "";
    const detailRule =
      styles.match(/\.model-provider-detail\s*\{([^}]*)\}/)?.[1] ?? "";
    const responsiveStart = styles.indexOf(
      "@container main-workspace (max-width: 860px)",
    );
    const responsiveStyles =
      responsiveStart >= 0 ? styles.slice(responsiveStart) : "";

    expect(layoutRule).toContain(
      "grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);",
    );
    expect(layoutRule).toContain("min-height: 560px;");
    expect(detailRule).toContain("overflow-y: auto;");
    expect(responsiveStart).toBeGreaterThanOrEqual(0);
    expect(responsiveStyles).toMatch(
      /\.model-settings-layout\s*\{[^}]*grid-template-columns: 1fr;/,
    );
    expect(responsiveStyles).toMatch(
      /\.model-provider-empty-detail\s*\{[^}]*min-height: 300px;/,
    );
  });

  it("removes the outer edges around model settings content", () => {
    const contentRule =
      styles.match(/\.settings-content-models\s*\{([^}]*)\}/)?.[1] ?? "";
    const stackRule =
      styles.match(
        /\.settings-content-models > \.settings-section-stack\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const layoutRule =
      styles.match(
        /\.settings-content-models \.model-settings-layout\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(contentRule).toContain("padding: 0;");
    expect(contentRule).toContain("overflow: hidden;");
    expect(stackRule).toContain("width: 100%;");
    expect(stackRule).toContain("height: 100%;");
    expect(layoutRule).toContain("width: 100%;");
    expect(layoutRule).toContain("flex: 1 1 auto;");
    expect(layoutRule).toContain("margin: 0;");
    expect(layoutRule).toContain("border: 0;");
    expect(layoutRule).toContain("border-radius: 0;");
  });

  it("places the active settings title in the workspace header", () => {
    const headerRule =
      styles.match(/\.settings-page-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const titleRule =
      styles.match(/\.settings-page-header-title\s*\{([^}]*)\}/)?.[1] ?? "";
    const sharedHeaderRule =
      uiStyles.match(
        /\.ui-toolbar--workspace-header\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(sharedHeaderRule).toContain("height: 100%;");
    expect(sharedHeaderRule).toContain("width: 100%;");
    expect(sharedHeaderRule).toContain("padding: 0 64px 0 58px;");
    expect(sharedHeaderRule).toContain("pointer-events: none;");
    expect(headerRule).not.toMatch(
      /(?:display:|width:|height:|align-items:|justify-content:|padding:|pointer-events:)/,
    );
    expect(titleRule).toContain("font-size: 12px;");
    expect(titleRule).toContain("font-weight: 650;");
    expect(titleRule).not.toContain("border-bottom");
    expect(titleRule).toContain("text-overflow: ellipsis;");
    expect(titleRule).toContain("white-space: nowrap;");
  });

  it("reflows model detail content when its master-detail column is narrow", () => {
    const detailRule =
      styles.match(/\.model-provider-detail\s*\{([^}]*)\}/)?.[1] ?? "";
    const compactStart = styles.indexOf(
      "@container model-provider-detail (max-width: 560px)",
    );
    const compactStyles = compactStart >= 0 ? styles.slice(compactStart) : "";

    expect(detailRule).toContain("container-type: inline-size;");
    expect(detailRule).toContain("container-name: model-provider-detail;");
    expect(compactStart).toBeGreaterThanOrEqual(0);
    expect(compactStyles).toMatch(
      /\.model-provider-config\s*\{[^}]*grid-template-columns: 1fr;/,
    );
    expect(compactStyles).toMatch(
      /\.settings-content \.model-profile-row\s*\{[^}]*flex-direction: column;/,
    );
    expect(compactStyles).toMatch(
      /\.model-profile-row \.model-row-meta\s*\{[^}]*flex-wrap: wrap;/,
    );
  });

  it("styles the builtin provider picker as a searchable grouped catalog", () => {
    const dialogRule =
      styles.match(/\.ui-menu\.builtin-provider-dialog\s*\{([^}]*)\}/)?.[1] ??
      "";
    const railRule =
      styles.match(/\.model-provider-rail\s*\{([^}]*)\}/)?.[1] ?? "";
    const listRule =
      styles.match(/\.builtin-provider-list\s*\{([^}]*)\}/)?.[1] ?? "";
    const searchRule =
      styles.match(/\.builtin-provider-search\s*\{([^}]*)\}/)?.[1] ?? "";
    const itemRule =
      styles.match(/\.builtin-provider-row\s*\{([^}]*)\}/)?.[1] ?? "";
    const selectRule =
      styles.match(/\.builtin-provider-select\s*\{([^}]*)\}/)?.[1] ?? "";
    const websiteRule =
      styles.match(/\.builtin-provider-website\s*\{([^}]*)\}/)?.[1] ?? "";
    const customRule =
      styles.match(/\.builtin-provider-custom\s*\{([^}]*)\}/)?.[1] ?? "";
    const groupRule =
      styles.match(/\.builtin-provider-list > section\s*\{([^}]*)\}/)?.[1] ??
      "";
    const headingRule =
      styles.match(
        /\.builtin-provider-list > section > h3\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(railRule).toContain("padding: 14px;");
    expect(styles).not.toContain(".model-provider-rail > h3");
    expect(styles).not.toContain(".model-provider-search");
    expect(dialogRule).toContain("position: fixed;");
    expect(dialogRule).toContain("width: min(259.2px, calc(100vw - 24px));");
    expect(dialogRule).toContain("padding: 0;");
    expect(searchRule).toContain("flex: 0 0 auto;");
    expect(searchRule).toContain(
      "border-bottom: 1px solid var(--tone-e1e5e2);",
    );
    expect(listRule).toContain("flex: 1 1 auto;");
    expect(listRule).toContain("scrollbar-gutter: stable;");
    expect(listRule).toContain("overflow-y: auto;");
    expect(groupRule).toContain("border-bottom: 1px solid var(--tone-e1e5e2);");
    expect(headingRule).toContain("font-size: 11px;");
    expect(itemRule).toContain("grid-template-columns: minmax(0, 1fr) 28px;");
    expect(itemRule).toContain("min-height: 34px;");
    expect(selectRule).toContain("min-height: 34px;");
    expect(selectRule).toContain("grid-template-columns: 18px minmax(0, 1fr);");
    expect(selectRule).toContain("font-size: 12px;");
    expect(customRule).toContain("min-height: 34px;");
    expect(websiteRule).toContain("opacity: 1;");
    expect(styles).not.toContain(".builtin-provider-key-field > div");
    expect(uiStyles).toMatch(
      /\.ui-field__control-group\s*\{[^}]*min-height: var\(--ui-control-comfortable\);/s,
    );
  });

  it("places the space name immediately after the left-aligned tabs", () => {
    const headerRule =
      styles.match(/\.space-detail-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const nameRule =
      styles.match(/\.space-detail-name\s*\{([^}]*)\}/)?.[1] ?? "";
    const nameLabelRule =
      styles.match(/\.space-detail-name-label\s*\{([^}]*)\}/)?.[1] ?? "";
    const sharedHeaderRule =
      uiStyles.match(
        /\.ui-toolbar--workspace-header\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(sharedHeaderRule).toContain("width: 100%;");
    expect(sharedHeaderRule).toContain("padding: 0 64px 0 58px;");
    expect(headerRule).not.toMatch(
      /(?:display:|width:|height:|align-items:|justify-content:|padding:|pointer-events:)/,
    );
    expect(uiStyles).toMatch(/\.ui-tab-list--page\s*\{[^}]*gap: 24px;/);
    expect(nameRule).not.toContain("margin-left: 24px;");
    expect(nameRule).not.toContain("margin-left: auto;");
    expect(nameRule).not.toContain("overflow: hidden;");
    expect(nameLabelRule).toContain("max-width: min(32cqw, 280px);");
    expect(nameLabelRule).toContain("overflow: hidden;");
    expect(nameLabelRule).toContain("text-overflow: ellipsis;");
    expect(nameLabelRule).toContain("white-space: nowrap;");
  });

  it("keeps only the active tab underline in the space detail header", () => {
    const tabsRule =
      styles.match(/\.space-detail-tabs\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabButtonRule =
      uiStyles.match(/\.ui-tab-list--page \.ui-tab\s*\{([^}]*)\}/)?.[1] ?? "";
    const activeTabRule =
      uiStyles.match(
        /\.ui-tab-list--page \.ui-tab\[aria-selected="true"\]\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const activeIndicatorRule =
      uiStyles.match(
        /\.ui-tab-list--page \.ui-tab\[aria-selected="true"\]::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(tabsRule).not.toContain("border-bottom:");
    expect(tabButtonRule).toContain("height: 100%;");
    expect(activeTabRule).not.toContain("border-bottom-color:");
    expect(activeIndicatorRule).toContain("bottom: -1px;");
    expect(activeIndicatorRule).toContain("height: 2px;");
    expect(activeIndicatorRule).toContain("background: var(--color-text);");
  });

  it("places a clickable create requirement action at the right of the space header", () => {
    const createButtonRule =
      styles.match(/\.space-detail-create\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(createButtonRule).toBe("");
    expect(uiStyles).toMatch(
      /\.ui-toolbar--workspace-header\s*\{[^}]*justify-content: space-between;/s,
    );
    expect(uiStyles).toMatch(
      /\.ui-toolbar--workspace-header[\s\S]*?\.ui-button[^}]*-webkit-app-region: no-drag;/,
    );
  });

  it("matches the requirement name tab to the shared detail header style", () => {
    const headerRule =
      styles.match(/\.requirement-page-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabsRule =
      styles.match(/\.requirement-page-tabs\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabButtonRule =
      uiStyles.match(/\.ui-tab-list--page \.ui-tab\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(headerRule).not.toMatch(
      /(?:^|\n)\s*(?:display|width|height|align-items|padding|pointer-events):/,
    );
    expect(uiStyles).toMatch(
      /\.ui-toolbar--workspace-header\s*\{[^}]*padding: 0 64px 0 58px;/s,
    );
    expect(tabsRule).toContain("-webkit-app-region: no-drag;");
    expect(tabButtonRule).toContain("height: 100%;");
    expect(styles).not.toMatch(/\.requirement-page-tabs button/);
  });

  it("matches schedule header tabs to the space detail interaction style", () => {
    const headerRule =
      styles.match(/\.schedule-page-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabButtonRule =
      uiStyles.match(/\.ui-tab-list--page \.ui-tab\s*\{([^}]*)\}/)?.[1] ?? "";
    const createButtonRule =
      styles.match(/\.schedule-page-create\s*\{([^}]*)\}/)?.[1] ?? "";
    const contentRule =
      styles.match(/\.schedule-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const activeIndicatorRule =
      uiStyles.match(
        /\.ui-tab-list--page \.ui-tab\[aria-selected="true"\]::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(headerRule).not.toMatch(
      /(?:display:|width:|height:|align-items:|justify-content:|padding:|pointer-events:)/,
    );
    expect(tabButtonRule).toContain("height: 100%;");
    expect(createButtonRule).toBe("");
    expect(contentRule).toContain("padding: 32px 0 112px;");
    expect(activeIndicatorRule).toContain("bottom: -1px;");
    expect(activeIndicatorRule).toContain("height: 2px;");
  });

  it("matches workflow template tabs to the schedule header style", () => {
    const headerRule =
      styles.match(/\.workflow-templates-page-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabButtonRule =
      uiStyles.match(/\.ui-tab-list--page \.ui-tab\s*\{([^}]*)\}/)?.[1] ?? "";
    const createButtonRule =
      styles.match(/\.workflow-templates-create\s*\{([^}]*)\}/)?.[1] ?? "";
    const pageRule =
      styles.match(/\.workflow-templates-page\s*\{([^}]*)\}/)?.[1] ?? "";
    const listRule =
      styles.match(/\.workflow-template-list\s*\{([^}]*)\}/)?.[1] ?? "";
    const activeIndicatorRule =
      uiStyles.match(
        /\.ui-tab-list--page \.ui-tab\[aria-selected="true"\]::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(headerRule).not.toMatch(
      /(?:display:|width:|height:|align-items:|justify-content:|padding:|pointer-events:)/,
    );
    expect(tabButtonRule).toContain("height: 100%;");
    expect(tabButtonRule).toContain("border-bottom: 2px solid transparent;");
    expect(createButtonRule).toBe("");
    expect(pageRule).toContain("padding: 32px 0 64px;");
    expect(listRule).toContain("margin: 0 auto;");
    expect(listRule).toContain("display: grid;");
    expect(listRule).toContain("gap: 8px;");
    expect(listRule).not.toContain("border-radius:");
    expect(uiStyles).toMatch(
      /\.ui-card\s*\{[^}]*border: 1px solid var\(--color-border\)/,
    );
    expect(styles).toMatch(
      /\.workflow-template-actions\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.workflow-template-row:hover \.workflow-template-actions,\s*\.workflow-template-row:focus-within \.workflow-template-actions\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s,
    );
    expect(styles).not.toContain(".workflow-templates-heading");
    expect(activeIndicatorRule).toContain("bottom: -1px;");
    expect(activeIndicatorRule).toContain("height: 2px;");
    const contentRule =
      styles.match(/\.capabilities-content\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(contentRule).toContain("max-width: 100%;");
    expect(contentRule).toContain("box-sizing: border-box;");
  });

  it("matches capability tabs to the shared workspace header style", () => {
    const headerRule =
      styles.match(/\.capabilities-page-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabsRule =
      styles.match(/\.capabilities-page-tabs\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabButtonRule =
      uiStyles.match(/\.ui-tab-list--page \.ui-tab\s*\{([^}]*)\}/)?.[1] ?? "";
    const activeIndicatorRule =
      uiStyles.match(
        /\.ui-tab-list--page \.ui-tab\[aria-selected="true"\]::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(headerRule).toContain("height: 100%;");
    expect(tabsRule).toContain("-webkit-app-region: no-drag;");
    expect(tabButtonRule).toContain("height: 100%;");
    expect(tabButtonRule).toContain("border-bottom: 2px solid transparent;");
    expect(activeIndicatorRule).toContain("bottom: -1px;");
    expect(activeIndicatorRule).toContain("height: 2px;");
  });

  it("gives the tool catalog a bounded list layout", () => {
    expect(styles).toMatch(
      /\.tool-catalog\s*\{[^}]*display:\s*grid;[^}]*min-width:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.tool-catalog-toolbar\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s,
    );
    expect(styles).toMatch(
      /\.tool-catalog-origin-filter,\s*\.tool-catalog-import-actions\s*\{[^}]*display:\s*flex;[^}]*gap:\s*6px;/s,
    );
    expect(styles).toMatch(
      /\.tool-catalog-origin-filter button\[aria-pressed='true'\]\s*\{[^}]*font-weight:\s*650;/s,
    );
    expect(styles).toMatch(
      /\.tool-catalog-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*36px minmax\(0, 1fr\) auto;/s,
    );
    expect(styles).toMatch(/\.tool-catalog-copy\s*\{[^}]*min-width:\s*0;/s);
  });

  it("matches analytics tabs to the shared workspace header style", () => {
    const headerRule =
      styles.match(/\.analytics-page-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabsRule =
      styles.match(/\.analytics-page-tabs\s*\{([^}]*)\}/)?.[1] ?? "";
    const tabButtonRule =
      uiStyles.match(/\.ui-tab-list--page \.ui-tab\s*\{([^}]*)\}/)?.[1] ?? "";
    const activeIndicatorRule =
      uiStyles.match(
        /\.ui-tab-list--page \.ui-tab\[aria-selected="true"\]::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(headerRule).toContain("height: 100%;");
    expect(headerRule).toContain("padding: 0 64px 0 58px;");
    expect(tabsRule).toContain("-webkit-app-region: no-drag;");
    expect(tabButtonRule).toContain("height: 100%;");
    expect(tabButtonRule).toContain("border-bottom: 2px solid transparent;");
    expect(activeIndicatorRule).toContain("bottom: -1px;");
    expect(activeIndicatorRule).toContain("height: 2px;");
  });

  it("keeps the empty schedule state free of divider lines", () => {
    const emptyStateRule =
      styles.match(/\.schedule-empty\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(emptyStateRule).toContain("min-height: 260px;");
    expect(emptyStateRule).not.toContain("border-top:");
    expect(emptyStateRule).not.toContain("border-bottom:");
  });

  it("does not draw a full-width divider below the conversation header", () => {
    const headerRule =
      styles.match(/\.chat-session-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const titleRule =
      styles.match(/\.chat-session-title-text,\s*\n\.chat-session-header h1\s*\{([^}]*)\}/)
        ?.[1] ?? "";
    const titleWrapperRule =
      styles.match(/\.chat-session-header-title\s*\{([^}]*)\}/)?.[1] ?? "";
    const subtitleRule =
      styles.match(/\.chat-session-subtitle-text,\s*\n\.chat-session-header p\s*\{([^}]*)\}/)
        ?.[1] ?? "";

    expect(headerRule).not.toContain("border-bottom:");
    expect(headerRule).not.toMatch(
      /(?:^|\n)\s*(?:display|width|height|align-items|padding|pointer-events):/,
    );
    expect(titleWrapperRule).toContain(
      "font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif;",
    );
    expect(titleRule).toContain("min-width: 0;");
    expect(titleRule).toContain("overflow: hidden;");
    expect(titleRule).toContain("text-overflow: ellipsis;");
    expect(titleRule).toContain("white-space: nowrap;");
    expect(titleRule).toContain("font-size: 13px;");
    expect(titleRule).toContain("font-weight: 500;");
    expect(titleRule).toContain("line-height: 18px;");
    expect(subtitleRule).toContain("color: var(--tone-8a8a8a);");
    expect(subtitleRule).toContain("font-size: 10px;");
    expect(subtitleRule).toContain("font-weight: 400;");
    expect(subtitleRule).toContain("line-height: 14px;");
  });

  it("keeps the conversation body to messages and a compact reply composer", () => {
    const pageRule =
      styles.match(/\.chat-session-page\s*\{([^}]*)\}/)?.[1] ?? "";
    const compactInputRule =
      styles.match(/\.composer\.compact \.composer-input\s*\{([^}]*)\}/)?.[1] ??
      "";
    const compactTextareaRule =
      styles.match(/\.composer\.compact textarea\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(pageRule).toContain("grid-template-rows: minmax(0, 1fr) auto;");
    expect(compactInputRule).toContain("padding: 14px 18px 10px;");
    expect(compactTextareaRule).toContain("height: 52px;");
    expect(styles).toMatch(
      /\.chat-session-messages\s*\{[^}]*width: var\(--conversation-content-width\);/,
    );
    expect(styles).toMatch(
      /\.chat-session-composer \.composer\s*\{[^}]*width: var\(--conversation-content-width\);/,
    );
    expect(styles).toMatch(
      /\.chat-message\.assistant\.pending \.chat-message-markdown > :last-child::after\s*\{[^}]*animation: chat-stream-caret/,
    );
  });

  it("keeps assistant execution details compact in long timelines", () => {
    const triggerRule =
      styles.match(/\.assistant-task-disclosure-trigger\s*\{([^}]*)\}/)?.[1] ??
      "";
    const iconRule =
      styles.match(
        /\.assistant-task-disclosure-trigger svg\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const contentRule =
      styles.match(/\.assistant-task-disclosure-content\s*\{([^}]*)\}/)?.[1] ??
      "";
    expect(styles).toMatch(
      /\.assistant-execution-timeline\[data-density='compact'\]\s*\{[^}]*gap: 4px;/,
    );
    expect(styles).toMatch(
      /\.assistant-execution-timeline\[data-density='compact'\] \.assistant-disclosure-trigger\s*\{[^}]*min-height: 24px;/,
    );
    expect(triggerRule).toContain("padding: 0;");
    expect(triggerRule).toContain("color: var(--tone-777);");
    expect(triggerRule).toContain("font-weight: 400;");
    expect(triggerRule).toContain(
      "border-bottom: 1px solid var(--tone-e5e5e5);",
    );
    expect(triggerRule).toContain("padding-bottom: 12px;");
    expect(iconRule).toContain("width: 12px;");
    expect(iconRule).toContain("height: 12px;");
    expect(contentRule).toContain("padding: 12px 0 0;");
    expect(contentRule).not.toContain("padding-inline-start:");
  });

  it("keeps the user-message index fixed beside the scrolling message column", () => {
    const shellRule =
      styles.match(/\.chat-session-scroll-shell\s*\{([^}]*)\}/)?.[1] ?? "";
    const indexRule =
      styles.match(/\.chat-message-index\s*\{([^}]*)\}/)?.[1] ?? "";
    const dotRule =
      styles.match(/\.chat-message-index-dot\s*\{([^}]*)\}/)?.[1] ?? "";
    const markerRule =
      styles.match(/\.chat-message-index-marker\s*\{([^}]*)\}/)?.[1] ?? "";
    const activeDotRule =
      styles.match(
        /\.chat-message-index-dot\[aria-current='true'\] \.chat-message-index-marker\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const previewRule =
      styles.match(/\.chat-message-index-preview\s*\{([^}]*)\}/)?.[1] ?? "";
    const previewContentRule =
      styles.match(/\.chat-message-index-preview::before\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(shellRule).toContain("position: relative;");
    expect(shellRule).toContain("min-height: 0;");
    expect(indexRule).toContain("position: absolute;");
    expect(indexRule).toContain("top: 50%;");
    expect(indexRule).toContain("left: 6px;");
    expect(indexRule).toContain("z-index: 2;");
    expect(indexRule).toContain("max-height: 270px;");
    expect(indexRule).toContain("overflow-y: auto;");
    expect(indexRule).toContain("mask-image: linear-gradient(to bottom, transparent 0, black 36px, black 100%);");
    expect(dotRule).toContain("width: 16px;");
    expect(dotRule).toContain("height: 16px;");
    expect(dotRule).toContain("flex: 0 0 16px;");
    expect(markerRule).toContain("width: 8px;");
    expect(markerRule).toContain("height: 8px;");
    expect(activeDotRule).toContain("background: var(--tone-424242);");
    expect(activeDotRule).toContain("transform: none;");
    expect(previewRule).toContain("pointer-events: none;");
    expect(previewRule).toContain("white-space: normal;");
    expect(previewContentRule).toContain("display: -webkit-box;");
    expect(previewContentRule).toContain("-webkit-line-clamp: 3;");
    expect(previewContentRule).toContain("-webkit-box-orient: vertical;");
    expect(previewContentRule).toContain("overflow: hidden;");
    expect(styles).toMatch(
      /\.chat-message-index-dot:hover \.chat-message-index-preview,\s*\.chat-message-index-dot:focus-visible \.chat-message-index-preview\s*\{[^}]*opacity: 1;/,
    );
  });

  it("keeps assistant actions visible and reveals its model and time on hover", () => {
    const footerRule =
      styles.match(/(?:^|\n)\.chat-message-footer\s*\{([^}]*)\}/)?.[1] ?? "";
    const assistantFooterRule =
      styles.match(/\.chat-message-footer\.assistant\s*\{([^}]*)\}/)?.[1] ?? "";
    const assistantMetaRule =
      styles.match(/\.chat-message-assistant-meta\s*\{([^}]*)\}/)?.[1] ?? "";
    const actionRule =
      styles.match(/\.chat-message-action\s*\{([^}]*)\}/)?.[1] ?? "";
    const assistantBodyRule =
      styles.match(/\.chat-message-assistant-body\s*\{([^}]*)\}/)?.[1] ?? "";
    const bodyFooterRule =
      styles.match(
        /\.chat-message-assistant-body > \.chat-message-footer\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(styles).not.toContain(".chat-follow-ups");
    expect(footerRule).toContain("margin-top: 6px;");
    expect(assistantBodyRule).toContain("gap: 12px;");
    expect(bodyFooterRule).toContain("margin-top: 0;");
    expect(assistantFooterRule).toContain("justify-content: flex-start;");
    expect(assistantFooterRule).toContain("gap: 4px;");
    expect(assistantMetaRule).toContain("opacity: 0;");
    expect(styles).toMatch(
      /\.chat-message\.assistant:hover \.chat-message-assistant-meta,\s*\.chat-message\.assistant:focus-within \.chat-message-assistant-meta\s*\{[^}]*opacity: 1;/,
    );
    expect(actionRule).toContain("background: transparent;");
    expect(actionRule).toContain("border: 0;");
  });

  it("reveals the complete user message footer on hover and keyboard focus", () => {
    const userFooterRule =
      styles.match(/\.chat-message-footer\.user\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(userFooterRule).toContain("opacity: 0;");
    expect(userFooterRule).toContain("pointer-events: none;");
    expect(styles).toMatch(
      /\.chat-message\.user:hover \.chat-message-footer,\s*\.chat-message\.user:focus-within \.chat-message-footer\s*\{[^}]*opacity: 1;[^}]*pointer-events: auto;/,
    );
  });

  it("keeps conversation sharing bounded and locally renderable", () => {
    const dialogRule =
      styles.match(/\.conversation-share-dialog\s*\{([^}]*)\}/)?.[1] ?? "";
    const selectionRule =
      styles.match(/\.conversation-share-selection\s*\{([^}]*)\}/)?.[1] ?? "";
    const cardRule =
      styles.match(/\.conversation-share-card\s*\{([^}]*)\}/)?.[1] ?? "";
    const shareTableRule =
      styles.match(/\.conversation-share-card table\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(styles).not.toContain(".conversation-share-backdrop");
    expect(dialogRule).toContain("width: min(920px, 100%);");
    expect(dialogRule).toContain(
      "height: min(760px, calc(100dvh - 32px));",
    );
    expect(dialogRule).not.toMatch(
      /(?:background|border|border-radius|box-shadow|max-height|overflow)\s*:/,
    );
    expect(selectionRule).toContain("min-height: 0;");
    expect(selectionRule).toContain("padding: 0;");
    expect(cardRule).toContain("width: 760px;");
    expect(cardRule).toContain("background: white;");
    expect(styles).toMatch(
      /\.conversation-share-selection \.chat-message-index\s*\{[^}]*display: none;/,
    );
    expect(styles).toMatch(
      /\.conversation-share-close\s*\{[^}]*-webkit-app-region: no-drag;[^}]*pointer-events: auto;/,
    );
    expect(styles).not.toContain(".conversation-share-header .icon-button");
    expect(uiStyles).toMatch(
      /\.ui-icon-button\.ui-button--compact\s*\{[^}]*width: var\(--ui-control-compact\);[^}]*flex-basis: var\(--ui-control-compact\);/s,
    );
    expect(styles).toMatch(
      /\.conversation-share-selection \.chat-message\.is-selected\s*\{[^}]*background: var\(--tone-f2f2f2\);/,
    );
    expect(styles).toMatch(
      /\.conversation-share-selection \.chat-message-selector,\s*\.conversation-share-selection \.chat-message\.user \.chat-message-selector\s*\{[^}]*inset-inline-start: 16px;/,
    );
    expect(styles).toMatch(
      /\.conversation-share-card \.markdown-table-scroll\s*\{[^}]*overflow: hidden;/,
    );
    expect(shareTableRule).toContain("width: 100%;");
    expect(shareTableRule).toContain("table-layout: fixed;");
    expect(styles).toMatch(
      /\.conversation-share-card pre code\s*\{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/,
    );
  });

  it("contains assistant Markdown overflow inside the message column", () => {
    const markdownRule =
      styles.match(/\.chat-message-markdown\s*\{([^}]*)\}/)?.[1] ?? "";
    const preRule =
      styles.match(/\.chat-message-markdown pre\s*\{([^}]*)\}/)?.[1] ?? "";
    const tableWrapperRule =
      styles.match(
        /\.chat-message-markdown \.markdown-table-scroll\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(markdownRule).toContain("min-width: 0;");
    expect(markdownRule).toContain("overflow-wrap: anywhere;");
    expect(preRule).toContain("overflow-x: auto;");
    expect(tableWrapperRule).toContain("overflow-x: auto;");
  });

  it("matches the reference density for assistant replies", () => {
    const markdownRule =
      styles.match(/\.chat-message-markdown\s*\{([^}]*)\}/)?.[1] ?? "";
    const paragraphRule =
      styles.match(/\.chat-message-markdown p\s*\{([^}]*)\}/)?.[1] ?? "";
    const listRule =
      styles.match(
        /\.chat-message-markdown ul,\s*\.chat-message-markdown ol\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const strongRule =
      styles.match(/\.chat-message-markdown strong\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(markdownRule).toContain("font-size: 14px;");
    expect(markdownRule).toContain("font-weight: 400;");
    expect(markdownRule).toContain("line-height: 24px;");
    expect(markdownRule).toContain("color: var(--tone-424242);");
    expect(paragraphRule).toContain("margin: 0 0 8px;");
    expect(listRule).toContain("margin: 0 0 8px;");
    expect(strongRule).toContain("font-weight: 500;");
  });

  it("keeps code block controls and the workbench editor within stable rows", () => {
    const codeBlockRule =
      styles.match(/\.conversation-code-block\s*\{([^}]*)\}/)?.[1] ?? "";
    const codeHeaderRule =
      styles.match(/\.conversation-code-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const codePaneRule =
      workbenchStyles.match(/\.global-code-pane\s*\{([^}]*)\}/)?.[1] ?? "";
    const codeOutputRule =
      workbenchStyles.match(/\.global-code-output\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(codeBlockRule).toContain("max-width: 100%;");
    expect(codeBlockRule).toContain("overflow: hidden;");
    expect(codeHeaderRule).toContain("min-height: 36px;");
    expect(codePaneRule).toContain(
      "grid-template-rows: 42px minmax(220px, 1fr) auto;",
    );
    expect(codeOutputRule).toContain("overflow: auto;");
  });

  it("uses compact spacing inside conversation code blocks", () => {
    const codePreRule =
      styles.match(
        /\.chat-message-markdown \.conversation-code-block pre\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(codePreRule).toContain("padding: 10px 14px;");
    expect(codePreRule).toContain("line-height: 1.45;");
  });

  it("uses readable new-chat typography below the space composer", () => {
    const summaryLabelRule =
      styles.match(/\.space-statistics-summary span\s*\{([^}]*)\}/)?.[1] ?? "";
    const headingRule =
      styles.match(
        /\.space-statistics-grid h2,\s*\.space-resource-header h2\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const stageRule =
      styles.match(/\.space-stage-row\s*\{([^}]*)\}/)?.[1] ?? "";
    const requirementRule =
      styles.match(
        /\.space-requirement-table > div,\s*\.space-requirement-table > a\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const resourceRule =
      styles.match(/\.space-resource-table > div\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(summaryLabelRule).toContain("font-size: 13px;");
    expect(headingRule).toContain("font-size: 16px;");
    expect(stageRule).toContain("font-size: 12px;");
    expect(requirementRule).toContain("font-size: 12px;");
    expect(resourceRule).toContain("font-size: 12px;");
  });

  it("matches the recent heading density to the spaces heading", () => {
    const spacesHeadingRule =
      styles.match(/\.spaces-heading\s*\{([^}]*)\}/)?.[1] ?? "";
    const recentHeadingRule =
      styles.match(/\.recent-heading\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(spacesHeadingRule).toContain("height: 32px;");
    expect(recentHeadingRule).toContain("height: 32px;");
    expect(recentHeadingRule).toContain("padding: 0 8px;");
    expect(recentHeadingRule).toContain("color: var(--tone-8a8a8a);");
    expect(recentHeadingRule).toContain("font-size: 12px;");
    expect(recentHeadingRule).toContain("font-weight: 400;");
  });

  it("lets compact spaces move recent conversations upward while preserving scroll", () => {
    const sidebarRule =
      styles.match(/(?:^|\n)\.sidebar\s*\{([^}]*)\}/)?.[1] ?? "";
    const collectionsRule =
      styles.match(/\.sidebar-collections\s*\{([^}]*)\}/)?.[1] ?? "";
    const spacesSectionRule =
      [...styles.matchAll(/(?:^|\n)\.spaces-section\s*\{([^}]*)\}/g)]
        .map((match) => match[1])
        .find((rule) => rule.includes("flex:")) ?? "";
    const recentSectionRule =
      [...styles.matchAll(/(?:^|\n)\.recent-section\s*\{([^}]*)\}/g)]
        .map((match) => match[1])
        .find((rule) => rule.includes("flex:")) ?? "";
    const listRule =
      styles.match(
        /\.space-list,\s*\.recent-session-list\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(sidebarRule).toContain("height: 100%;");
    expect(sidebarRule).toContain("min-height: 0;");
    expect(sidebarRule).toContain("overflow: hidden;");
    expect(collectionsRule).toContain("display: flex;");
    expect(collectionsRule).toContain("flex-direction: column;");
    expect(collectionsRule).toContain("overflow: hidden;");
    expect(spacesSectionRule).toContain("flex: 0 1 auto;");
    expect(spacesSectionRule).toContain("max-height: 50%;");
    expect(recentSectionRule).toContain("flex: 1 1 0;");
    expect(listRule).toContain("min-height: 0;");
    expect(listRule).toContain("align-content: start;");
    expect(listRule).toContain("overflow-y: auto;");
  });

  it("does not stretch spaces when recent conversations are collapsed", () => {
    expect(styles).not.toMatch(
      /\.sidebar-collections\.spaces-open\.recent-closed\s+\.spaces-section/,
    );
  });

  it("keeps sidebar section spacing compact without divider lines", () => {
    const navigationRule =
      styles.match(/\.sidebar > nav\s*\{([^}]*)\}/)?.[1] ?? "";
    const sectionRule =
      styles.match(/\.spaces-section,\s*\.recent-section\s*\{([^}]*)\}/)?.[1] ??
      "";
    const recentSectionRule =
      [...styles.matchAll(/(?:^|\n)\.recent-section\s*\{([^}]*)\}/g)]
        .map((match) => match[1])
        .find((rule) => rule.includes("flex:")) ?? "";

    expect(navigationRule).toContain("padding: 0 16px;");
    expect(sectionRule).toContain("padding: 0 16px;");
    expect(recentSectionRule).toContain("padding-right: 0;");
    expect(sectionRule).not.toContain("border-top:");
    expect(styles).toMatch(/\.space-list\s*\{[^}]*margin-top:\s*0;/s);
  });

  it("keeps the outer shell transparent around the input", () => {
    const composerRule =
      styles.match(/(?:^|\n)\.composer\s*\{([^}]*)\}/)?.[1] ?? "";
    const contextRule =
      styles.match(/(?:^|\n)\.composer-context\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(composerRule).toContain("background: transparent;");
    expect(composerRule).toContain("border: 0;");
    expect(contextRule).toContain("background: var(--tone-f3f3f3);");
  });

  it("joins the input bottom corners to the context area", () => {
    const composerRule =
      styles.match(/(?:^|\n)\.composer\s*\{([^}]*)\}/)?.[1] ?? "";
    const inputRule =
      styles.match(/(?:^|\n)\.composer-input\s*\{([^}]*)\}/)?.[1] ?? "";
    const contextRule =
      styles.match(/(?:^|\n)\.composer-context\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(composerRule).toContain("border-radius: 18px;");
    expect(inputRule).toContain("border-radius: 18px 18px 0 0;");
    expect(contextRule).toContain("border-radius: 0 0 18px 18px;");
  });

  it("uses the shared dialog as the schedule editor surface", () => {
    const dialogRule =
      styles.match(/\.schedule-create-dialog\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(dialogRule).toContain("display: contents;");
    expect(styles).not.toContain(".schedule-dialog-backdrop");
    expect(styles).not.toContain(".schedule-field input");
    expect(uiStyles).toMatch(
      /\.ui-dialog\s*\{[^}]*border-radius: var\(--ui-radius-large\);/,
    );
  });

  it("removes the superseded floating schedule create action", () => {
    expect(styles).not.toContain(".schedule-create-fab");
  });

  it("positions space item menus outside the scroll clipping context", () => {
    const menuRule =
      [
        ...styles.matchAll(
          /(?:^|\n)\.ui-menu\.space-item-actions-menu\s*\{([^}]*)\}/g,
        ),
      ]
        .map((match) => match[1])
        .find((rule) => rule.includes("position:")) ?? "";

    expect(menuRule).toContain("position: fixed;");
  });

  it("positions requirement menus outside the scroll clipping context", () => {
    const menuRules = [
      ...styles.matchAll(
        /(?:^|\n)\.ui-menu\.requirement-actions-menu\s*\{([^}]*)\}/g,
      ),
    ].map((match) => match[1]);

    expect(menuRules.some((rule) => rule.includes("position: fixed;"))).toBe(
      true,
    );
  });

  it("keeps primary navigation rows compact", () => {
    const navigationRule =
      styles.match(/\.sidebar > nav\s*\{([^}]*)\}/)?.[1] ?? "";
    const itemRule =
      styles.match(/(?:^|\n)\.nav-item\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(navigationRule).toContain("gap: 1px;");
    expect(itemRule).toContain("min-height: 34px;");
  });

  it("keeps contextual sidebar actions reachable by keyboard and touch", () => {
    const spaceActionsRule =
      styles.match(/\.space-row-actions\s*\{([^}]*)\}/)?.[1] ?? "";
    const requirementActionsRule =
      styles.match(/\.requirement-row-actions\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(spaceActionsRule).not.toContain("visibility: hidden;");
    expect(requirementActionsRule).not.toContain("visibility: hidden;");
    expect(styles).toMatch(
      /\.nav-item:focus-visible,\s*\.recent-session:focus-visible,\s*\.user-trigger:focus-visible\s*\{[^}]*outline: 2px solid var\(--color-focus\);[^}]*outline-offset: -2px;/,
    );
    expect(styles).toMatch(
      /@media \(hover: none\)[\s\S]*?\.space-row-actions,[\s\S]*?\.requirement-row-actions,[\s\S]*?\.space-actions-trigger,[\s\S]*?\.recent-filter-button\s*\{[^}]*opacity: 1;[^}]*visibility: visible;[^}]*pointer-events: auto;/,
    );
  });

  it("keeps compact space rows and inline requirement controls", () => {
    const itemRule =
      styles.match(/(?:^|\n)\.space-item\s*\{([^}]*)\}/)?.[1] ?? "";
    const iconRule =
      styles.match(/(?:^|\n)\.space-icon\s*\{([^}]*)\}/)?.[1] ?? "";
    const rowRule =
      styles.match(/(?:^|\n)\.space-row\s*\{([^}]*)\}/)?.[1] ?? "";
    const toggleRule =
      styles.match(/\.space-requirements-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
    const listRule =
      styles.match(/(?:^|\n)\.space-list\s*\{([^}]*)\}/)?.[1] ?? "";
    const entryRule =
      styles.match(/(?:^|\n)\.space-entry\s*\{([^}]*)\}/)?.[1] ?? "";
    const requirementListRule =
      styles.match(/(?:^|\n)\.space-requirements\s*\{([^}]*)\}/)?.[1] ?? "";
    const requirementItemRule =
      styles.match(/\.space-requirements li\s*\{([^}]*)\}/)?.[1] ?? "";
    const requirementLinkRule =
      styles.match(/\.space-requirements li a\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rowRule).toContain("display: flex;");
    expect(rowRule).toContain("min-height: 32px;");
    expect(itemRule).toContain("width: 100%;");
    expect(itemRule).toContain("flex: 1 1 auto;");
    expect(itemRule).toContain("gap: 11px;");
    expect(itemRule).toContain("min-height: 32px;");
    expect(iconRule).toContain("width: 18px;");
    expect(iconRule).toContain("height: 18px;");
    expect(toggleRule).toContain("width: 22px;");
    expect(listRule).toContain("gap: 1px;");
    expect(listRule).toContain("margin-top: 0;");
    expect(entryRule).toContain("gap: 1px;");
    expect(requirementListRule).toContain("padding: 0 0 2px 12px;");
    expect(requirementListRule).toContain("gap: 1px;");
    expect(requirementItemRule).toContain("min-height: 28px;");
    expect(requirementLinkRule).toContain("min-height: 28px;");
  });

  it("truncates long space and requirement names to one line", () => {
    const spaceNameRule =
      styles.match(/\.space-item > span:last-child\s*\{([^}]*)\}/)?.[1] ?? "";
    const requirementNameRule =
      styles.match(/\.space-requirements li span\s*\{([^}]*)\}/)?.[1] ?? "";

    for (const rule of [spaceNameRule, requirementNameRule]) {
      expect(rule).toContain("min-width: 0;");
      expect(rule).toContain("overflow: hidden;");
      expect(rule).toContain("text-overflow: ellipsis;");
      expect(rule).toContain("white-space: nowrap;");
    }

    for (const selector of [
      ".space-list",
      ".space-entry",
      ".space-row",
      ".space-item",
      ".space-requirements",
    ]) {
      const rule =
        styles.match(
          new RegExp(
            `(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`,
          ),
        )?.[1] ?? "";
      expect(rule).toContain("min-width: 0;");
    }
  });

  it("reveals space collapse controls only on row interaction", () => {
    const groupChevronRule =
      styles.match(/(?:^|\n)\.spaces-chevron\s*\{([^}]*)\}/)?.[1] ?? "";
    const spaceToggleRule =
      styles.match(/\.space-requirements-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
    const groupRevealRule =
      styles.match(
        /\.spaces-heading:hover \.spaces-chevron,\s*\.spaces-heading:focus-within \.spaces-chevron\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const spaceRevealRule =
      styles.match(
        /\.space-row:hover \.space-requirements-toggle,\s*\.space-row:focus-within \.space-requirements-toggle\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    for (const rule of [groupChevronRule, spaceToggleRule]) {
      expect(rule).toContain("opacity: 0;");
      expect(rule).toContain("pointer-events: none;");
    }

    for (const rule of [groupRevealRule, spaceRevealRule]) {
      expect(rule).toContain("opacity: 1;");
      expect(rule).toContain("pointer-events: auto;");
    }
  });

  it("matches recent collapse controls to the space collapse controls", () => {
    const spacesToggleRule =
      styles.match(/\.spaces-toggle\s*\{([^}]*)\}/)?.[1]?.trim() ?? "";
    const recentToggleRule =
      styles.match(/\.recent-toggle\s*\{([^}]*)\}/)?.[1]?.trim() ?? "";
    const spacesChevronRule =
      styles.match(/(?:^|\n)\.spaces-chevron\s*\{([^}]*)\}/)?.[1]?.trim() ?? "";
    const recentChevronRule =
      styles.match(/(?:^|\n)\.recent-chevron\s*\{([^}]*)\}/)?.[1]?.trim() ?? "";

    expect(recentToggleRule).toBe(spacesToggleRule);
    expect(recentChevronRule).toBe(spacesChevronRule);
    expect(styles).not.toContain(".recent-chevron:hover");
  });

  it("matches space and recent headings to Doubao section typography", () => {
    const toggleRule =
      styles.match(/(?:^|\n)\.spaces-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
    const labelRule =
      styles.match(/\.spaces-toggle span\s*\{([^}]*)\}/)?.[1] ?? "";
    const recentLabelRule =
      styles.match(/\.recent-toggle span\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(toggleRule).toContain("color: var(--tone-8a8a8a);");
    for (const rule of [labelRule, recentLabelRule]) {
      expect(rule).toContain("font-size: 12px;");
      expect(rule).toContain("font-weight: 400;");
    }
  });

  it("gives the selected requirement a visible active background", () => {
    const activeRule =
      styles.match(/\.space-requirements li a\.active\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(activeRule).toContain("background: var(--tone-e3e3e3);");
  });

  it("keeps recent filters stable and contained in narrow sidebars", () => {
    const buttonRule =
      styles.match(/\.recent-filter-button\s*\{([^}]*)\}/)?.[1] ?? "";
    const panelRule =
      styles.match(/\.recent-filter-panel\s*\{([^}]*)\}/)?.[1] ?? "";
    const rowRule =
      styles.match(/\.recent-filter-row\s*\{([^}]*)\}/)?.[1] ?? "";
    const selectRule =
      styles.match(/\.recent-filter-row select\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(buttonRule).toContain("width: 28px;");
    expect(buttonRule).toContain("height: 28px;");
    expect(buttonRule).toContain("opacity: 0;");
    expect(buttonRule).toContain("pointer-events: none;");
    expect(styles).toMatch(
      /\.recent-heading:hover \.recent-filter-button,\s*\.recent-heading:focus-within \.recent-filter-button,\s*\.recent-filter-button\[aria-expanded='true'\]\s*\{[^}]*opacity: 1;[^}]*pointer-events: auto;/,
    );
    expect(panelRule).toContain("overflow: hidden;");
    expect(rowRule).toContain("grid-template-columns: 52px minmax(0, 1fr);");
    expect(selectRule).toContain("min-width: 0;");
    expect(selectRule).toContain("height: 28px;");
    expect(selectRule).toContain("text-overflow: ellipsis;");
  });

  it("lets requirement names use the row width until actions overlay them", () => {
    const linkRule =
      styles.match(/\.space-requirements li a\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(linkRule).toContain("padding: 0 8px;");
  });

  it("reveals requirement actions only when its row is active", () => {
    const triggerRule =
      styles.match(/\.requirement-actions-trigger\s*\{([^}]*)\}/)?.[1] ?? "";
    const revealRule =
      styles.match(
        /\.space-requirements li:hover \.requirement-actions-trigger,\s*\.space-requirements li:focus-within \.requirement-actions-trigger,\s*\.requirement-actions-trigger\[aria-expanded='true'\]\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(triggerRule).toContain("opacity: 0;");
    expect(triggerRule).toContain("pointer-events: none;");
    expect(revealRule).toContain("opacity: 1;");
    expect(revealRule).toContain("pointer-events: auto;");
    expect(styles).toMatch(
      /\.requirement-actions\s*\{[^}]*position:\s*relative;/s,
    );
    expect(styles).toMatch(
      /\.requirement-drag-handle\s*\{[^}]*position:\s*relative;/s,
    );
  });

  it("reveals drag handles on hover and marks valid drop targets", () => {
    const handleRule =
      styles.match(
        /\.space-drag-handle,\s*\.requirement-drag-handle\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const revealRule =
      styles.match(
        /\.space-row:hover \.space-drag-handle,\s*\.space-row:focus-within \.space-drag-handle,\s*\.space-requirements li:hover \.requirement-drag-handle,\s*\.space-requirements li:focus-within \.requirement-drag-handle\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const dropRule =
      styles.match(
        /\[data-drop-target='before'\]::before\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(handleRule).toContain("cursor: grab;");
    expect(handleRule).toContain("opacity: 0;");
    expect(revealRule).toContain("opacity: 1;");
    expect(dropRule).toContain("height: 2px;");
    expect(dropRule).toContain("background: var(--color-text);");
  });

  it("separates requirement creation from space management actions", () => {
    expect(uiStyles).toMatch(
      /\.ui-menu-separator\s*\{[^}]*background: var\(--color-border\);/,
    );
    expect(styles).not.toMatch(
      /\.space-item-actions-group \+ \.space-item-actions-group/,
    );
  });

  it("keeps the sidebar toggle inside the independent workspace header", () => {
    const headerRule =
      styles.match(/\.app-content-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const edgeButtonRule =
      styles.match(/\.sidebar-edge-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
    const closedHeaderRule =
      styles.match(/\.app-content-header\.sidebar-closed\s*\{([^}]*)\}/)?.[1] ??
      "";
    const closedWorkspaceToolbarRule =
      uiStyles.match(
        /\.app-content-header\.sidebar-closed \.ui-toolbar--workspace-header\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(headerRule).toContain("height: var(--workspace-header-height);");
    expect(headerRule).toContain("padding: 0 12px;");
    expect(closedHeaderRule).toContain("padding-left: 79px;");
    expect(closedWorkspaceToolbarRule).toContain("padding-left: 125px;");
    expect(edgeButtonRule).not.toContain("position: absolute;");
    expect(edgeButtonRule).toContain("position: relative;");
    expect(edgeButtonRule).toContain("z-index: 2;");
  });

  it("anchors the workbench toggle to the right edge of the main page", () => {
    const toolsRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-tools\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const iconButtonRule =
      uiStyles.match(/\.ui-icon-button\s*\{([^}]*)\}/)?.[1] ?? "";
    const openToolsRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open \.global-workbench-tools\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(toolsRule).toContain("position: absolute;");
    expect(toolsRule).toContain("top: 9px;");
    expect(toolsRule).toContain("height: var(--workspace-header-height);");
    expect(toolsRule).toContain("right: 21px;");
    expect(openToolsRule).toContain("right: 13px;");
    expect(workbenchStyles).toMatch(
      /@media \(max-width: 1100px\)\s*\{[\s\S]*?\.global-workbench-layout\.open \.global-workbench-tools\s*\{[^}]*right: 21px;[^}]*\}/,
    );
    expect(toolsRule).toContain("z-index: 40;");
    expect(toolsRule).toContain("-webkit-app-region: no-drag;");
    expect(workbenchStyles).not.toContain(".global-workbench-tools button");
    expect(iconButtonRule).toContain("width: var(--ui-control-default);");
    expect(iconButtonRule).toContain(
      "flex: 0 0 var(--ui-control-default);",
    );
  });

  it("reserves separate grid rows for the workspace header and page body", () => {
    const layoutRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-layout\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const contentRule =
      styles.match(/(?:^|\n)\.app-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const statusContentRule =
      styles.match(/\.app-content\.has-status\s*\{([^}]*)\}/)?.[1] ?? "";
    const headerRule =
      styles.match(/\.app-content-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const bodyRule =
      styles.match(/\.app-content-body\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(layoutRule).toContain("--workspace-header-height: 48px;");
    expect(contentRule).toContain(
      "grid-template-rows: var(--workspace-header-height) minmax(0, 1fr);",
    );
    expect(statusContentRule).toContain(
      "grid-template-rows: var(--workspace-header-height) auto minmax(0, 1fr);",
    );
    expect(headerRule).toContain("height: var(--workspace-header-height);");
    expect(headerRule).toContain(
      "border-bottom: 1px solid var(--tone-e5e5e5);",
    );
    expect(headerRule).toContain("background: var(--color-surface);");
    expect(bodyRule).toContain("overflow: hidden;");
  });

  it("centers routed header content without blocking toolbar controls", () => {
    const slotRule =
      styles.match(/\.app-content-header-slot\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(slotRule).toContain("position: absolute;");
    expect(slotRule).toContain("inset: 0;");
    expect(slotRule).toContain("justify-content: center;");
    expect(slotRule).toContain("pointer-events: none;");
    expect(uiStyles).toMatch(
      /\.ui-toolbar--workspace-header[\s\S]*?\.ui-tabs[^}]*pointer-events: auto;[^}]*-webkit-app-region: no-drag;/,
    );
  });

  it("does not reserve a duplicate header row inside space details", () => {
    const pageRule =
      styles.match(/\.space-detail-page\s*\{([^}]*)\}/)?.[1] ?? "";
    const issueRule =
      styles.match(
        /\.space-detail-page\.has-persistence-issue\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(pageRule).toContain("grid-template-rows: minmax(0, 1fr);");
    expect(issueRule).toContain("grid-template-rows: auto minmax(0, 1fr);");
  });

  it("styles the workbench as a rounded inset panel with a compact toolbar", () => {
    const panelRule =
      workbenchStyles.match(/(?:^|\n)\.global-workbench\s*\{([^}]*)\}/)?.[1] ??
      "";
    const headerRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-header\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const emptyPanelRule =
      workbenchStyles.match(/\.global-workbench\.empty\s*\{([^}]*)\}/)?.[1] ??
      "";
    const emptyRule =
      workbenchStyles.match(/\.global-workbench-empty\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(panelRule).toContain("margin: 8px 8px 8px 0;");
    expect(panelRule).toContain("border: 1px solid var(--tone-e1e1e1);");
    expect(panelRule).toContain("border-radius: 12px;");
    expect(panelRule).toContain("box-shadow: none;");
    expect(panelRule).toContain(
      "grid-template-rows: var(--workspace-header-height) minmax(0, 1fr);",
    );
    expect(emptyPanelRule).toContain(
      "grid-template-rows: var(--workspace-header-height) minmax(0, 1fr);",
    );
    expect(headerRule).toContain("height: var(--workspace-header-height);");
    expect(emptyRule).toContain("align-content: start;");
  });

  it("places the main and right workspaces above the sidebar background", () => {
    const shellRule =
      styles.match(/(?:^|\n)\.app-shell\s*\{([^}]*)\}/)?.[1] ?? "";
    const sidebarRule =
      styles.match(/(?:^|\n)\.sidebar\s*\{([^}]*)\}/)?.[1] ?? "";
    const contentRule =
      styles.match(/(?:^|\n)\.app-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const openContentRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open \.app-content\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const resizerRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-resizer\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const openLayoutRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const resizerIndicatorRule =
      workbenchStyles.match(
        /\.global-workbench-resizer::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const activeResizerRule =
      workbenchStyles.match(
        /\.global-workbench-resizer:hover::after,[^{]*body\.resizing-global-workbench \.global-workbench-resizer::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(shellRule).toContain("background: var(--sidebar);");
    expect(sidebarRule).not.toContain("border-right:");
    expect(contentRule).toContain("height: auto;");
    expect(contentRule).toContain("margin: 8px;");
    expect(contentRule).toContain("background: var(--color-surface);");
    expect(contentRule).toContain("border: 1px solid var(--color-border);");
    expect(contentRule).toContain("border-radius: 12px;");
    expect(openContentRule).toContain("margin-right: 0;");
    expect(openLayoutRule).toContain("4px");
    expect(resizerRule).toContain("width: 4px;");
    expect(resizerIndicatorRule).toContain("width: 1px;");
    expect(resizerIndicatorRule).toContain("var(--ink) 50%");
    expect(resizerIndicatorRule).toContain("opacity: 0;");
    expect(activeResizerRule).toContain("opacity: 1;");
  });

  it("enforces 220px, 320px, and 440px minimum workspace widths", () => {
    const sidebarRule =
      styles.match(/(?:^|\n)\.sidebar\s*\{([^}]*)\}/)?.[1] ?? "";
    const contentRule =
      styles.match(/(?:^|\n)\.app-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const openLayoutRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const panelRule =
      workbenchStyles.match(/(?:^|\n)\.global-workbench\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(sidebarRule).toContain("min-width: 220px;");
    expect(contentRule).toContain("min-width: 320px;");
    expect(openLayoutRule).toContain("minmax(548px, 1fr)");
    expect(openLayoutRule).toContain(
      "minmax(448px, var(--global-workbench-width))",
    );
    expect(panelRule).toContain("min-width: 440px;");
  });

  it("adapts every center workspace page at the 320px minimum width", () => {
    const contentRule =
      styles.match(/(?:^|\n)\.app-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const narrowQueryStart = styles.indexOf(
      "@container main-workspace (max-width: 520px)",
    );
    const narrowStyles =
      narrowQueryStart >= 0 ? styles.slice(narrowQueryStart) : "";

    expect(contentRule).toContain("container-name: main-workspace;");
    expect(contentRule).toContain("container-type: inline-size;");
    expect(narrowStyles).toMatch(
      /\.page-heading\s*\{[^}]*flex-direction: column;/,
    );
    expect(narrowStyles).toMatch(
      /\.chat-session-page\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(narrowStyles).toMatch(
      /\.composer-actions\s*\{[^}]*flex-wrap: wrap;/,
    );
    expect(narrowStyles).toMatch(
      /\.template-grid\s*\{[^}]*grid-template-columns: 1fr;/,
    );
    expect(narrowStyles).toMatch(
      /\.schedule-recommendation-grid\s*\{[^}]*grid-template-columns: 1fr;/,
    );
    expect(narrowStyles).toMatch(
      /\.space-statistics-grid\s*\{[^}]*grid-template-columns: 1fr;/,
    );
    expect(narrowStyles).toMatch(
      /\.space-resource-header\s*\{[^}]*flex-direction: column;/,
    );
    expect(narrowStyles).toMatch(
      /\.requirement-overview\s*\{[^}]*grid-template-columns: 1fr;/,
    );
    expect(narrowStyles).toMatch(
      /\.development-flow-track\s*\{[^}]*overflow-x: auto;/,
    );
  });

  it("keeps workflow edge controls readable at narrow desktop widths", () => {
    const mediumQueryStart = styles.indexOf(
      "@container main-workspace (max-width: 760px)",
    );
    const narrowQueryStart = styles.indexOf(
      "@container main-workspace (max-width: 520px)",
      mediumQueryStart,
    );
    const mediumStyles =
      mediumQueryStart >= 0
        ? styles.slice(
            mediumQueryStart,
            narrowQueryStart >= 0 ? narrowQueryStart : undefined,
          )
        : "";

    expect(mediumStyles).toMatch(
      /\.workflow-edge-editor\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(mediumStyles).toMatch(
      /\.workflow-edge-editor \.workflow-node-editor-actions\s*\{[^}]*grid-column: 1 \/ -1;/,
    );
  });

  it("uses matching theme-colored fade handles for both workspace resizers", () => {
    const sidebarResizerRule =
      styles.match(/\.sidebar-resizer\s*\{([^}]*)\}/)?.[1] ?? "";
    const shellIndicatorRule =
      styles.match(/\.app-shell::before\s*\{([^}]*)\}/)?.[1] ?? "";
    const shellActiveRule =
      styles.match(
        /\.app-shell:has\(\.sidebar-resizer:hover\)::before,[\s\S]*?\.app-shell\.resizing::before\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const workbenchIndicatorRule =
      workbenchStyles.match(
        /\.global-workbench-resizer::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(sidebarResizerRule).toContain(
      "left: calc(var(--sidebar-width) + 5px);",
    );
    expect(sidebarResizerRule).toContain("width: 6px;");
    expect(shellIndicatorRule).toContain(
      "left: calc(var(--sidebar-width) + 8px);",
    );

    for (const rule of [shellIndicatorRule, workbenchIndicatorRule]) {
      expect(rule).toContain("width: 1px;");
      expect(rule).toContain(
        "linear-gradient(to bottom, transparent 0%, var(--ink) 50%, transparent 100%)",
      );
      expect(rule).toContain("opacity: 0;");
    }
    expect(shellActiveRule).toContain("opacity: 1;");
  });

  it("uses the sidebar color behind every workspace edge", () => {
    const rootRule = styles.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
    const viewportRule =
      styles.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/)?.[1] ?? "";
    const layoutRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-layout\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const pageRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-page\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(rootRule).toContain("background: var(--color-canvas);");
    expect(viewportRule).toContain("background: var(--sidebar);");
    expect(layoutRule).toContain("background: var(--sidebar);");
    expect(pageRule).toContain("background: var(--sidebar);");
    expect(electronMainSource).toContain("backgroundColor: '#f1f1f1'");
  });

  it("hides page-edge toggles and clears macOS controls when maximized", () => {
    const maximizedPanelRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open\.maximized \.global-workbench\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const maximizedEdgeControlsRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.maximized \.sidebar-edge-toggle,\s*\.global-workbench-layout\.maximized \.global-workbench-tools\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const maximizedHeaderRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.maximized \.global-workbench-header\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const maximizedActionsRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.maximized \.global-workbench-header-actions\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const headerRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-header\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(maximizedPanelRule).toContain("position: absolute;");
    expect(maximizedPanelRule).toContain("inset: 0;");
    expect(maximizedEdgeControlsRule).toContain("display: none;");
    expect(maximizedHeaderRule).toContain("padding-left: 76px;");
    expect(headerRule).toContain("-webkit-app-region: no-drag;");
    expect(maximizedActionsRule).toContain("margin-right: 0;");
  });

  it("keeps the add button fixed beside horizontally scrolling tabs", () => {
    const headerRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-header\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const tabBarRule =
      workbenchStyles.match(/\.global-workbench-tabbar\s*\{([^}]*)\}/)?.[1] ??
      "";
    const tabsRule =
      uiStyles.match(/\.ui-document-tabs__list\s*\{([^}]*)\}/)?.[1] ?? "";
    const toolbarRule =
      uiStyles.match(/\.ui-document-tabs__toolbar\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(headerRule).toContain("min-width: 0;");
    expect(tabBarRule).toContain("flex: 1 1 0;");
    expect(tabsRule).toContain("overflow-x: auto;");
    expect(tabsRule).toContain("flex: 1 1 auto;");
    expect(toolbarRule).toContain("flex: 0 0 auto;");
    expect(workbenchStyles).not.toContain(".global-workbench-tabs");
    expect(workbenchStyles).not.toContain(".global-workbench-add");
  });

  it("removes main-window minimum dimensions from native overlays", () => {
    expect(nativeWorkbenchMenuStyles).toMatch(
      /html\.native-overlay-root,\s*body\.native-overlay-body,\s*body\.native-overlay-body #root\s*\{[^}]*min-width: 0;[^}]*min-height: 0;[^}]*\}/,
    );
  });

  it("places the active secondary tab indicator on the bottom edge", () => {
    const activeTabRule =
      artifactWorkbenchStyles.match(
        /\.artifact-tabs \.ui-document-tab\[data-active\]\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(activeTabRule).toContain(
      "box-shadow: inset 0 -2px var(--tone-383838);",
    );
  });

  it("keeps the portal-headed workflow canvas in one full-height grid row", () => {
    expect(styles).toMatch(
      /\.workflow-canvas-page\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\);/s,
    );
  });

  it("keeps routed page content in the visible grid column", () => {
    const contentRule = styles.match(/\.app-content\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(contentRule).toContain("grid-column: 2;");
    expect(contentRule).toContain("min-width: 320px;");
    expect(contentRule).toContain("overflow: hidden;");
  });

  it("constrains the new chat page so its content scrolls vertically", () => {
    const pageRule = styles.match(/\.new-chat-page\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(pageRule).toContain("height: 100%;");
    expect(pageRule).toContain("min-height: 0;");
    expect(pageRule).toContain("overflow-y: auto;");
  });

  it("keeps requirement details as a single page under the global workbench", () => {
    const pageRule =
      styles.match(/\.requirement-detail-page\s*\{([^}]*)\}/)?.[1] ?? "";
    const contentRule =
      styles.match(/\.requirement-detail-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const workbenchRule =
      styles.match(/\.requirement-execution-workbench\s*\{([^}]*)\}/)?.[1] ??
      "";
    const dagCanvasRule =
      styles.match(/\.requirement-dag-canvas\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(pageRule).toContain("height: 100%;");
    expect(pageRule).not.toContain("grid-template-columns:");
    expect(contentRule).toContain("overflow: hidden;");
    expect(contentRule).toContain("padding: 0;");
    expect(workbenchRule).toContain("width: 100%;");
    expect(workbenchRule).toContain("gap: 0;");
    expect(dagCanvasRule).toContain("overflow-x: auto;");
    expect(dagCanvasRule).toContain("overflow-y: hidden;");
  });

  it("keeps a compact DAG and pins the node composer inside the visible workbench", () => {
    const contentRule =
      styles.match(/\.requirement-detail-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const executionWorkbenchRule =
      styles.match(/\.requirement-execution-workbench\s*\{([^}]*)\}/)?.[1] ??
      "";
    const dagCanvasRule =
      styles.match(/\.requirement-dag-canvas\s*\{([^}]*)\}/)?.[1] ?? "";
    const dagNodeRule =
      styles.match(
        /\.requirement-dag-canvas \.react-flow__node\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const nodeCardRule =
      styles.match(/\.requirement-dag-node\s*\{([^}]*)\}/)?.[1] ?? "";
    const nodeCopyRule =
      styles.match(/\.requirement-dag-node-copy\s*\{([^}]*)\}/)?.[1] ?? "";
    const nodeTitleRule =
      styles.match(/\.requirement-dag-node-copy strong\s*\{([^}]*)\}/)?.[1] ??
      "";
    const nodeStatusRule =
      styles.match(/\.requirement-dag-node-status\s*\{([^}]*)\}/)?.[1] ?? "";
    const completedStatusRule =
      styles.match(
        /\.requirement-dag-node\[data-status='completed'\] \.requirement-dag-node-status\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const nodeWorkbenchRule =
      styles.match(/\.requirement-node-workbench\s*\{([^}]*)\}/)?.[1] ?? "";
    const workbenchGridRule =
      styles.match(/\.requirement-node-workbench__grid\s*\{([^}]*)\}/)?.[1] ??
      "";
    const conversationPanelRule =
      styles.match(
        /\.requirement-node-workbench__conversation\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const conversationRule =
      styles.match(
        /\.requirement-node-workbench \.requirement-node-conversation\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(contentRule).toContain("height: 100%;");
    expect(contentRule).toContain("overflow: hidden;");
    expect(executionWorkbenchRule).toContain("height: 100%;");
    expect(executionWorkbenchRule).toContain(
      "grid-template-rows: minmax(var(--requirement-dag-height, 180px), max-content) 6px minmax(0, 1fr);",
    );
    expect(dagCanvasRule).toContain("height: 180px;");
    expect(dagCanvasRule).toContain(
      "min-height: var(--requirement-dag-height, 180px);",
    );
    expect(styles).toMatch(
      /\.requirement-dag-node\[data-responding='true'\]\s+\.requirement-dag-node-status\s+svg\s*\{[^}]*animation: requirement-dag-spin/,
    );
    expect(styles).not.toMatch(
      /\.requirement-dag-node\[data-status='running'\]\s+\.requirement-dag-node-status\s+svg\s*\{[^}]*animation: requirement-dag-spin/,
    );
    expect(dagNodeRule).toContain("width: 168px;");
    expect(dagNodeRule).toContain("height: 46px;");
    expect(nodeCardRule).toContain(
      "grid-template-columns: 16px minmax(0, 1fr) 20px;",
    );
    expect(nodeCardRule).toContain("padding: 6px 10px 6px 12px;");
    expect(nodeCardRule).toContain("border-radius: 8px;");
    expect(nodeCopyRule).toContain("gap: 0;");
    expect(nodeTitleRule).toContain("font-size: 12px;");
    expect(nodeTitleRule).toContain("font-weight: 500;");
    expect(nodeStatusRule).toContain("grid-row: 1 / 3;");
    expect(completedStatusRule).toContain("background: var(--color-success);");
    expect(completedStatusRule).toContain("color: var(--color-on-success);");
    expect(nodeWorkbenchRule).toContain("min-height: 0;");
    expect(workbenchGridRule).toContain("height: 100%;");
    expect(conversationPanelRule).toContain("padding: 0;");
    expect(conversationRule).toContain("height: 100%;");
    expect(conversationRule).toContain("min-height: 0;");
    expect(conversationRule).toContain(
      "grid-template-rows: minmax(0, 1fr) auto;",
    );
  });

  it("uses the shared row-resizer interaction for the DAG boundary", () => {
    const resizerRule =
      styles.match(
        /\.requirement-execution-workbench__dag-resizer\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const indicatorRule =
      styles.match(
        /\.requirement-execution-workbench__dag-resizer::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(resizerRule).toContain("cursor: row-resize;");
    expect(resizerRule).toContain("touch-action: none;");
    expect(resizerRule).toContain("border: 0;");
    expect(indicatorRule).toContain("top: -1px;");
    expect(indicatorRule).toContain("height: 1px;");
    expect(indicatorRule).toContain("var(--ink)");
    expect(indicatorRule).toContain("opacity: 0;");
    expect(styles).toMatch(
      /\.requirement-execution-workbench__dag-resizer:hover::after,\s*\.requirement-execution-workbench__dag-resizer:focus-visible::after,\s*\.requirement-execution-workbench__dag-resizer:active::after\s*\{[^}]*opacity: 1;/,
    );
  });

  it("keeps node conversations on the shared message typography", () => {
    const nodeMessagesRule =
      styles.match(
        /\.requirement-node-workbench \.requirement-node-messages\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(nodeMessagesRule).toContain("overflow: hidden;");
    expect(styles).not.toContain(
      ".requirement-node-workbench .requirement-node-messages .chat-session-messages",
    );
    expect(styles).not.toContain(
      ".requirement-node-workbench .chat-message > p",
    );
    expect(styles).not.toContain(
      ".requirement-node-workbench .chat-message.assistant",
    );
    expect(styles).not.toContain(
      ".requirement-node-workbench .chat-message-markdown",
    );
  });

  it("lays out the requirement workbench for desktop and 920px windows", () => {
    const workbenchRule =
      styles.match(/\.requirement-node-workbench\s*\{([^}]*)\}/)?.[1] ?? "";
    const dagCanvasRule =
      styles.match(/\.requirement-dag-canvas\s*\{([^}]*)\}/)?.[1] ?? "";
    const gridRule =
      styles.match(/\.requirement-node-workbench__grid\s*\{([^}]*)\}/)?.[1] ??
      "";
    const actionCommandRule =
      styles.match(
        /\.requirement-node-workbench__actions \.requirement-node-workbench__command-bar\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const conversationRule =
      styles.match(
        /\.requirement-node-workbench__conversation\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const actionsRule =
      styles.match(
        /\.requirement-node-workbench__actions\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const artifactsRule =
      styles.match(
        /\.requirement-node-workbench__artifacts\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const todosRule =
      styles.match(/\.requirement-node-workbench__todos\s*\{([^}]*)\}/)?.[1] ??
      "";
    const columnResizerRule =
      styles.match(
        /\.requirement-node-workbench__column-resizer\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const desktopStart = styles.indexOf(
      "@container main-workspace (min-width: 1280px)",
    );
    const desktopStyles = desktopStart >= 0 ? styles.slice(desktopStart) : "";
    const compactStart = styles.indexOf(
      "@container main-workspace (min-width: 900px) and (max-width: 1279px)",
    );
    const compactStyles = compactStart >= 0 ? styles.slice(compactStart) : "";

    expect(workbenchRule).toContain("border-radius: 0;");
    expect(dagCanvasRule).toContain("border-radius: 0;");
    expect(dagCanvasRule).toContain("border: 0;");
    expect(dagCanvasRule).toContain(
      "border-bottom: 1px solid var(--color-border);",
    );
    expect(workbenchRule).toContain("border: 0;");
    expect(gridRule).toContain(
      "grid-template-columns: minmax(0, var(--requirement-workbench-left, 56%)) 6px minmax(280px, 1fr);",
    );
    expect(conversationRule).toContain(
      "border-right: 1px solid var(--color-border);",
    );
    expect(actionsRule).toContain(
      "border-bottom: 1px solid var(--color-border);",
    );
    expect(artifactsRule).toContain(
      "border-bottom: 1px solid var(--color-border);",
    );
    expect(todosRule).toContain("border: 0;");
    expect(columnResizerRule).toContain("cursor: col-resize;");
    expect(columnResizerRule).toContain("border: 0;");
    expect(styles).toMatch(
      /\.requirement-node-workbench__row-resizer\s*\{[^}]*cursor: row-resize;[^}]*border: 0;/,
    );
    expect(actionCommandRule).toContain("flex-direction: column;");
    expect(actionCommandRule).toContain("align-items: stretch;");
    expect(desktopStyles).toMatch(
      /\.requirement-node-workbench__grid\s*\{[^}]*grid-template-columns: minmax\(0, var\(--requirement-workbench-left, 56%\)\) 6px minmax\(320px, 1fr\);/,
    );
    expect(styles).toMatch(
      /@container main-workspace \(min-width: 900px\) and \(max-width: 1279px\)\s*\{[\s\S]*?\.requirement-node-workbench__grid\s*\{[^}]*grid-template-columns: minmax\(0, var\(--requirement-workbench-left, 56%\)\) 6px minmax\(280px, 1fr\);/,
    );
  });

  it("keeps the split layout at 920px and stacks only at phone widths", () => {
    expect(styles).toMatch(
      /@container main-workspace \(max-width: 519px\)\s*\{[\s\S]*?\.requirement-node-workbench__grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
    );
    const tabletStyles = styles.slice(
      styles.indexOf("@container main-workspace (max-width: 899px)"),
      styles.indexOf("@container main-workspace (max-width: 519px)"),
    );
    expect(tabletStyles).not.toContain(
      "grid-template-columns: minmax(0, 1fr);",
    );
    expect(styles).not.toMatch(
      /@container main-workspace \(max-width: 519px\)\s*\{[\s\S]*?\.requirement-detail-content\s*\{[^}]*padding-inline:/,
    );
  });

  it("uses the shared compact typography and controls in requirement details", () => {
    const workbenchRule =
      styles.match(/\.requirement-node-workbench\s*\{([^}]*)\}/)?.[1] ?? "";
    const nodeControlRule =
      styles.match(
        /\.requirement-node-workbench \.workflow-node-control\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const primaryControlRule =
      styles.match(
        /\.requirement-node-workbench \.workflow-node-control\.is-primary\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const secondaryControlRule =
      styles.match(
        /\.requirement-node-workbench \.workflow-node-control\.is-secondary\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const previewControlRule =
      styles.match(
        /\.requirement-node-workbench \.execution-resource-heading button\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const modelTriggerRule =
      styles.match(
        /\.requirement-node-workbench \.model-selector-trigger\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const nodeComposerTextareaRule =
      styles.match(
        /\.requirement-node-workbench \.requirement-node-conversation-compose textarea\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(workbenchRule).toContain("font-size: 12px;");
    expect(workbenchRule).toContain("line-height: 1.45;");
    expect(styles).not.toContain(".requirement-node-workbench__identity");
    expect(styles).not.toContain(".requirement-node-conversation-heading");
    expect(styles).not.toContain(".node-artifact-panel__header");
    expect(styles).not.toContain(".node-todo-panel-summary");
    expect(nodeControlRule).toContain("min-height: 30px;");
    expect(nodeControlRule).toContain("font-size: 11px;");
    expect(nodeControlRule).toContain("border-radius: 5px;");
    expect(primaryControlRule).toContain("background: var(--tone-242628);");
    expect(secondaryControlRule).toContain(
      "border: 1px solid var(--color-border);",
    );
    expect(previewControlRule).toContain("min-height: 30px;");
    expect(previewControlRule).toContain("background: var(--color-surface);");
    expect(modelTriggerRule).toContain("height: 30px;");
    expect(nodeComposerTextareaRule).toMatch(/(?:^|\n)\s*height: 48px;/);
  });

  it("reveals the red todo delete action only on row hover or focus", () => {
    const deleteRule =
      styles.match(/\.node-todo__delete\s*\{([^}]*)\}/)?.[1] ?? "";
    const revealRule =
      styles.match(
        /\.node-todo:hover \.node-todo__delete,\s*\.node-todo:focus-within \.node-todo__delete,\s*\.node-todo__delete:focus-visible\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const completedRule =
      styles.match(/\.node-todo__title--completed\s*\{([^}]*)\}/)?.[1] ?? "";
    const pendingDangerRule =
      uiStyles.match(/\.ui-button--danger\s*\{([^}]*)\}/)?.[1] ?? "";
    const disabledRule =
      uiStyles.match(/\.ui-button:disabled\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(deleteRule).toContain("color: var(--tone-d84e43);");
    expect(deleteRule).toContain("opacity: 0;");
    expect(deleteRule).toContain("pointer-events: none;");
    expect(revealRule).toContain("opacity: 1;");
    expect(revealRule).toContain("pointer-events: auto;");
    expect(completedRule).toContain("text-decoration: line-through;");
    expect(pendingDangerRule).toContain("background: var(--color-error);");
    expect(disabledRule).toContain("opacity: 0.48;");
  });

  it("reveals matching black indicators when node workbench resizers are interactive", () => {
    const indicatorRule =
      styles.match(
        /\.requirement-node-workbench__column-resizer::after,\s*\.requirement-node-workbench__row-resizer::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const columnIndicatorRule =
      styles.match(
        /\.requirement-node-workbench__column-resizer::after\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const rowIndicatorRule =
      Array.from(
        styles.matchAll(
          /\.requirement-node-workbench__row-resizer::after\s*\{([^}]*)\}/g,
        ),
      ).at(-1)?.[1] ?? "";

    expect(columnIndicatorRule).toContain("top: 8px;");
    expect(columnIndicatorRule).toContain("bottom: 8px;");
    expect(columnIndicatorRule).toContain("left: -1px;");
    expect(columnIndicatorRule).toContain("width: 1px;");
    expect(columnIndicatorRule).toContain("var(--ink)");
    expect(rowIndicatorRule).toContain("right: 8px;");
    expect(rowIndicatorRule).toContain("left: 8px;");
    expect(rowIndicatorRule).toContain("top: -1px;");
    expect(rowIndicatorRule).toContain("height: 1px;");
    expect(rowIndicatorRule).toContain("var(--ink)");
    expect(indicatorRule).toContain("opacity: 0;");
    expect(indicatorRule).toContain("transition: opacity 120ms ease;");
    expect(styles).toMatch(
      /\.requirement-node-workbench__column-resizer:hover::after,[\s\S]*?\.requirement-node-workbench__column-resizer:focus-visible::after,[\s\S]*?\.requirement-node-workbench__column-resizer:active::after,[\s\S]*?\.requirement-node-workbench__row-resizer:hover::after,[\s\S]*?\.requirement-node-workbench__row-resizer:focus-visible::after,[\s\S]*?\.requirement-node-workbench__row-resizer:active::after\s*\{[^}]*opacity: 1;/,
    );
  });

  it("separates task drag handles from selection checkboxes", () => {
    const checkboxRule =
      styles.match(
      /\.workbench-task-table \.workbench-task-select-control\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const dragRule =
      styles.match(/\.workbench-task-record-drag\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(checkboxRule).toContain("left: 50%;");
    expect(checkboxRule).toContain("transform: translate(-50%, -50%);");
    expect(checkboxRule).toContain("opacity: 0;");
    expect(checkboxRule).not.toContain("right:");
    expect(dragRule).toContain("left: 50%;");
    expect(dragRule).toContain("top: 50%;");
    expect(dragRule).toContain("transform: translate(-50%, -50%);");
    expect(dragRule).toContain("width: 14px;");
  });

  it("reveals shared menu deletion in red only on direct hover", () => {
    const idleDangerRule =
      styles.match(
        /\.workbench-navigation-item-actions\s*>\s*button\.danger\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const hoverDangerRule =
      styles.match(
        /\.workbench-navigation-item-actions\s*>\s*button\.danger:hover\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    const terminalItemRule =
      styles.match(/\.terminal-session-item\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(idleDangerRule).toBe("");
    expect(hoverDangerRule).toContain("color: var(--color-error);");
    expect(styles).not.toMatch(
      /\.workbench-site-group-row\s+\.workbench-navigation-item-actions\s+>\s+button\.danger\s*\{/,
    );
    expect(terminalItemRule).toContain(
      "grid-template-columns: minmax(0, 1fr);",
    );
    expect(styles).not.toContain(
      ".terminal-session-item:hover .workbench-navigation-item-primary",
    );
  });

  it("keeps delegated task summaries within the conversation timeline", () => {
    const listRule =
      styles.match(/\.assistant-delegation-task-list\s*\{([^}]*)\}/)?.[1] ?? "";
    const itemRule =
      styles.match(/\.assistant-delegation-task-list li\s*\{([^}]*)\}/)?.[1] ??
      "";
    const headingRule =
      styles.match(/\.assistant-delegation-task-heading\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(listRule).toContain("min-width: 0;");
    expect(listRule).toContain("list-style: none;");
    expect(itemRule).toContain("overflow-wrap: anywhere;");
    expect(headingRule).toContain(
      "grid-template-columns: minmax(0, 1fr) auto;",
    );
  });

  it("lays out generated artifacts as one full-width card or a two-column grid", () => {
    const collectionRule =
      styles.match(/\.chat-generated-artifacts\s*\{([^}]*)\}/)?.[1] ?? "";
    const singletonRule =
      styles.match(
        /\.chat-generated-artifact-card:only-child\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(collectionRule).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(collectionRule).toContain("max-width: min(820px, 100%);");
    expect(singletonRule).toContain("grid-column: 1 / -1;");
  });

  it("lays out follow-up suggestions as compact content-width rows", () => {
    const groupRule =
      styles.match(/\.follow-up-suggestions\s*\{([^}]*)\}/)?.[1] ?? "";
    const listRule =
      styles.match(/\.follow-up-suggestions__list\s*\{([^}]*)\}/)?.[1] ?? "";
    const suggestionRule =
      styles.match(/\.follow-up-suggestion\s*\{([^}]*)\}/)?.[1] ?? "";
    const textRule =
      styles.match(/\.follow-up-suggestion__text\s*\{([^}]*)\}/)?.[1] ?? "";
    const actionRule =
      styles.match(
        /\.follow-up-suggestion__action\.ui-icon-button\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(groupRule).toContain("align-items: flex-start;");
    expect(listRule).toContain("display: flex;");
    expect(listRule).toContain("flex-direction: column;");
    expect(listRule).toContain("align-items: flex-start;");
    expect(listRule).toContain("gap: 8px;");
    expect(suggestionRule).toContain("width: fit-content;");
    expect(suggestionRule).toContain("max-width: 100%;");
    expect(suggestionRule).toContain(
      "grid-template-columns: minmax(0, auto) 32px 32px;",
    );
    expect(suggestionRule).toContain("background: var(--tone-f4f4f4);");
    expect(textRule).toContain("color: var(--tone-424242);");
    expect(textRule).toContain("font-weight: 400;");
    expect(textRule).toContain("overflow-wrap: anywhere;");
    expect(actionRule).toContain("width: 32px;");
    expect(actionRule).toContain("height: 32px;");
  });

  it("removes DAG transitions and animations for reduced motion", () => {
    const reducedMotionStart = styles.lastIndexOf(
      "@media (prefers-reduced-motion: reduce)",
    );
    const reducedMotionStyles =
      reducedMotionStart >= 0
        ? styles.slice(
            reducedMotionStart,
            styles.indexOf(".requirement-node-workbench", reducedMotionStart),
          )
        : "";

    expect(reducedMotionStyles).toContain("transition: none;");
    expect(reducedMotionStyles).toContain("animation: none;");
    expect(reducedMotionStyles).toContain("scroll-behavior: auto;");
  });

  it("reveals the skip link and offsets anchored headings below the workspace header", () => {
    const skipLinkRule =
      styles.match(/\.skip-link\s*\{([^}]*)\}/)?.[1] ?? "";
    const focusedSkipLinkRule =
      styles.match(/\.skip-link:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
    const anchoredHeadingRule =
      styles.match(
        /:where\(h1, h2, h3, h4, h5, h6\)\[id\]\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(skipLinkRule).toContain("position: fixed;");
    expect(skipLinkRule).toContain("z-index: var(--ui-layer-tooltip);");
    expect(focusedSkipLinkRule).toContain("transform: translateY(0);");
    expect(anchoredHeadingRule).toContain("scroll-margin-top: 60px;");
    expect(styles).toMatch(
      /\.app-route-page__body:focus\s*\{[^}]*outline: 2px solid transparent;[^}]*outline-offset: -2px;/s,
    );
  });

  it("localizes the skip-to-main-content command in every supported locale", () => {
    for (const path of [
      "src/localization/messages/zh-CN.ts",
      "src/localization/messages/en.ts",
      "src/localization/messages/ja.ts",
    ]) {
      expect(
        readFileSync(resolve(process.cwd(), path), "utf8"),
        path,
      ).toContain('"layout.skipToMainContent"');
    }
  });
});
