import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { componentSystemGuardAllowlist } from "./component-system-guard-allowlist.mjs";
import {
  analyzeComponentSystem,
  formatComponentSystemViolations,
} from "./component-system-guard.mjs";

const sourceRoot = resolve(process.cwd(), "src");
const files = readdirSync(sourceRoot, { recursive: true })
  .map(String)
  .filter((path) => path.endsWith(".css"))
  .map((path) => ({
    path: `src/${path}`,
    source: readFileSync(resolve(sourceRoot, path), "utf8"),
  }));
const violations = analyzeComponentSystem(
  files,
  componentSystemGuardAllowlist,
);

if (violations.length > 0) {
  console.error(formatComponentSystemViolations(violations));
  process.exitCode = 1;
} else {
  console.log(
    `Component system guard passed: ${files.length} stylesheets, ${componentSystemGuardAllowlist.length} audited baselines.`,
  );
}
