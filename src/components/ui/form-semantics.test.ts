import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

type AttributeMap = Map<string, ts.JsxAttribute>;

const editableTags = new Set(["input", "select", "textarea"]);

function attributesOf(
  element: ts.JsxOpeningLikeElement,
): AttributeMap {
  return new Map(
    element.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => [attribute.name.getText(), attribute]),
  );
}

function attributeValue(
  attributes: AttributeMap,
  name: string,
): string | undefined {
  return attributes.get(name)?.initializer?.getText();
}

function ancestorElement(
  node: ts.Node,
  name: string,
): ts.JsxOpeningLikeElement | undefined {
  let current = node.parent;
  while (current) {
    if (
      (ts.isJsxElement(current) &&
        current.openingElement.tagName.getText() === name) ||
      (ts.isJsxSelfClosingElement(current) &&
        current.tagName.getText() === name)
    ) {
      return ts.isJsxElement(current)
        ? current.openingElement
        : current;
    }
    current = current.parent;
  }
  return undefined;
}

function productionTsxFiles(): string[] {
  const root = resolve(process.cwd(), "src");
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        entry.name.endsWith(".tsx") &&
        !entry.name.endsWith(".test.tsx")
      ) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files;
}

describe("form semantics architecture", () => {
  it("requires stable semantics for every production native form control", () => {
    const violations: string[] = [];

    for (const file of productionTsxFiles()) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const labelTargets = new Set<string>();

      const collectLabels = (node: ts.Node): void => {
        if (
          ts.isJsxOpeningElement(node) &&
          node.tagName.getText(source) === "label"
        ) {
          const target = attributeValue(attributesOf(node), "htmlFor");
          if (target) labelTargets.add(target);
        }
        ts.forEachChild(node, collectLabels);
      };
      collectLabels(source);

      const inspect = (node: ts.Node): void => {
        if (
          (ts.isJsxOpeningElement(node) ||
            ts.isJsxSelfClosingElement(node)) &&
          editableTags.has(node.tagName.getText(source))
        ) {
          const attributes = attributesOf(node);
          const type = attributeValue(attributes, "type") ?? "";
          const readOnly = attributes.has("readOnly");
          const fileInput = /["']file["']/.test(type);
          const field = ancestorElement(node, "Field");
          const fieldAttributes = field ? attributesOf(field) : undefined;
          const nativeLabel = ancestorElement(node, "label");
          const id = attributeValue(attributes, "id");
          const hasExternalLabel = Boolean(id && labelTargets.has(id));
          const location = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          );
          const prefix = `${relative(process.cwd(), file)}:${location.line + 1}`;

          if (!readOnly) {
            if (!(attributes.has("name") || fieldAttributes?.has("name"))) {
              violations.push(`${prefix} missing name`);
            }
            if (
              !fileInput &&
              !(
                attributes.has("autoComplete") ||
                fieldAttributes?.has("autoComplete") ||
                field
              )
            ) {
              violations.push(`${prefix} missing autoComplete`);
            }
          }

          if (
            !field &&
            !nativeLabel &&
            !hasExternalLabel &&
            !attributes.has("aria-label") &&
            !attributes.has("aria-labelledby")
          ) {
            violations.push(`${prefix} missing accessible name`);
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(source);
    }

    expect(violations).toEqual([]);
  });

  it("uses semantic input types, modes and spellcheck policies", () => {
    const violations: string[] = [];

    for (const file of productionTsxFiles()) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const inspect = (node: ts.Node): void => {
        if (
          (ts.isJsxOpeningElement(node) ||
            ts.isJsxSelfClosingElement(node)) &&
          node.tagName.getText(source) === "input"
        ) {
          const attributes = attributesOf(node);
          const field = ancestorElement(node, "Field");
          const fieldAttributes = field ? attributesOf(field) : undefined;
          const rawName =
            attributeValue(attributes, "name") ??
            (fieldAttributes
              ? attributeValue(fieldAttributes, "name")
              : undefined);
          const name = rawName?.match(/^["'](.+)["']$/)?.[1];
          const type = attributeValue(attributes, "type");
          const inputMode =
            attributeValue(attributes, "inputMode") ??
            (fieldAttributes
              ? attributeValue(fieldAttributes, "inputMode")
              : undefined);
          const spellCheck =
            attributeValue(attributes, "spellCheck") ??
            (fieldAttributes
              ? attributeValue(fieldAttributes, "spellCheck")
              : undefined);
          const location = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          );
          const prefix = `${relative(process.cwd(), file)}:${location.line + 1}`;

          if (name && /(url|address)$/.test(name)) {
            if (!/["']url["']/.test(type ?? "")) {
              violations.push(`${prefix} URL field must use type=url`);
            }
            if (!/["']url["']/.test(inputMode ?? "")) {
              violations.push(`${prefix} URL field must use inputMode=url`);
            }
          }

          if (/["']number["']/.test(type ?? "")) {
            const expectedMode =
              name && /(cost|price|rate)/.test(name) ? "decimal" : "numeric";
            if (!new RegExp(`["']${expectedMode}["']`).test(inputMode ?? "")) {
              violations.push(
                `${prefix} number field must use inputMode=${expectedMode}`,
              );
            }
          }

          if (
            name &&
            /(api-key|credential|path|stable-key|model-id|workspace-id|requirement-id|custom-gate-id|artifact-kind|command|arguments)$/.test(
              name,
            ) &&
            !/false/.test(spellCheck ?? "")
          ) {
            violations.push(`${prefix} sensitive field must disable spellcheck`);
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(source);
    }

    expect(violations).toEqual([]);
  });
});
