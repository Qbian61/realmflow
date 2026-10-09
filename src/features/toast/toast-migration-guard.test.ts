import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

const sourceRoot = resolve("src");
const productionFiles = collectSourceFiles(sourceRoot).filter(
  (file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
);

const inlineAlertAllowlist = new Set([
  "components/ui/Field.tsx",
  "features/artifacts/ArtifactImagePreview.tsx",
  "features/capabilities/CapabilityBuilderDialog.tsx",
  "features/conversation/ConversationMessageList.tsx",
  "features/conversation/ConversationShareController.tsx",
  "features/navigation/RequirementCreateDialog.tsx",
  "features/permissions/ToolPermissionDialog.tsx",
  "features/resources/KnowledgeIndexJobDialog.tsx",
  "features/resources/RepositorySnapshotDialog.tsx",
  "features/resources/RepositorySourceDialog.tsx",
  "features/resources/ResourceDialog.tsx",
  "features/workbench-hub/memos/MemoEditorSurface.tsx",
  "features/workbench-hub/memos/MemoWorkbenchPage.tsx",
  "features/workbench-hub/sites/SiteWorkbenchPage.tsx",
  "features/workbench-hub/system/SystemStatusPage.tsx",
  "features/workbench-hub/tasks/TaskAttachmentField.tsx",
  "features/workbench-hub/terminal/TerminalWorkbenchPage.tsx",
  "features/workflow/canvas/WorkflowTemplateCanvasView.tsx",
  "features/workflow/RequirementExecutionSnapshot.tsx",
  "features/workflow/TemplateMigrationDialog.tsx",
  "features/workflow/WorkflowTemplateNodeConfiguration.tsx",
  "pages/RequirementDetailPage.tsx",
  "pages/UpdatesPage.tsx",
]);

describe("toast migration boundaries", () => {
  it("allows inline alerts only in validation or persistent-state modules", () => {
    const modules = productionFiles
      .filter((file) =>
        /role\s*=\s*["']alert["']/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(sourceRoot, file))
      .sort();

    expect(modules).toEqual([...inlineAlertAllowlist].sort());
  });

  it("never passes raw exception details to Toast publishers", () => {
    const violations = productionFiles.flatMap(rawToastViolations);

    expect(violations).toEqual([]);
  });
});

function rawToastViolations(file: string): string[] {
  const sourceText = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "toast" &&
      /^(success|info|warning|error|system|publish)$/.test(
        node.expression.name.text,
      )
    ) {
      const callText = node.getText(sourceFile);
      if (
        /\.(?:message|stack)\b/.test(callText) ||
        /\bString\s*\(\s*(?:error|reason|cause)\b/.test(callText)
      ) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        violations.push(`${relative(sourceRoot, file)}:${line}`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory)
    .map((entry) => resolve(directory, entry))
    .flatMap((entry) =>
      statSync(entry).isDirectory() ? collectSourceFiles(entry) : entry,
    )
    .filter((file) => /\.(ts|tsx)$/.test(file));
}
