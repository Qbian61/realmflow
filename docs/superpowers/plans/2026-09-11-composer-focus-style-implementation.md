# Composer Focus Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Composer focus-state outer shadow while retaining the inner input border color change in both new chat and schedule creation.

**Architecture:** Keep the shared Composer markup unchanged and update only its shared CSS. Add a focused stylesheet regression test so future visual changes cannot restore the outer focus ring accidentally.

**Tech Stack:** CSS, Vitest, TypeScript

---

### Task 1: Lock the Focus Style Behavior

**Files:**
- Create: `src/styles.test.ts`

- [x] **Step 1: Add the failing stylesheet test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('Composer focus styles', () => {
  it('uses only the inner input border as focus feedback', () => {
    expect(styles).not.toMatch(/\.composer:focus-within\s*\{/)
    expect(styles).toMatch(
      /\.composer:focus-within \.composer-input\s*\{[^}]*border-color: #bcbcbc;[^}]*\}/
    )
  })
})
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run src/styles.test.ts
```

Expected: FAIL because `.composer:focus-within` still defines an outer border and shadow.

### Task 2: Remove the Outer Focus Treatment

**Files:**
- Modify: `src/styles.css:782-788`

- [x] **Step 1: Delete the outer focus rule**

Remove:

```css
.composer:focus-within {
  border-color: #b8b8b8;
  box-shadow:
    0 0 0 3px rgba(35, 35, 35, 0.09),
    0 28px 58px rgba(0, 0, 0, 0.11),
    0 5px 14px rgba(0, 0, 0, 0.05);
}
```

Keep:

```css
.composer:focus-within .composer-input {
  border-color: #bcbcbc;
}
```

- [x] **Step 2: Run focused and full verification**

Run:

```bash
npx vitest run src/styles.test.ts
npm test
npm run build
git diff --check
```

Expected: all tests pass, production build succeeds, and no whitespace errors are reported.

- [x] **Step 3: Browser-check both Composer locations**

At 1280x800:

- Focus the new-chat textarea and confirm there is no outer focus ring or enhanced shadow.
- Open the schedule creation dialog, focus its textarea, and confirm the same behavior.
- Confirm the inner white input-area border darkens in both locations.

No Git commit or macOS package build is performed unless explicitly requested.
