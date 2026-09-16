# Composer Context Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Composer workspace and permission controls turn uniformly dark on hover or keyboard focus without adding a background or border.

**Architecture:** Keep the shared Composer markup unchanged and add the interaction to the existing `.composer-context .select-control` CSS rules. Extend the stylesheet regression test to lock the color and prohibit additional decoration.

**Tech Stack:** CSS, Vitest, TypeScript

---

### Task 1: Specify the Context-Control Interaction

**Files:**
- Modify: `src/styles.test.ts`

- [x] **Step 1: Add a failing hover-style test**

```ts
it('darkens context controls without adding decoration', () => {
  const interactionRule = styles.match(
    /\.composer-context \.select-control:hover,\s*\.composer-context \.select-control:focus-within\s*\{([^}]*)\}/
  )?.[1]

  expect(interactionRule).toContain('color: #222;')
  expect(interactionRule).not.toMatch(/background|border|box-shadow/)
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/styles.test.ts
```

Expected: FAIL because the shared hover/focus rule does not exist.

### Task 2: Add the Shared Hover and Focus Style

**Files:**
- Modify: `src/styles.css:965-976`

- [x] **Step 1: Add the color transition**

Extend the existing context control rule:

```css
.composer-context .select-control {
  gap: 8px;
  min-height: 34px;
  padding: 0;
  color: #737373;
  transition: color 150ms ease;
}
```

- [x] **Step 2: Add hover and keyboard-focus color**

```css
.composer-context .select-control:hover,
.composer-context .select-control:focus-within {
  color: #222;
}
```

Do not add background, border, shadow, transform, or layout changes.

- [x] **Step 3: Run focused and full verification**

Run:

```bash
npx vitest run src/styles.test.ts
npm test
npm run build
git diff --check
```

Expected: all tests pass, production build succeeds, and no whitespace errors are reported.

- [x] **Step 4: Browser-check both Composer locations**

At 1280x800, verify both bottom controls in:

- New chat.
- Schedule creation dialog.

For each control, confirm its icon, text, and chevron change from `#737373` to `#222` on hover, with no background or border change.

No Git commit or macOS package build is performed unless explicitly requested.
