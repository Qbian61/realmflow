import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const sourceRoot = resolve(process.cwd(), "src");
const productionFiles = readdirSync(sourceRoot, { recursive: true })
  .map(String)
  .filter(
    (path) =>
      /\.(?:ts|tsx)$/.test(path) &&
      !path.endsWith(".test.ts") &&
      !path.endsWith(".test.tsx"),
  );

describe("localized copy and format architecture", () => {
  it("uses the Unicode ellipsis in localized and production copy", () => {
    const violations = productionFiles.flatMap((path) => {
      const source = readFileSync(resolve(sourceRoot, path), "utf8");
      const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const results: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          (ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node)) &&
          node.text.includes("...")
        ) {
          const line =
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          results.push(`${path}:${line} ${JSON.stringify(node.text)}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      return results;
    });

    expect(violations).toEqual([]);
  });

  it("binds every production toLocaleString call to an explicit locale", () => {
    const violations = productionFiles.flatMap((path) => {
      const sourceFile = ts.createSourceFile(
        path,
        readFileSync(resolve(sourceRoot, path), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const results: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          node.arguments.length === 0 &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "toLocaleString"
        ) {
          const line =
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          results.push(`${path}:${line}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      return results;
    });

    expect(violations).toEqual([]);
  });

  it("does not manually assemble user-visible calendar dates", () => {
    const forbidden = [
      "features/conversation/ConversationMessageFooter.tsx",
      "features/workflow/RequirementDagNodeTooltip.tsx",
      "features/workflow/NodeTodoTooltip.tsx",
    ].filter((path) => {
      const source = readFileSync(resolve(sourceRoot, path), "utf8");
      return (
        source.includes("messageDate.getFullYear()") ||
        source.includes("`${date.getFullYear()}-")
      );
    });

    expect(forbidden).toEqual([]);
  });

  it("limits ISO calendar slicing to machine-readable values", () => {
    const consumers = productionFiles
      .filter((path) =>
        readFileSync(resolve(sourceRoot, path), "utf8").includes(
          ".toISOString().slice(0, 10)",
        ),
      )
      .sort();

    expect(consumers).toEqual(
      [
        "features/conversation/ConversationShareController.tsx",
        "features/workbench-hub/tasks/TaskRecordDrawer.tsx",
        "features/workbench-hub/tasks/TaskTableGrid.tsx",
        "features/workbench-hub/tasks/TaskViewPopover.tsx",
      ].sort(),
    );
  });

  it("keeps numeric table cells on tabular figures", () => {
    const styles = readFileSync(
      resolve(sourceRoot, "components/ui/ui.css"),
      "utf8",
    );
    expect(styles).toMatch(
      /\.ui-data-table__numeric\s*\{[^}]*font-variant-numeric: tabular-nums;/s,
    );
  });
});
