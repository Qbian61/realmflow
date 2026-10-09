import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { componentSystemGuardAllowlist } from "./component-system-guard-allowlist.mjs";
import {
  analyzeComponentSystem,
  createComponentSystemBaseline,
  formatComponentSystemViolations,
} from "./component-system-guard.mjs";

const analyze = (source, options = {}) =>
  analyzeComponentSystem(
    [{ path: options.path ?? "src/pages/example.css", source }],
    options.allowlist ?? [],
  );

const expectRule = (source, ruleId, options) => {
  const violations = analyze(source, options);
  expect(violations.some((violation) => violation.ruleId === ruleId)).toBe(
    true,
  );
  return violations;
};

describe("component system guard", () => {
  it.each(["30px", "34px", "38px"])(
    "rejects a private generic button with %s height",
    (height) => {
      const violations = expectRule(
        `.page-actions button { height: ${height}; }`,
        "control-size",
      );

      expect(violations[0]).toMatchObject({
        file: "src/pages/example.css",
        line: 1,
        selector: ".page-actions button",
        property: "height",
        value: height,
      });
    },
  );

  it("rejects a page rule that copies a complete shared button visual", () => {
    expectRule(
      `.page-action {
        min-height: 32px;
        padding: 0 12px;
        color: var(--color-text);
        background: var(--color-control);
        border: 1px solid var(--color-border);
        border-radius: 6px;
      }`,
      "primitive-visual-copy",
    );
  });

  it.each([
    ["Menu", ".page-command-menu"],
    ["InlineAlert", ".page-load-error"],
  ])(
    "rejects a page rule that copies a complete shared %s surface",
    (_name, selector) => {
      expectRule(
        `${selector} {
          min-height: 32px;
          padding: 8px 12px;
          color: var(--color-text);
          background: var(--color-surface-elevated);
          border: 1px solid var(--color-border);
          border-radius: 6px;
        }`,
        "primitive-visual-copy",
      );
    },
  );

  it("rejects outline suppression without a focus-visible replacement", () => {
    expectRule(
      `.page-action:focus { outline: 0; }`,
      "focus-visible",
    );
  });

  it("accepts outline suppression when the same control restores focus-visible", () => {
    expect(
      analyze(`
        .page-action:focus { outline: 0; }
        .page-action:focus-visible { outline: 2px solid var(--color-focus); }
      `).filter((violation) => violation.ruleId === "focus-visible"),
    ).toEqual([]);
  });

  it("rejects private backdrops and fixed full-screen overlays", () => {
    const violations = analyze(`
      .page-dialog-backdrop { position: fixed; inset: 0; }
      .page-blocker { position: fixed; top: 0; right: 0; bottom: 0; left: 0; }
    `);

    expect(
      violations.filter((violation) => violation.ruleId === "private-overlay"),
    ).toHaveLength(2);
  });

  it("rejects numeric z-index values", () => {
    expectRule(
      `.page-menu { position: absolute; z-index: 999; }`,
      "named-layer",
    );
  });

  it("accepts named shared layer tokens", () => {
    expect(
      analyze(
        `.page-menu { position: absolute; z-index: var(--ui-layer-menu); }`,
      ).filter((violation) => violation.ruleId === "named-layer"),
    ).toEqual([]);
  });

  it("rejects a page error represented only by text color", () => {
    expectRule(
      `.page-load-error { color: var(--color-error); }`,
      "error-color-only",
    );
  });

  it("accepts semantic status text and shared inline alerts", () => {
    const violations = analyze(`
      .job-status[data-status='failed'] { color: var(--color-error); }
      .page-load-error .ui-inline-alert { color: var(--color-error); }
    `);

    expect(
      violations.filter(
        (violation) => violation.ruleId === "error-color-only",
      ),
    ).toEqual([]);
  });

  it("rejects a concrete-value tone token declaration", () => {
    expectRule(
      `:root { --tone-ff00aa: #ff00aa; }`,
      "tone-token",
    );
  });

  it("requires owner, reason and removal condition on every exception", () => {
    const violations = analyze(
      `.terminal-toolbar button { height: 30px; }`,
      {
        allowlist: [
          {
            ruleId: "control-size",
            file: "src/pages/example.css",
            selector: ".terminal-toolbar button",
            property: "height",
            value: "30px",
            owner: "",
            reason: "Terminal density",
            removalCondition: "Remove when terminal adopts shared toolbar",
          },
        ],
      },
    );

    expect(
      violations.some(
        (violation) => violation.ruleId === "allowlist-metadata",
      ),
    ).toBe(true);
    expect(
      violations.some((violation) => violation.ruleId === "control-size"),
    ).toBe(true);
  });

  it("rejects wildcard file or selector exceptions", () => {
    const violations = analyze(`.terminal-toolbar button { height: 30px; }`, {
      allowlist: [
        {
          ruleId: "control-size",
          file: "src/**/*.css",
          selector: "*",
          property: "height",
          value: "30px",
          owner: "Terminal",
          reason: "Terminal density",
          removalCondition: "Remove when terminal adopts shared toolbar",
        },
      ],
    });

    expect(
      violations.some(
        (violation) => violation.ruleId === "allowlist-metadata",
      ),
    ).toBe(true);
  });

  it("allows one exact audited domain exception", () => {
    const violations = analyze(
      `.terminal-toolbar button { height: 30px; }`,
      {
        allowlist: [
          {
            ruleId: "control-size",
            file: "src/pages/example.css",
            selector: ".terminal-toolbar button",
            property: "height",
            value: "30px",
            owner: "Terminal",
            reason: "Terminal toolbar follows terminal density",
            removalCondition:
              "Remove when Terminal migrates to the shared Toolbar",
          },
        ],
      },
    );

    expect(violations).toEqual([]);
  });

  it("allows an exact file and rule violation-set baseline", () => {
    const files = [
      {
        path: "src/pages/example.css",
        source: `.legacy-action { height: 34px; }`,
      },
    ];
    const current = analyzeComponentSystem(files);
    const baseline = createComponentSystemBaseline(current, {
      ruleId: "control-size",
      file: "src/pages/example.css",
      owner: "UI Platform",
      reason: "Freeze the audited legacy control inventory",
      removalCondition: "Remove after legacy controls use shared primitives",
    });

    expect(analyzeComponentSystem(files, [baseline])).toEqual([]);
  });

  it("invalidates a baseline when a new violation is added", () => {
    const originalFiles = [
      {
        path: "src/pages/example.css",
        source: `.legacy-action { height: 34px; }`,
      },
    ];
    const baseline = createComponentSystemBaseline(
      analyzeComponentSystem(originalFiles),
      {
        ruleId: "control-size",
        file: "src/pages/example.css",
        owner: "UI Platform",
        reason: "Freeze the audited legacy control inventory",
        removalCondition:
          "Remove after legacy controls use shared primitives",
      },
    );
    const changedFiles = [
      {
        path: "src/pages/example.css",
        source: `
          .legacy-action { height: 34px; }
          .new-action { height: 34px; }
        `,
      },
    ];

    expect(
      analyzeComponentSystem(changedFiles, [baseline]).filter(
        (violation) => violation.ruleId === "control-size",
      ),
    ).toHaveLength(2);
  });

  it("formats actionable violations with path, line, selector and rule", () => {
    const violations = analyze(
      [".page-actions {", "  z-index: 999;", "}"].join("\n"),
    );

    expect(formatComponentSystemViolations(violations)).toContain(
      "src/pages/example.css:2 [named-layer] .page-actions",
    );
  });

  it("reports malformed CSS as an actionable parse violation", () => {
    const violations = analyze(`.page { color: red; } }`);

    expect(violations).toEqual([
      expect.objectContaining({
        ruleId: "css-parse",
        file: "src/pages/example.css",
        line: 1,
        selector: "<stylesheet>",
      }),
    ]);
  });

  it("keeps every Renderer stylesheet within the audited baseline", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const files = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".css"))
      .map((path) => ({
        path: `src/${path}`,
        source: readFileSync(resolve(sourceRoot, path), "utf8"),
      }));

    expect(
      analyzeComponentSystem(files, componentSystemGuardAllowlist),
    ).toEqual([]);
  });
});
