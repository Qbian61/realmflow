# RealmFlow P0 Product Architecture Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with strict red-green-refactor TDD. Do not commit, push, deploy, or overwrite unrelated working-tree changes.

**Goal:** Replace the fixed-stage prototype with a local-first, command-driven product core that manages workspace folders, editable requirement workflows, resumable AI execution, model credentials, and model usage statistics.

**Architecture:** Electron Main remains the only business-data and filesystem owner. Renderer sends validated commands and consumes query snapshots/events. Workflow templates seed independently editable requirement DAGs. Python Sidecar performs provider execution but does not own SQLite or formal artifacts.

**Tech Stack:** Electron, TypeScript, React, `better-sqlite3`, FastAPI, Vitest, pytest.

---

## Delivery Boundaries

- Preserve and work with all existing uncommitted changes.
- Use additive SQLite migrations; never rewrite migration version 1.
- Keep legacy dataset loading available during migration, but stop new Renderer business writes through `persistence:save`.
- Keep the existing six stages as one seeded built-in template so existing data remains readable.
- Use UUID-backed stable IDs and `{safe-name}--{short-id}` physical directory names.
- Store encrypted API keys in SQLite. Store the encryption key in a mode-`0600` file under Electron `userData`.
- Use a deterministic local provider in automated tests; real Provider adapters receive credentials through request bodies, never environment variables.

## Task 1: Define P0 Domain Contracts

**Files:**
- Create: `domain/workflow.ts`
- Create: `domain/model.ts`
- Create: `domain/app-settings.ts`
- Test: `domain/workflow.test.ts`
- Test: `domain/model.test.ts`

- [ ] Write failing tests for DAG validation, node insertion/removal, immutable completed nodes, and ready-node calculation.
- [ ] Run `npx vitest run domain/workflow.test.ts domain/model.test.ts` and confirm missing-module failures.
- [ ] Implement:

```ts
export type WorkflowNodeType = 'ai_generate' | 'human_input' | 'tool' | 'approval'
export type NodeRunStatus =
  | 'pending' | 'ready' | 'running' | 'waiting_user' | 'paused'
  | 'blocked' | 'completed' | 'failed' | 'skipped' | 'cancelled' | 'interrupted'

export type RequirementWorkflow = {
  requirementId: string
  templateVersionId: string
  revision: number
  nodes: RequirementNode[]
  edges: WorkflowEdge[]
}
```

- [ ] Keep `RequirementStageId` only as a legacy import compatibility type.
- [ ] Re-run focused tests and confirm green.

## Task 2: Add SQLite Migration Version 2

**Files:**
- Modify: `electron/src/infrastructure/sqlite/migrations.ts`
- Modify: `electron/src/infrastructure/sqlite/database.test.ts`

- [ ] Write failing schema tests for:
  - `app_settings`, `work_roots`
  - `workflow_templates`, `workflow_template_versions`, `workflow_nodes`, `workflow_edges`
  - `requirement_workflows`, `requirement_workflow_revisions`, `requirement_nodes`, `requirement_edges`
  - `workflow_executions`, `node_runs`, `node_todos`, `node_questions`
  - `model_providers`, `model_profiles`, `model_credentials`
  - `model_call_metrics`, `model_usage_rollups`
  - conversation type and folder binding columns
- [ ] Verify the schema test fails because migration version 2 is absent.
- [ ] Add an additive `p0_product_core` migration.
- [ ] Seed the built-in six-stage workflow template.
- [ ] Re-run database and migration tests.

## Task 3: Implement Command-Oriented Main Repositories

**Files:**
- Modify: `electron/src/application/ports/business-repositories.ts`
- Modify: `electron/src/infrastructure/sqlite/repositories.ts`
- Modify: `electron/src/infrastructure/sqlite/repositories.test.ts`
- Create: `electron/src/application/commands/manage-workspaces.ts`
- Create: `electron/src/application/commands/manage-requirements.ts`

- [ ] Write failing repository tests for current work root, workspace creation, requirement creation, and entity-level CAS.
- [ ] Implement focused repositories for settings, work roots, templates, requirement workflows, node runs, todos, models, credentials, and metrics.
- [ ] Implement explicit `CreateSpaceUseCase`, `CreateRequirementUseCase`, rename, delete, and relocate commands.
- [ ] Ensure no command accepts a complete Renderer-owned aggregate snapshot.
- [ ] Re-run repository and use-case tests.

## Task 4: Implement Managed Folder Lifecycle

**Files:**
- Create: `electron/src/workspace/managed-workspace-service.ts`
- Test: `electron/src/workspace/managed-workspace-service.test.ts`
- Modify: `electron/src/workspace/workspace-metadata-store.ts`

- [ ] Write failing tests proving:
  - selecting a new root does not move existing spaces;
  - spaces are created under the current root;
  - requirements are created under the owning space;
  - names are sanitized and include stable short IDs;
  - failures clean temporary directories;
  - deletion moves directories into `.realmflow/trash`;
  - one missing space can be relocated independently.
- [ ] Implement temp-directory creation, manifest writes, atomic rename, and rollback hooks.
- [ ] Bind every requirement to its derived requirement directory.
- [ ] Re-run focused workspace tests.

## Task 5: Expose Typed Business IPC

**Files:**
- Create: `shared/business.ts`
- Modify: `shared/ipc-contract.ts`
- Modify: `shared/types.ts`
- Create: `electron/src/ipc/business-ipc.ts`
- Test: `electron/src/ipc/business-ipc.test.ts`
- Modify: `electron/src/preload-api.ts`
- Modify: `electron/src/preload-main-contract.test.ts`
- Modify: `electron/src/ipc/register-main-ipc.ts`
- Modify: `electron/src/main.ts`

- [ ] Write failing contract tests for settings, space, requirement, workflow, todo, model, statistics, and conversation commands.
- [ ] Add runtime validation for every payload.
- [ ] Wire application use cases in `main.ts`.
- [ ] Expose the narrow `RealmFlowApi.business` bridge.
- [ ] Keep legacy persistence read paths temporarily; block new workspace/navigation writes after Renderer migration.
- [ ] Re-run IPC and preload contract tests.

## Task 6: Implement Editable Requirement DAG Runtime

**Files:**
- Create: `electron/src/application/workflow/manage-requirement-workflow.ts`
- Create: `electron/src/application/workflow/workflow-runtime.ts`
- Test: `electron/src/application/workflow/manage-requirement-workflow.test.ts`
- Test: `electron/src/application/workflow/workflow-runtime.test.ts`

- [ ] Write failing tests for template instantiation, insert, remove, edge update, reorder, topology validation, and completed-node protection.
- [ ] Write failing tests for node readiness and completion gates:

```ts
canCompleteNode({
  requiredArtifactsValid: true,
  requiredTodosComplete: true,
  openRequiredQuestions: 0,
  approvalPassed: true
}) === true
```

- [ ] Implement revisioned requirement workflow mutations.
- [ ] Implement serial ready-queue selection over a valid DAG.
- [ ] Implement atomic current-node completion and downstream readiness.
- [ ] Re-run workflow tests.

## Task 7: Add Todo, Question, Pause, and Automatic Recovery

**Files:**
- Modify: `domain/ai-run.ts`
- Modify: `electron/src/application/recover-interrupted-runs.ts`
- Modify: `electron/src/application/recover-interrupted-runs.test.ts`
- Create: `electron/src/application/workflow/manage-node-execution.ts`
- Test: `electron/src/application/workflow/manage-node-execution.test.ts`

- [ ] Write failing tests for node pause, resume, question answer, todo completion, and completion gates.
- [ ] Change startup recovery from “mark interrupted only” to:
  - mark unfinished operations interrupted;
  - skip paused/waiting/blocked records;
  - reconstruct eligible runs;
  - enqueue them using the original context snapshot and idempotency key.
- [ ] Ensure user-paused runs never auto-resume.
- [ ] Re-run recovery and runtime tests.

## Task 8: Implement Model Pool, Credential Encryption, and Metrics

**Files:**
- Create: `electron/src/models/credential-vault.ts`
- Test: `electron/src/models/credential-vault.test.ts`
- Create: `electron/src/models/model-service.ts`
- Test: `electron/src/models/model-service.test.ts`
- Modify: `electron/src/sidecar/client.ts`
- Modify: `python-service/app/services/runs.py`
- Modify: `python-service/app/api/routes.py`
- Modify: `python-service/tests/test_runs.py`

- [ ] Write failing tests for encrypted SQLite credential round-trip and file mode `0600`.
- [ ] Write failing tests proving plaintext keys never appear in database queries, logs, Renderer payloads, or process environment.
- [ ] Implement AES-256-GCM credential values with nonce and authentication tag stored in `model_credentials`.
- [ ] Implement Provider request configuration for OpenAI-compatible APIs while preserving the deterministic test provider.
- [ ] Capture request count, token categories, latency, status, retries, and estimated cost in `model_call_metrics`.
- [ ] Re-run TypeScript and Python model tests.

## Task 9: Build Context Assembly and Conversation Runs

**Files:**
- Create: `electron/src/application/context/context-assembler.ts`
- Test: `electron/src/application/context/context-assembler.test.ts`
- Modify: `electron/src/ai-run/infrastructure/workspace-run-repositories.ts`
- Modify: `src/domain/chat-session.ts`
- Modify: `src/app/hooks/use-workspace-controller.ts`
- Modify: `src/pages/NewChatPage.tsx`
- Modify: `src/pages/ChatSessionPage.tsx`
- Modify: `src/features/sessions/RecentSessions.tsx`

- [ ] Write failing tests for predecessor artifacts, knowledge snippets, node answers, todos, attachments, and deterministic context truncation.
- [ ] Add conversation kinds `general`, `space`, and `requirement_node`.
- [ ] Add persistent local-folder conversation bindings.
- [ ] Send conversation messages through an AI Run and persist assistant/tool messages.
- [ ] Filter `requirement_node` conversations out of Recent.
- [ ] Re-run conversation and context tests.

## Task 10: Add Requirement Artifact Knowledge Sync

**Files:**
- Create: `electron/src/application/knowledge/sync-requirement-artifacts.ts`
- Test: `electron/src/application/knowledge/sync-requirement-artifacts.test.ts`
- Modify: `electron/src/ai-run/infrastructure/sqlite-artifact-repository.ts`

- [ ] Write failing tests for completion-triggered sync, formal-artifact-only filtering, checksum idempotency, version replacement, and retryable failures.
- [ ] Persist knowledge documents and chunks locally.
- [ ] Trigger sync after requirement completion without rolling back completed requirements on sync failure.
- [ ] Re-run knowledge and artifact tests.

## Task 11: Migrate Renderer to Queries and Commands

**Files:**
- Modify: `src/application/ports/repositories.ts`
- Modify: `src/infrastructure/storage/renderer-repositories.ts`
- Modify: `src/app/hooks/use-workspace-controller.ts`
- Modify: `src/App.tsx`
- Modify: `src/app/AppRoutes.tsx`
- Modify: `src/pages/RequirementDetailPage.tsx`
- Modify: `src/pages/SpaceDetailPage.tsx`
- Test: corresponding `*.test.tsx` files

- [ ] Write failing tests for selecting the current work root, creating physical spaces and requirements, and refreshing query state after command completion.
- [ ] Replace navigation, conversation, and resource snapshot writes with business commands.
- [ ] Render the requirement instance DAG rather than `REQUIREMENT_STAGES`.
- [ ] Add node insert, delete, pause, resume, todo, question, and model-statistics interactions.
- [ ] Keep current visual conventions and responsive layout.
- [ ] Re-run Renderer tests.

## Task 12: Remove Legacy Write Paths and Add Architecture Guards

**Files:**
- Modify: `electron/src/persistence/persistence-ipc.ts`
- Modify: `src/architecture.test.ts`
- Modify: `docs/architecture.md`

- [ ] Write failing architecture tests prohibiting new Renderer imports or invocations of business `persistence:save`.
- [ ] Restrict legacy persistence to migration/read compatibility.
- [ ] Add guards for Main-only workflow orchestration, credentials, and network gateway ownership.
- [ ] Document the new command/query boundaries and recovery lifecycle.
- [ ] Re-run architecture tests.

## Task 13: Full Verification

- [ ] Run focused tests after every red-green cycle.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `.venv/bin/python -m pytest python-service/tests`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Review the full diff for accidental edits, plaintext credentials, destructive migration behavior, and missing runtime validation.
- [ ] Do not create a Git commit unless the user explicitly requests it.
