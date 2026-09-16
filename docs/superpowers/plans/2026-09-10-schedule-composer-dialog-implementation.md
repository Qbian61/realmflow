# Schedule Composer Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the schedule creation action to the page header and open a dialog that reuses the same Composer component as the new-chat page.

**Architecture:** Extract the current new-chat composer markup and interaction state into a controlled reusable component. NewChatPage supplies its existing prompt state and submit callback, while SchedulePage renders the same component inside a modal and owns schedule creation and dialog visibility.

**Tech Stack:** React 18, TypeScript, Lucide React, Testing Library, Vitest, CSS

---

## File Structure

- Create `src/components/Composer.tsx`: controlled shared prompt composer and attachment-menu interaction.
- Modify `src/pages/NewChatPage.tsx`: replace inline composer markup with the shared component.
- Modify `src/pages/SchedulePage.tsx`: restore the header action and render the shared component in a modal.
- Modify `src/App.test.tsx`: cover dialog opening, closing, successful creation, and new-chat regression.
- Modify `src/styles.css`: style the schedule modal and remove fixed-dock spacing and positioning.

### Task 1: Specify the Schedule Dialog Behavior

**Files:**
- Modify: `src/App.test.tsx`

- [x] **Step 1: Replace the existing fixed-composer assertions**

Update the schedule test so it expects a header button and no task textbox before the dialog opens:

```tsx
const createButton = screen.getByRole('button', { name: '新建定时任务' })
expect(createButton).toBeInTheDocument()
expect(
  screen.queryByRole('textbox', { name: '定时任务描述' })
).not.toBeInTheDocument()
```

- [x] **Step 2: Add dialog creation assertions**

```tsx
fireEvent.click(createButton)

const dialog = screen.getByRole('dialog', { name: '新建定时任务' })
const taskPrompt = within(dialog).getByRole('textbox', {
  name: '定时任务描述'
})
fireEvent.change(taskPrompt, {
  target: { value: '每周五生成项目复盘' }
})
fireEvent.click(
  within(dialog).getByRole('button', { name: '创建定时任务' })
)

expect(
  screen.queryByRole('dialog', { name: '新建定时任务' })
).not.toBeInTheDocument()
expect(
  screen.getByRole('heading', { name: '每周五生成项目复盘' })
).toBeInTheDocument()
```

- [x] **Step 3: Add close-interaction coverage**

Open the dialog again, press Escape, and assert that the dialog is removed. Reopen it, click the overlay, and assert the same result.

- [x] **Step 4: Run the focused test and verify RED**

Run:

```bash
npm test -- --run src/App.test.tsx
```

Expected: FAIL because the header button and modal do not exist and the fixed composer is still rendered.

### Task 2: Extract the Shared Composer

**Files:**
- Create: `src/components/Composer.tsx`
- Modify: `src/pages/NewChatPage.tsx`

- [x] **Step 1: Create a controlled component interface**

```tsx
export type ComposerProps = {
  value: string
  textareaLabel: string
  placeholder: string
  submitLabel: string
  modelLabel: string
  workspaceLabel: string
  permissionLabel: string
  onChange: (value: string) => void
  onSubmit: () => void
}
```

The component owns only attachment-menu visibility and file-input behavior. It calls `onSubmit` from its form handler and disables submit when `value.trim()` is empty.

- [x] **Step 2: Move the existing composer markup**

Move the `.composer`, `.composer-input`, `.composer-actions`, `.attachment-menu`, model selector, voice button, submit button, `.composer-context`, workspace selector, and permission selector markup from `NewChatPage` into `Composer`.

- [x] **Step 3: Replace the NewChatPage inline form**

```tsx
<Composer
  value={prompt}
  textareaLabel="对话内容"
  placeholder="帮你编写代码、调试问题、分析需求，交付可运行的解决方案。"
  submitLabel="发送"
  modelLabel="对话模型"
  workspaceLabel="工作空间"
  permissionLabel="权限模式"
  onChange={setPrompt}
  onSubmit={submitPrompt}
/>
```

Change `submitPrompt` so it no longer requires a form event.

- [x] **Step 4: Run the focused tests**

Run:

```bash
npm test -- --run src/App.test.tsx
```

Expected: schedule dialog assertions still fail, while existing new-chat assertions remain green.

### Task 3: Implement the Schedule Creation Dialog

**Files:**
- Modify: `src/pages/SchedulePage.tsx`

- [x] **Step 1: Add dialog state**

```tsx
const [createDialogOpen, setCreateDialogOpen] = useState(false)
```

Remove SchedulePage attachment-menu, file-input, and textarea refs because the shared Composer owns those controls.

- [x] **Step 2: Restore the header action**

```tsx
<header className="schedule-header">
  <h1>定时任务</h1>
  <button type="button" onClick={() => setCreateDialogOpen(true)}>
    <Plus size={16} />
    新建定时任务
  </button>
</header>
```

- [x] **Step 3: Render the modal**

Render a `.dialog-backdrop` with `role="presentation"` when `createDialogOpen` is true. Inside it, render a `.schedule-create-dialog` with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="schedule-create-title"`. Include a close icon button and the shared Composer.

- [x] **Step 4: Close on Escape and overlay click**

Register a keydown listener only while the modal is open. Close on `Escape`. Attach overlay closing to the backdrop and stop propagation from the dialog panel.

- [x] **Step 5: Close after successful creation**

After inserting the new schedule at the start of `activeSchedules`, clear `prompt` and call `setCreateDialogOpen(false)`.

- [x] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- --run src/App.test.tsx
```

Expected: PASS.

### Task 4: Style and Verify the Modal

**Files:**
- Modify: `src/styles.css`

- [x] **Step 1: Remove fixed-composer layout**

Restore `.schedule-content` bottom padding to normal page spacing. Delete `.schedule-composer-dock` and fixed `.schedule-composer` rules.

- [x] **Step 2: Add modal styles**

Use the existing neutral design language:

```css
.schedule-create-dialog {
  width: min(920px, calc(100vw - 64px));
  padding: 24px;
  background: #fff;
  border: 1px solid #dedede;
  border-radius: 12px;
  box-shadow: 0 28px 64px rgba(0, 0, 0, 0.16);
}
```

Add a compact title row with the heading on the left and an icon-only close button on the right. Keep the shared Composer unmodified inside the dialog.

- [x] **Step 3: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, production build succeeds, and no whitespace errors are reported.

- [x] **Step 4: Browser-check at 1280x800**

Open `http://127.0.0.1:5173/#/schedules`, click “新建定时任务”, and verify:

- The dialog is centered and does not overflow.
- The Composer matches the new-chat input visually.
- The background list remains visible behind the overlay.
- Creating a task closes the dialog and inserts the card first.
- No horizontal overflow exists.

No Git commit or macOS package build is performed unless explicitly requested.
