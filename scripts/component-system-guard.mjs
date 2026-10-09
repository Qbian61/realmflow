import { createHash } from "node:crypto";

import postcss from "postcss";

const RULES = {
  controlSize: "control-size",
  primitiveVisualCopy: "primitive-visual-copy",
  focusVisible: "focus-visible",
  privateOverlay: "private-overlay",
  namedLayer: "named-layer",
  errorColorOnly: "error-color-only",
  toneToken: "tone-token",
  allowlistMetadata: "allowlist-metadata",
};

const FORBIDDEN_CONTROL_SIZES = new Set(["30px", "34px", "38px"]);
const REQUIRED_ALLOWLIST_TEXT = [
  "ruleId",
  "file",
  "selector",
  "owner",
  "reason",
  "removalCondition",
];
const CONTROL_SELECTOR =
  /(?:\bbutton\b|\binput\b|\bselect\b|\btextarea\b|\[role=['"]?button|(?:^|[-_])(?:button|input|select|field|action|control|trigger)(?:\b|[-_]))/i;
const PRIMITIVE_SURFACE_SELECTOR =
  /(?:^|[-_.])(?:menu|popover|alert|error)(?:\b|[-_])/i;
const ERROR_SELECTOR = /(?:^|[-_.])error(?:\b|[-_])/i;
const STATUS_SELECTOR =
  /(?:data-(?:status|health|outcome)|status(?:\b|[-_])|\.ui-(?:field|inline-alert))/i;
const CONCRETE_TONE_TOKEN =
  /^--tone-(?:rgba?[-_]|hsla?[-_]|\d|[a-f\d]{3,8}$)/i;

const splitSelectors = (selector) =>
  selector
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);

const declarationMap = (rule) => {
  const declarations = new Map();
  rule.walkDecls((declaration) => {
    declarations.set(declaration.prop.toLowerCase(), declaration.value.trim());
  });
  return declarations;
};

const normalizeFocusSelector = (selector) =>
  selector
    .replace(/:focus-visible\b/g, "")
    .replace(/:focus\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isVisibleFocusRule = (rule) => {
  const declarations = declarationMap(rule);
  const outline = declarations.get("outline");
  const boxShadow = declarations.get("box-shadow");
  return (
    (outline !== undefined && !/^(?:0|none)$/i.test(outline)) ||
    (boxShadow !== undefined && !/^none$/i.test(boxShadow))
  );
};

const createViolation = ({
  ruleId,
  file,
  node,
  selector,
  property = "",
  value = "",
  message,
}) => ({
  ruleId,
  file,
  line: node?.source?.start?.line ?? 1,
  selector,
  property,
  value,
  message,
});

const validateAllowlist = (allowlist) => {
  const valid = [];
  const violations = [];

  for (const [index, entry] of allowlist.entries()) {
    const missing = REQUIRED_ALLOWLIST_TEXT.filter(
      (field) =>
        typeof entry?.[field] !== "string" || entry[field].trim() === "",
    );
    const wildcard =
      typeof entry?.file === "string" &&
      typeof entry?.selector === "string" &&
      (entry.file.includes("*") || entry.selector.includes("*"));

    if (missing.length > 0 || wildcard) {
      violations.push({
        ruleId: RULES.allowlistMetadata,
        file: entry?.file || "<allowlist>",
        line: index + 1,
        selector: entry?.selector || "<missing selector>",
        property: "",
        value: "",
        message:
          missing.length > 0
            ? `Exception is missing metadata: ${missing.join(", ")}.`
            : "Exception file and selector must be exact and cannot contain wildcards.",
      });
      continue;
    }
    valid.push(entry);
  }

  return { valid, violations };
};

const matchesAllowlist = (violation, entry) =>
  violation.ruleId === entry.ruleId &&
  violation.file === entry.file &&
  violation.selector === entry.selector &&
  (entry.property === undefined || violation.property === entry.property) &&
  (entry.value === undefined || violation.value === entry.value);

const violationFingerprint = (violations) =>
  createHash("sha256")
    .update(
      violations
        .map((violation) =>
          [
            violation.ruleId,
            violation.file,
            violation.selector,
            violation.property,
            violation.value,
          ].join("\u0000"),
        )
        .sort()
        .join("\n"),
    )
    .digest("hex");

export function createComponentSystemBaseline(violations, metadata) {
  const matching = violations.filter(
    (violation) =>
      violation.ruleId === metadata.ruleId &&
      violation.file === metadata.file,
  );
  return {
    ...metadata,
    selector: `<baseline:${metadata.ruleId}>`,
    fingerprint: violationFingerprint(matching),
  };
}

const hasCompletePrimitiveVisual = (declarations) => {
  const hasGeometry = ["height", "min-height", "padding"].some((property) =>
    declarations.has(property),
  );
  const surfaceProperties = [
    "background",
    "background-color",
    "border",
    "border-color",
    "border-radius",
    "box-shadow",
  ].filter((property) => declarations.has(property));
  const hasForeground = declarations.has("color");

  return (
    hasGeometry &&
    surfaceProperties.length >= 2 &&
    hasForeground &&
    declarations.size >= 5
  );
};

const isFullScreenFixedRule = (declarations) => {
  if (declarations.get("position") !== "fixed") return false;
  if (declarations.get("inset") === "0") return true;
  return ["top", "right", "bottom", "left"].every(
    (property) => declarations.get(property) === "0",
  );
};

const collectFocusReplacements = (root) => {
  const replacements = new Set();
  root.walkRules((rule) => {
    if (!rule.selector.includes(":focus-visible") || !isVisibleFocusRule(rule)) {
      return;
    }
    for (const selector of splitSelectors(rule.selector)) {
      if (selector.includes(":focus-visible")) {
        replacements.add(normalizeFocusSelector(selector));
      }
    }
  });
  return replacements;
};

const analyzeRule = (file, rule, focusReplacements) => {
  const violations = [];
  const declarations = declarationMap(rule);
  const selectors = splitSelectors(rule.selector);
  const isSharedPrimitiveFile = file === "src/components/ui/ui.css";

  for (const selector of selectors) {
    for (const property of ["height", "min-height"]) {
      const value = declarations.get(property);
      if (
        value &&
        FORBIDDEN_CONTROL_SIZES.has(value) &&
        CONTROL_SELECTOR.test(selector) &&
        !isSharedPrimitiveFile
      ) {
        violations.push(
          createViolation({
            ruleId: RULES.controlSize,
            file,
            node: rule.nodes.find(
              (node) => node.type === "decl" && node.prop === property,
            ),
            selector,
            property,
            value,
            message: `Generic controls cannot use ${value}; use the 28px, 32px or 36px shared scale.`,
          }),
        );
      }
    }

    if (
      !isSharedPrimitiveFile &&
      hasCompletePrimitiveVisual(declarations) &&
      (CONTROL_SELECTOR.test(selector) ||
        PRIMITIVE_SURFACE_SELECTOR.test(selector))
    ) {
      violations.push(
        createViolation({
          ruleId: RULES.primitiveVisualCopy,
          file,
          node: rule,
          selector,
          message:
            "Page CSS duplicates a complete shared primitive visual property set.",
        }),
      );
    }

    const outline = declarations.get("outline");
    if (
      outline !== undefined &&
      /^(?:0|none)$/i.test(outline) &&
      !focusReplacements.has(normalizeFocusSelector(selector))
    ) {
      violations.push(
        createViolation({
          ruleId: RULES.focusVisible,
          file,
          node: rule.nodes.find(
            (node) => node.type === "decl" && node.prop === "outline",
          ),
          selector,
          property: "outline",
          value: outline,
          message:
            "Outline suppression requires a visible :focus-visible rule for the same control.",
        }),
      );
    }

    if (
      !isSharedPrimitiveFile &&
      (/\bbackdrop\b/i.test(selector) ||
        isFullScreenFixedRule(declarations))
    ) {
      violations.push(
        createViolation({
          ruleId: RULES.privateOverlay,
          file,
          node: rule,
          selector,
          message:
            "Private backdrops and fixed full-screen overlays must use the shared overlay system.",
        }),
      );
    }

    const zIndex = declarations.get("z-index");
    if (zIndex !== undefined && /^-?\d+$/.test(zIndex)) {
      violations.push(
        createViolation({
          ruleId: RULES.namedLayer,
          file,
          node: rule.nodes.find(
            (node) => node.type === "decl" && node.prop === "z-index",
          ),
          selector,
          property: "z-index",
          value: zIndex,
          message: "z-index must use a named --ui-layer-* token.",
        }),
      );
    }

    if (
      !isSharedPrimitiveFile &&
      ERROR_SELECTOR.test(selector) &&
      !STATUS_SELECTOR.test(selector) &&
      declarations.has("color") &&
      ![
        "background",
        "background-color",
        "border",
        "border-left",
        "border-color",
        "box-shadow",
        "content",
        "text-decoration",
      ].some((property) => declarations.has(property))
    ) {
      violations.push(
        createViolation({
          ruleId: RULES.errorColorOnly,
          file,
          node: rule,
          selector,
          property: "color",
          value: declarations.get("color"),
          message:
            "Page errors cannot rely on text color alone; use InlineAlert or another non-color cue.",
        }),
      );
    }
  }

  rule.walkDecls((declaration) => {
    if (!CONCRETE_TONE_TOKEN.test(declaration.prop)) return;
    violations.push(
      createViolation({
        ruleId: RULES.toneToken,
        file,
        node: declaration,
        selector: rule.selector,
        property: declaration.prop,
        value: declaration.value.trim(),
        message:
          "Concrete-value --tone-* tokens are frozen; add or reuse a semantic theme token.",
      }),
    );
  });

  return violations;
};

export function analyzeComponentSystem(files, allowlist = []) {
  const { valid, violations: metadataViolations } =
    validateAllowlist(allowlist);
  const violations = [...metadataViolations];

  for (const file of files) {
    let root;
    try {
      root = postcss.parse(file.source, { from: file.path });
    } catch (error) {
      violations.push({
        ruleId: "css-parse",
        file: file.path,
        line: Number.isInteger(error?.line) ? error.line : 1,
        selector: "<stylesheet>",
        property: "",
        value: "",
        message:
          error instanceof Error ? error.message : "Stylesheet parse failed.",
      });
      continue;
    }
    const focusReplacements = collectFocusReplacements(root);
    root.walkRules((rule) => {
      violations.push(...analyzeRule(file.path, rule, focusReplacements));
    });
  }

  const matchingBaselines = new Set(
    valid
      .filter(
        (entry) =>
          typeof entry.fingerprint === "string" &&
          entry.selector === `<baseline:${entry.ruleId}>`,
      )
      .filter((entry) => {
        const matching = violations.filter(
          (violation) =>
            violation.ruleId === entry.ruleId &&
            violation.file === entry.file,
        );
        return violationFingerprint(matching) === entry.fingerprint;
      }),
  );

  return violations.filter((violation) => {
    if (violation.ruleId === RULES.allowlistMetadata) return true;
    if (valid.some((entry) => matchesAllowlist(violation, entry))) {
      return false;
    }
    return ![...matchingBaselines].some(
      (entry) =>
        entry.ruleId === violation.ruleId && entry.file === violation.file,
    );
  });
}

export function formatComponentSystemViolations(violations) {
  if (violations.length === 0) return "";
  return violations
    .map(
      (violation) =>
        `${violation.file}:${violation.line} [${violation.ruleId}] ${violation.selector} - ${violation.message}`,
    )
    .join("\n");
}
