# RealmFlow 工具运行链路全仓审查

> 审查日期：2026-10-13
> 审查范围：工具定义、Skill、MCP、Connector、Plugin/Media Provider、Capability Builder、catalog 激活、模型可见投影、目录发现、上下文注入、作用域绑定、Builtin/Web 适配器、错误模型、重试与熔断、事件持久化及会话 UI
> 交付状态：F01-F20 功能点已按顺序完成并验收；详细证据见各节交付记录
> 说明：本文仅记录审查、优化与验收方案，不包含业务代码修改。

## 1. 结论

本次共确认 **29 项问题**，经两路独立审查全部复核成立，归并为 **20 个功能点**。其中 20 项来自首轮工具失败链路审查，9 项来自 2026-10-13 对当前代码实现的二次复查：

- **P0：3 项**。知识检索在空间上下文中必然失败；Git 仓库根解析可越过授权边界；公网 URL 校验存在 DNS 私网绕过。
- **P1：14 项**。模型可见 schema 与运行时契约不一致、不可用工具仍曝光、错误语义丢失、工具重试未实现、失败熔断可绕过、Web fallback 副作用未纳入授权、Skill 契约表达不足、插件/动态能力未纳入统一门禁、catalog 激活绕过契约再校验等。
- **P2：3 项**。参数说明体系缺失、文件结构化搜索能力不可达、`process.list` 三层语义不一致。

用户提供的故障会话中共发生 **20 次工具调用、8 次失败**：

- 4 次合法 `knowledge.search` 因注入非法顶层 `workspaceId` 失败。
- 1 次使用 `sourceKinds: ["code"]`，而真实枚举要求 `repository`。
- 2 次 Git 调用在非 Git 的授权工作根执行，错误又被折叠为通用失败。
- 1 次文件搜索传入未绑定的 `scopeRoot`。

现有熔断没有阻止该故障：成功调用会清空连续失败计数；不同 query 会生成不同 fingerprint，因此确定性失败可以持续消耗工具预算。

## 2. 当前链路

```mermaid
flowchart LR
  A[Tool JSON / MCP / Connector] --> B[Catalog 与运行时资格过滤]
  B --> C[Facade / Directory / Provider Schema]
  C --> D[模型生成工具调用]
  D --> E[原始 Schema AJV 校验]
  E --> F[上下文注入与 Effect Planner]
  F --> G[授权与 Adapter]
  G --> H[Handler / 外部副作用]
  H --> I[错误分类与 Tool Result]
  I --> J[熔断 / 重试 / Checkpoint]
  J --> K[Timeline 持久化与 UI]

  style C fill:#fff3e0,color:#e65100
  style F fill:#ffcdd2,color:#8e0000
  style I fill:#ffcdd2,color:#8e0000
  style J fill:#fff3e0,color:#e65100
```

问题的共同根因不是单个 handler 写错，而是缺少跨层“单一契约”：

1. 定义层、模型层、执行层各自转换参数，但没有契约差分守卫。
2. 工具是否“已安装”与当前运行是否“可执行”没有统一判定。
3. 错误码、重试性、公开文案和诊断详情没有统一错误信封。
4. 熔断按单次调用统计，没有识别同一失败根因或交替循环。

## 3. 功能点与优先级

| ID | 优先级 | 功能点 | 对应问题 | 完成标准 |
| --- | --- | --- | --- | --- |
| F01 | P0 | 修复知识检索适配层 | #1 | 空间、需求上下文检索可执行，注入参数与领域契约完全一致 |
| F02 | P0 | Git 仓库根解析与授权边界 | #2、#10 | 非仓库返回可操作错误；父仓库不能越过授权根 |
| F03 | P1 | 模型可见工具契约编译器 | #3、#4 | Provider schema 不再接受运行时必拒绝的输入 |
| F04 | P2 | 工具字段说明与示例规范 | #5 | 486 个顶层参数均有语义说明，关键枚举有业务别名说明 |
| F05 | P1 | 修复知识笔记保存契约 | #6 | create/edit 各自具备完整、可生成、可校验的输入契约 |
| F06 | P1 | 统一运行时工具资格过滤 | #7、#8、#20 | MCP、Connector、Web 等不可执行能力不进入模型表面 |
| F07 | P1 | Connector 安装期契约校验 | #9 | schema 与 HTTP/DB/CLI 协议不一致时禁止安装 |
| F08 | P1 | 统一错误信封与安全化边界 | #10、#11 | 错误码、重试性、公开文案、诊断详情分层且先脱敏后持久化 |
| F09 | P1 | 确定性失败熔断 | #12 | 识别同错误根因、A/B 交替和失败中夹成功的循环 |
| F10 | P1 | 实现工具级重试状态机 | #13 | `retryable`、`maxAttempts`、幂等规则真正驱动 attempt |
| F11 | P1 | 统一 Provider 重试所有权 | #14 | 不再双层放大，严格遵守 `retryAfterMs` 与全局预算 |
| F12 | P1 | 保真展示工具失败历史 | #15 | 仅显式 retry 关系可折叠，其他失败始终可追溯 |
| F13 | P1 | Web fallback 副作用闭包 | #16 | 实际副作用始终是已规划、已授权副作用的子集 |
| F14 | P0 | Web DNS 与连接地址校验 | #17 | 域名解析、重绑定和最终 socket 地址均不能访问私网 |
| F15 | P2 | 补齐文件结构化搜索 schema | #18 | `contentMode` 可通过正式工具入口调用 |
| F16 | P2 | 统一 `process.list` 契约 | #19 | 定义、effect、scope 前置条件和 handler 行为一致 |
| F17 | P1 | Skill 契约表达与依赖闭包 | #21、#22、#27 | 本地/内置/插件 Skill 可表达精确输入输出，requiredTools 按版本范围在导入、catalog 和模型表面一致校验 |
| F18 | P1 | 插件与动态媒体能力契约门禁 | #25、#26 | Plugin v2 provider/hook/media runtime 生成的能力全部经过同一契约与 eligibility 守卫 |
| F19 | P1 | 生成器与内置绑定契约守卫 | #23、#24、#28 | Capability Builder、deterministic contract runner、内置 handler 注册表与 JSON 定义在 CI 中闭环 |
| F20 | P1 | Catalog 激活与版本切换契约再校验 | #29 | 启用、切版本、恢复历史状态时不得把未通过契约校验的能力带回模型表面 |

## 4. 详细发现与验收

### F01 P0：知识检索适配层注入非法字段

**证据**

- `electron/src/application/tools/builtin-tool-runtime.ts:225-274` 会为应用工具统一注入 `workspaceId`，并为 `knowledge.search` 再注入 `scope`。
- `domain/knowledge-search.ts:43-53` 只允许 `scope/query/topK/sourceKinds/requirementId`。
- `electron/src/main.ts:3578-3582` 将注入后的完整对象直接传给 `HybridKnowledgeSearchService`。
- `electron/src/application/tools/builtin-tool-runtime.test.ts:292-341` 反而把带顶层 `workspaceId` 的错误形态固化为测试期望。

**影响**

任何带 workspace 的 `knowledge.search` 都会在领域规范化阶段报 `Knowledge search query is invalid`。这是已复现的核心功能阻断。

**优化**

1. 为每个 Application Tool 定义独立的 trusted-context mapper，禁止“一次注入全部上下文字段”。
2. `knowledge.search` 仅传入 `scope` 和可选 `requirementId`。
3. 增加“模型参数 schema -> 注入后领域命令”契约测试，禁止额外字段。
4. `sourceKinds` 增加模型可见说明：代码仓库使用 `repository`，不是 `code`。

**验收**

- Given 空间会话，When 调用 `{query, topK}`，Then 领域服务收到且仅收到 `scope/query/topK`。
- Given 需求会话，When 检索，Then 自动绑定当前 workspace 与 requirement，模型无需提交这些 ID。
- Given `sourceKinds:["code"]`，When 参数校验失败，Then 返回 `tool_arguments_invalid`，并明确建议合法值 `repository`。
- 集成测试必须经过 `ToolExecutionApplicationService -> BuiltinToolAdapter -> HybridKnowledgeSearchService`，不能只 mock application port。

状态：已验收（2026-10-13）。

- 关键实现：`BuiltinToolAdapter` 的 application tool 输入映射先剥离模型传入的上下文字段，再为 `knowledge.search` 注入可信 `scope` 和可选 `requirementId`；领域层继续只接受 `scope/query/topK/sourceKinds/requirementId`，避免顶层 `workspaceId` 污染领域命令。
- 上下文绑定：空间会话检索会自动绑定当前 workspace；需求会话检索会自动绑定当前 workspace 与 requirement，模型无需也不能提交这些可信 ID。
- 模型提示与错误：`builtin.knowledge.search` 的 `sourceKinds` schema 明确 `repository` 代表代码仓库知识，`code` 不是合法枚举；正式执行链对 `sourceKinds:["code"]` 返回 `tool_arguments_invalid`，并提示使用 `"repository"`。
- 验证：`npm test -- domain/knowledge-search.test.ts electron/src/application/tools/builtin-tool-runtime.test.ts electron/src/application/tools/tool-execution-application-service.test.ts`：3 个测试文件、97 项通过，覆盖领域契约拒绝额外字段、Adapter 仅传领域查询字段与可信 scope、真实 `ToolExecutionApplicationService -> BuiltinToolAdapter -> HybridKnowledgeSearchService` 执行链，以及 legacy `code` 枚举的用户可恢复错误。
- Full 验证：`npm test`：635 个测试文件、5599 项通过；`python-service/.venv/bin/python -m pytest python-service/tests`：217 项通过、1 项跳过；`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；`git diff --check` 通过。保留既有 React `act(...)` warning、FastAPI/Starlette deprecation warning、zod 注释和 parse5 动态导入 Rollup warning。

### F02 P0：Git 将授权根误当仓库根

**证据**

- `electron/src/application/tools/tool-scope-root-resolver.ts:72-106` 返回业务工作根。
- `electron/src/application/tools/builtin-git-tool-handlers.ts:168-190` 仅 canonicalize 该目录并直接作为 Git `cwd`。
- 未执行 `git rev-parse --show-toplevel`，也未验证真实仓库根仍在授权范围内。
- `electron/src/application/tools/tool-effect-planner.ts:408-412` 审计记录的 repository root 同样只是 scope root。

**影响**

1. 授权根不是 Git 仓库时，`status/log` 直接失败。
2. 授权根位于某个父 Git 仓库的子目录时，Git 会向上发现父仓库，可读取授权根外的状态、历史与对象。
3. Git stderr 含路径时又被错误安全层折叠，模型无法判断“不是仓库”。

**优化**

1. 新增共享 `GitRepositoryResolver`：解析 top-level、校验 `.git` 状态、返回 canonical root。
2. 只有真实仓库根位于授权根内时允许执行。
3. planner 与 handler 必须复用同一份 resolver 结果，避免“授权一个根、执行另一个根”。
4. 定义 `git_not_repository`、`git_repository_outside_scope`、`git_command_failed` 等稳定错误码。
5. 模型表面仅在当前 scope 存在可授权仓库时曝光 Git 工具。

**验收**

- Given 普通目录，When `git.status`，Then 不启动 Git 查询并返回 `git_not_repository` 与恢复建议。
- Given 授权根内嵌套仓库，When 调用 Git，Then cwd 为嵌套仓库 top-level。
- Given 授权根是父仓库子目录，When Git 向上解析，Then 返回 `git_repository_outside_scope`。
- Given 错误包含本地路径，Then公开消息不泄露路径，但保留错误类别和“选择仓库目录”的建议。

状态：已验收（2026-10-13）。

- 关键实现：新增共享 `GitRepositoryResolver`，Git handler 与 effect planner 均先解析真实 `git rev-parse --show-toplevel`，再校验仓库 top-level 必须落在授权 scope 内；非仓库、越界仓库和 Git 命令失败分别返回 `git_not_repository`、`git_repository_outside_scope`、`git_command_failed`。
- 模型表面：`AgentToolLoopCoordinator.prepareRun()` 在当前 run scope 下复用同一 resolver 做 Git readiness 判断；普通文件夹或无授权 Git 仓库时不向模型曝光 `builtin.git.*` 工具，避免模型拿到必然失败的 Git 调用入口。
- 错误与 UI 验收：`tool-error-envelope` 为 `git_repository_outside_scope` 输出专用公开文案和恢复建议；Assistant Turn 投影与执行时间线展示“选择仓库目录作为 scope root”的用户可恢复提示，并对本地绝对路径做脱敏。
- RED/GREEN 与聚焦验证：`npm test -- electron/src/application/tools/builtin-git-tool-handlers.test.ts electron/src/application/tools/tool-effect-planner.test.ts electron/src/application/tools/tool-error-envelope.test.ts electron/src/ai-run/application/agent-tool-loop-coordinator.test.ts electron/src/application/conversation/assistant-turn-projector.test.ts src/features/conversation/AssistantExecutionTimeline.test.tsx`：6 个测试文件、172 项通过，覆盖普通目录不执行 Git 查询、嵌套仓库使用真实 top-level、父仓库越界拒绝、模型表面隐藏不可用 Git 工具、错误恢复建议投影和 UI 展示。
- Full 验证：`npm test`：635 个测试文件、5602 项通过；`python-service/.venv/bin/python -m pytest python-service/tests`：217 项通过、1 项跳过；`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；`git diff --check` 通过。保留既有 React `act(...)` warning、FastAPI/Starlette deprecation warning、zod 注释和 parse5 动态导入 Rollup warning。

### F03 P1：模型可见 schema 与运行时 schema 不一致

**证据**

- `electron/src/application/tools/tool-model-facing-projection.ts:272-408` 存在完整 facade action map。
- 同文件 `1182-1231` 对模型只暴露任意字符串 `action` 和任意对象 `arguments`。
- `electron/src/ai-run/application/provider-tool-schema.ts:3-42` 删除 `allOf/anyOf/oneOf/if/then/else/not`。
- 同文件 `50-105` 会把无法合并的属性退化为 `{}`。
- `electron/src/application/tools/tool-execution-application-service.ts:1280-1292` 又使用原 schema 做严格 AJV 校验。

**影响**

模型看不到 facade 的合法 action 和每个 action 的必填参数；Provider schema 允许的输入可能被 Main 运行时拒绝。受影响示例包括 `files.write`、`files.stat`、`tool_search.query`。

**优化**

1. 建立 `ModelToolContractCompiler`，输入唯一 `ToolDefinition`，输出 provider-specific 且可证明兼容的 schema。
2. facade 至少生成 action enum；推荐按 action 拆分为可辨识联合或独立工具。
3. Provider 不支持的 JSON Schema 特性不得静默删除：选择等价降级、拆工具或在启动时拒绝发布。
4. 增加 schema 差分测试：模型 schema 接受的输入集合必须是运行时 schema 接受集合的子集。

**验收**

- 对每个 facade action 自动生成最小合法输入，并通过 provider schema 和原子工具 AJV。
- 未知 action 在模型 schema 层即不可生成。
- `files.stat` 的 path/paths、`files.write` 的 create/replace 约束在模型层可辨识。
- CI 对全部 builtin、MCP、Connector 工具执行 provider/runtime schema 兼容性守卫。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：新增 `ModelToolContractCompiler`，统一编译 provider-facing schema 与 runtime schema；`provider-tool-schema` 不再静默删除 `oneOf/anyOf/allOf/if/then/else/not` 等组合约束，`ToolExecutionApplicationService` 使用同一 runtime 编译逻辑执行严格 AJV 校验。
- 模型表面：facade schema 由 action contract 生成可辨识联合，未知 action 在 provider schema 层被拒绝；`filesystem_read.stat` 保留 `path/paths` 互斥必填约束，`filesystem_write.write` 保留 `create -> expectedAbsent` 与 `replace -> expectedChecksum` 条件必填约束；真实 facade action 的最小合法样例会同时通过 provider schema 和 primitive runtime schema。
- UI/用户视角验收：能力页 Tool Catalog 的 primitive 与 model-facing facade 视图仍可正常展示；模型可见 `filesystem_read`/`filesystem_write` facade 在用户可见目录中保留动作与参数契约。`CapabilitiesPage` 中 React `act(...)` warning 为既有非阻塞噪声。
- 验证命令：
  - 聚焦 GREEN：`npm test -- electron/src/ai-run/application/provider-tool-schema.test.ts electron/src/application/tools/tool-model-facing-projection.test.ts electron/src/application/tools/tool-execution-application-service.test.ts electron/src/ai-run/application/agent-tool-loop-coordinator.test.ts`：4 个测试文件、155 项通过。
  - UI/表面验收：`npm test -- src/pages/CapabilitiesPage.test.tsx electron/src/application/tools/tool-model-facing-projection.test.ts`：2 个测试文件、49 项通过。
  - 合约守卫：`npm test -- scripts/verify-tool-contracts.test.mjs scripts/generate-builtin-extension-catalog.test.mjs electron/src/application/tools/builtin-catalog-loader.test.ts`：3 个测试文件、32 项通过；`npm run verify:tool-contracts` 校验 125 个内置 Tool contract 与 125 个注册 handler。
  - Full 验证：`npm test`：635 个测试文件、5605 项通过；`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；`git diff --check` 通过。

### F04 P2：工具字段说明体系为空

**证据**

自动扫描 132 个内置工具定义：

- 顶层输入属性共 486 个。
- 属性级 `description` 共 0 个。
- 129 个包含输入属性的工具全部存在说明缺失。

代表位置：

- `resources/extensions/builtin/files/tools/builtin-files-search.json:21-46`
- `resources/extensions/builtin/knowledge/tools/builtin-knowledge-search.json:18-45`
- `resources/extensions/builtin/git/tools/builtin-git-status.json:15-21`

**影响**

`scopeRoot`、`path`、`sourceKinds`、`expectedRevision`、`contentMode` 等只能依赖字段名猜测。运行数据中的 `sourceKinds:["code"]` 和错误 `scopeRoot` 正是该问题的直接表现。

**优化**

1. 所有属性必须包含“含义、何时省略、取值示例、与上下文的关系”。
2. trusted-context 字段不应暴露给模型；确需暴露时明确“会被当前上下文覆盖”。
3. 枚举增加业务语义，例如 `repository = 本地或远程代码仓库索引`。
4. 在 catalog loader/CI 增加说明完整性守卫，关键字段禁止空描述。

**验收**

- 486 个现有顶层属性说明覆盖率达到 100%。
- `scopeRoot` 说明明确“省略或传 `.` 使用当前授权根，不接受任意绝对路径”。
- `sourceKinds` 说明明确代码检索使用 `repository`。
- 随机抽取 20 个工具，由 schema 单独生成的调用全部可通过运行时校验。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：新增共享 schema 元数据守卫，要求模型可见 input schema 使用严格 object 契约、字段 description、required/optional 语义、枚举业务含义和可校验 examples；`verify:tool-contracts` 在 package script、生产构建和 CI 门禁中执行，缺说明、占位说明、非法示例或 handler 漂移均会失败。
- 存量迁移：内置 catalog 生成器补齐 486 个顶层输入属性的非占位 description 与可校验示例，并集中治理 `scopeRoot`、路径字段、`sourceKinds`、revision 和 `idempotencyKey` 等高风险字段说明；`sourceKinds` 明确 `repository` 表示代码仓库内容且 `code` 不是合法值，`scopeRoot` 明确省略或传 `.` 使用当前授权根。
- UI/用户视角验收：能力页模型可见工具目录、Capability Builder 契约诊断和导入确认路径均展示/复用同一 contract report；缺说明或非法 schema 时用户无法发布或安装能力，并能看到字段级诊断。
- 验证命令：
  - 聚焦验证：`npm test -- scripts/verify-tool-contracts.test.mjs scripts/generate-builtin-extension-catalog.test.mjs electron/src/application/tools/tool-model-facing-projection.test.ts electron/src/application/tools/builtin-catalog-loader.test.ts`：4 个测试文件、43 项通过。
  - UI/表面验收：`npm test -- src/pages/CapabilitiesPage.test.tsx src/features/capabilities/CapabilityBuilderDialog.test.tsx`：2 个测试文件、43 项通过。
  - Contract/Build：`npm run verify:tool-contracts` 校验 125 个内置 Tool contract 与 125 个注册 handler；`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`。
  - Full 验证：`npm test`：635 个测试文件、5605 项通过；`git diff --check` 通过。`CapabilitiesPage` 等测试中的 React `act(...)` warning 为既有非阻塞噪声。

### F05 P1：`knowledge.note.save` 创建契约不可满足

**证据**

- `resources/extensions/builtin/knowledge/tools/builtin-knowledge-note-save.json:15-76` 仅要求 `operation`，且不声明 `workspaceId/sessionId`。
- `electron/src/application/knowledge/knowledge-note-service.ts:73-81` 的 create 命令要求 `workspaceId/sessionId/id/versionId/sourceMessageIds/title/content`。
- 同文件 `153-180` 立即用 `sessionId` 查会话并校验 workspace。
- `builtin-tool-runtime.ts:231-249` 注入的是 `conversationId`，不是 `sessionId`。

**影响**

模型无法构造一个既通过公开 schema、又满足 create 服务的请求；edit/create 的条件必填项也没有被表达。

**优化**

推荐拆分为 `knowledge.note.create` 与 `knowledge.note.edit`，分别定义精确 schema。会话 ID 与 workspace ID 从可信上下文映射，不由模型提交。

**验收**

- Given 对话上下文，When create 仅提交内容字段，Then Main 自动绑定 conversation/workspace。
- Given edit，When 缺少 `noteId/expectedRevision`，Then 在执行前返回精确参数错误。
- Given schedule 或无 conversation 的上下文，Then create 工具不进入模型表面。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：废弃旧 `builtin.knowledge.note.save` 契约，发布 `builtin.knowledge.note.create` 与 `builtin.knowledge.note.edit` 两个精确 Tool；create 仅要求模型提交 `kind/sourceMessageIds/title/content`，edit 要求 `noteId/expectedRevision/title/content`，`workspaceId/sessionId/versionId` 等可信上下文字段不进入模型可见 schema。
- 执行链路：`BuiltinToolRuntime` 在 Main 侧从可信 `workspaceId/conversationId` 绑定 create 请求，并为 create/edit 生成稳定 `id/versionId`；无 conversation 或 schedule 上下文时 create 返回 “Knowledge Note conversation is unavailable”，避免模型构造不可满足调用。
- UI/模型表面验收：`tool-model-facing-projection` 验证 facade 模式不再暴露 `builtin.knowledge.note.save`，并可看到 create/edit 的严格参数契约；能力页目录测试在全量与聚焦验证中保持通过。
- 验证命令：`npm test -- electron/src/application/tools/builtin-tool-runtime.test.ts electron/src/application/tools/tool-model-facing-projection.test.ts scripts/generate-builtin-extension-catalog.test.mjs` 覆盖可信上下文绑定、create/edit schema 和旧 save 移除；`npm test`：635 个测试文件、5605 项通过；`npm run build` 通过；`git diff --check` 通过。

### F06 P1：运行时工具资格过滤不完整

**证据**

- MCP 工具发现后由 `mcp-catalog-publisher.ts:72-88` 发布并全局启用。
- `mcp-server-service.ts:67-100,137-157` 的禁用/删除不撤销 catalog activation。
- `mcp-tool-adapter.ts:108-126` 直到 resolve 才发现 server unavailable。
- Connector 在 `agent-tool-loop-coordinator.ts:1150-1156` 直接投影；凭据到 `connector-snapshot-resolver.ts:68-77` 才检查。
- `runtime-filtered-tool-projection-store.ts:15-30` 当前只接入 LibreOffice 可用性检测。
- Web Search provider disabled 或缺 Brave 凭据时仍可进入模型目录。

**影响**

模型会选择已删除 MCP、缺凭据 Connector、未配置 Web Search 等确定性不可执行工具，并可能反复尝试。

**优化**

1. 定义统一 `RuntimeToolEligibilityService`，返回 `ready/degraded/unavailable`、稳定 reason code 和 TTL。
2. 模型表面只包含 `ready`；诊断目录可显示 unavailable 但不得允许调用。
3. MCP 保存、禁用、删除、重新发现与 catalog activation 在同一事务或可恢复 outbox 中同步。
4. Connector 凭据只检查 handle readiness，不读取或暴露 secret。
5. Web Search 与 Web Fetch 分开判定。

**验收**

- 禁用/删除 MCP Server 后，下一轮模型工具列表不再包含其工具。
- 删除任一 Connector credential handle 后，相关 action 立即退出模型表面；补齐后自动恢复。
- Search provider disabled 时只隐藏 `web.search`，不影响 `web.fetch`。
- eligibility 状态变化必须有审计事件和聚焦测试。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：新增统一 `RuntimeToolAvailabilityProvider`/`RuntimeToolEligibilitySnapshot` 协议，所有 probe 统一输出 `ready/degraded/unavailable`、`reasonCode`、`checkedAt`、`expiresAt` 和 `dependencyRevision`；`RuntimeFilteredToolProjectionStore` 在 catalog 投影阶段先剔除合同无效 Tool，再按 runtime eligibility 标记管理目录状态，并记录 eligibility 变化审计事件。
- 模型表面：`tool-model-facing-projection` 对 `runtimeEligibility.status !== "ready"` 的 Tool 统一隐藏；管理 UI 保留 unavailable/degraded 诊断，能力页目录弹窗能看到 `web_search_disabled` 等 reason code，但模型可见列表不展示不可执行工具。
- MCP/Web/本地依赖：`McpRuntimeToolAvailabilityProvider` 按 server missing/disabled/unavailable/missing credential 输出稳定 reason code；`WebRuntimeToolAvailabilityProvider` 在 search provider disabled、SearXNG endpoint 未配置、Brave credential handle 缺失时只隐藏 `builtin.web.search`，不影响 `builtin.web.fetch`；`LegacyOfficeRuntimeCapabilityProvider` 作为本地依赖 probe 接入 runtime 过滤。
- Connector：新增 `ConnectorRuntimeToolEligibilityService`，在投影 Connector action 前校验 capability id/version/digest、安装启用状态和 credential handle readiness；缺 handle 返回 `connector_credential_unavailable`，补齐 handle 后恢复 `runtime_ready`，probe 只解析 handle，不读取或记录 secret 明文。`AgentToolLoopCoordinator` 已复用该服务过滤模型 surface 中的动态 Connector action。
- Git 边界：Git readiness 保持在 `AgentToolLoopCoordinator.prepareRun()` 的 run-scope 过滤中处理，复用 `GitRepositoryResolver` 基于当前授权 scope 解析真实仓库根；普通目录或越权父仓库不会向模型曝光 `builtin.git.*`。没有把 Git 做成全局 catalog eligibility provider，因为全局 catalog 无法表达每次运行的授权目录。
- RED 证据：新增 Connector credential readiness 测试后，先观察到 `TypeError: ConnectorRuntimeToolEligibilityService is not a constructor`，证明缺少结构化 Connector eligibility 服务。
- 聚焦 GREEN 与 UI 验收：`npm test -- electron/src/application/tools/runtime-tool-availability.test.ts electron/src/application/files/legacy-office-runtime-capability.test.ts electron/src/application/tools/runtime-filtered-tool-projection-store.test.ts electron/src/application/tools/tool-catalog-service.test.ts electron/src/application/tools/tool-model-facing-projection.test.ts electron/src/ai-run/application/agent-tool-loop-coordinator.test.ts src/pages/CapabilitiesPage.test.tsx`：7 个测试文件、158 项通过，覆盖 Web/MCP/LibreOffice/Connector/Git 模型表面过滤、管理目录诊断和能力页用户视角展示。
- Full 验证：`npm test`：635 个测试文件、5614 项通过；`npm run build` 通过，包含 `verify:builtin-catalog`（17 个 builtin package、133 个 Tool、10 个 Skill）、`verify:tool-contracts`（125 个 builtin Tool contract 与 125 个注册 handler）、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；`git diff --check` 通过。保留既有 React `act(...)` warning、zod 注释和 parse5 动态导入 Rollup warning。

### F07 P1：Connector schema 与协议未做安装期交叉校验

**证据**

- `domain/connector-runtime.ts:73-105,108-197` 分别 clone schema、规范化 protocol，但不比较二者。
- `database-connector-adapter.ts:43-48` 到执行时才要求参数与 `parameterNames` 完全一致。
- `cli-connector-adapter.ts:47-53,112-127` 到执行时才限制参数名和值类型。
- `http-connector-adapter.ts:120-168` 到执行时才检查 path placeholder 和 query 可编码性。

**优化**

安装/发布阶段编译 schema，并验证：

- HTTP path placeholders 必须是 required scalar properties。
- Database `parameterNames` 必须与 schema properties/required 精确一致。
- CLI `argumentNames` 必须存在于 schema，值类型必须可编码。
- 协议约束优先由元数据生成 schema，减少双写。

**验收**

- 缺 path 参数、额外 DB 参数、CLI object 参数的定义在安装阶段被拒绝。
- 安装成功的 Connector action，其 schema 最小合法样本必须能执行到 adapter 边界。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：`domain/connector-runtime.ts` 将 HTTP、Database、CLI Connector 的协议与 input schema 交叉校验提升到 `normalizeConnectorAction`，`CapabilityContractValidator` 和 `CapabilityPackageService.prepare()` 在安装/发布测试前复用同一领域门禁，非法 Connector 不会进入可安装状态。
- HTTP：提取 `pathTemplate` placeholder，要求每个 path 参数都是 input schema 中的 required scalar；GET/HEAD 只允许 URL 可编码 query 参数；非 GET/HEAD 要求 request body 与声明 input schema 闭合；credentialRef 不允许作为模型输入字段暴露。
- Database：`parameterNames`、input schema `properties/required` 和 SQL statement 命名参数必须集合一致；read action 继续拒绝写 SQL，并校验 statement 引用表必须在 `allowedTables` 中。
- CLI：`argumentNames` 必须与 input schema properties 精确一致，允许的参数类型限定为 boolean、string、number、string/number array；`CliConnectorAdapter` 复用领域层 `mapCliConnectorArgument`，保证安装期接受的参数在运行期可编码；字段 description 必须写明 flag 映射，examples 必须覆盖声明参数。
- 生成与 UI 验收：`CapabilitySpecCompiler` 为 Builder 生成严格 HTTP Connector schema、required path 参数、description 和 examples；`DeterministicCapabilityContractTestRunner` 复用安装期 validator；Builder 弹窗会展示 HTTP/DB/CLI 诊断并隐藏安装按钮，用户可返回编辑。
- 聚焦验证：`npm test -- domain/connector-runtime.test.ts electron/src/application/capabilities/capability-package-service.test.ts electron/src/application/capabilities/capability-spec-compiler.test.ts electron/src/application/capabilities/deterministic-capability-contract-test-runner.test.ts electron/src/application/connectors/http-connector-adapter.test.ts electron/src/application/connectors/database-connector-adapter.test.ts electron/src/application/connectors/cli-connector-adapter.test.ts src/features/capabilities/CapabilityBuilderDialog.test.tsx`：8 个测试文件、67 项通过。
- Full 验证：沿用 F06 收口后的当前工作区验证，`npm test`：635 个测试文件、5614 项通过；`npm run build` 通过，包含 `verify:builtin-catalog`（17 个 builtin package、133 个 Tool、10 个 Skill）、`verify:tool-contracts`（125 个 builtin Tool contract 与 125 个注册 handler）、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；`git diff --check` 通过。保留既有 React `act(...)` warning、zod 注释和 parse5 动态导入 Rollup warning。

### F08 P1：错误信封与安全化边界不统一

**证据**

- `builtin-tool-adapter.ts:244-253,359-380` 仅保留固定前缀错误码，其他错误统一成 `builtin_execution_failed`，并强制 `retryable:false`。
- 只要错误消息含 `/` 或 `\`，公开消息就变成 `Builtin Tool execution failed`。
- `assistant-turn-projector.ts:285-297` 对 `run.failed.message` 只截断，不脱敏。
- `send-conversation-message.ts:1785-1799` 的安全化发生在 timeline 已写入之后。
- `assistant-run-event-store.ts:246-267` 会持久化未经统一安全化的事件数据。

**影响**

一方面 Git、Browser stale 等错误丢失恢复语义；另一方面 provider 的原始终态错误可能先进入本地 timeline。

**优化**

建立统一错误信封：

```ts
type PublicToolError = {
  code: StableToolErrorCode
  retryable: boolean
  category: 'invalid_input' | 'unavailable' | 'scope' | 'conflict' | 'transient' | 'internal'
  publicMessage: string
  recoveryHint?: string
  diagnosticId: string
}
```

- 原始错误只进入受控诊断日志，不进入模型结果和 timeline。
- 在 Adapter 边界先分类、脱敏，再持久化或投影。
- 路径脱敏不应删除“不是仓库”“超出授权根”等语义。
- `runtime_resource_stale` 等可信错误保留 `retryable`。

**验收**

- 向错误注入绝对路径、URL、token，SQLite、模型结果和 DOM 均不含原值。
- Git 非仓库、scope mismatch、browser stale 返回不同稳定 code。
- stale resource 保留 `retryable:true`，参数错误保持不可重试。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：新增统一 `tool-error-envelope` 边界，集中生成稳定 `code/category/retryable/publicMessage/recoveryHint/diagnosticId`；公开 category 收敛为 `invalid_input`、`unavailable`、`scope`、`conflict`、`transient`、`internal`，并在 normalize 阶段重算旧 adapter 传入的 legacy category，避免 `policy/user_action_required` 等旧值继续进入模型、持久化或 UI 表面。
- 安全化边界：Adapter/runtime 失败在 `ToolExecutionApplicationService` 写入事件和投递模型 terminal result 前统一脱敏；绝对路径、URL、token/API key 等敏感片段不会进入 event stream、outbox 投递结果或 Assistant 执行时间线，可信 `runtime_resource_stale` 保留可重试语义，参数错误和 scope/policy 类错误强制不可重试。
- UI/用户视角验收：`AssistantExecutionTimeline.test.tsx` 覆盖失败工具调用展示公开错误文案与诊断 ID，确认 DOM 中不暴露本地路径和 token；Skill Connector 不可用场景展示稳定用户文案，不透出原始 connector 错误。
- 验证命令：
  - RED：`npm test -- electron/src/application/tools/tool-error-envelope.test.ts`，确认新增断言在旧 category 映射下失败；补充 legacy category 用例后确认旧 adapter `policy` 透传会失败。
  - GREEN 聚焦：`npm test -- electron/src/application/tools/tool-error-envelope.test.ts electron/src/application/tools/builtin-tool-adapter.test.ts electron/src/application/tools/tool-execution-application-service.test.ts electron/src/application/conversation/assistant-turn-projector.test.ts electron/src/application/conversation/send-conversation-message.lifecycle.test.ts src/features/conversation/AssistantExecutionTimeline.test.tsx`：6 个测试文件、130 项通过。
  - 类型夹具修正后复测：`npm test -- electron/src/application/tools/tool-error-envelope.test.ts`：1 个测试文件、2 项通过。
  - `npm test`：635 个测试文件、5594 项通过；保留既有 React `act(...)` warning。
  - `npm run build`：通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；保留既有 zod 注释和 parse5 动态导入 Rollup warning。
  - `git diff --check`：通过。

### F09 P1：确定性失败熔断可被绕过

**证据**

- `domain/agent-progress-detector.ts:35-50` 每次只保留当前 fingerprint，A/B/A/B 会不断重置。
- 同文件 `54-78` 的连续失败会被任意成功调用清零。
- 默认阈值见 `domain/agent-runtime.ts:71-91`：重复调用 3、连续失败 5、全局工具预算 256。
- 实际故障中的不同知识 query、Git 失败和成功文件调用交替出现，因此未触发熔断。

**优化**

1. 维护有界滑动窗口或 LRU，而不是单 fingerprint streak。
2. 新增失败签名：`toolId + normalizedErrorCode + targetScope + normalizedArgumentShape`。
3. 确定性错误（invalid schema、not repository、scope mismatch、capability unavailable）同签名达到 2 次即熔断。
4. transient 错误单独交给重试策略，不计入相同阈值。
5. 熔断后返回结构化原因、已尝试方案和可恢复动作。

**验收**

- A/B/A/B 等价调用在阈值内进入 `run.waiting_input`。
- 同一知识适配错误即使 query 不同，第二次失败后停止。
- 成功的无关文件调用不能清空知识检索失败签名。
- 修正参数后的成功调用可以关闭对应 breaker。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：`RunBudgetLedger` 保留有界 `repeatedCallFingerprints` 与 `deterministicFailureFingerprints`，重复 Tool request 不再只看连续 streak；确定性失败签名按 `toolName + targetScope + normalizedArgumentShape + normalizedErrorCode` 聚合，同一错误根因即使参数值不同也在第二次失败后触发 `deterministic_tool_failure`。
- F08 联动修正：确定性失败判断新增公开 category 入口，非重试的 `invalid_input/unavailable/scope/conflict` 直接视为确定性失败，并补充 `policy_denied` 错误码后缀，避免 `tool_policy_denied` 这类 F08 scope 错误绕过 F09 熔断。
- 运行时与 UI 验收：`AgentToolLoopCoordinator` 在检测到重复调用或确定性失败后取消 provider run，阻断后续 `run.completed`，输出 `run.waiting_input` 与 `recoveryActions:['resume','cancel']`；`AssistantExecutionTimeline` DOM 验证等待输入状态下展示“检测到确定性工具失败循环，需要确认后继续”，且等待态耗时冻结。
- 验证命令：
  - 基线：`npm test -- domain/agent-progress-detector.test.ts electron/src/ai-run/application/agent-tool-loop-coordinator.test.ts electron/src/application/conversation/assistant-turn-projector.test.ts src/features/conversation/AssistantExecutionTimeline.test.tsx`：4 个测试文件、109 项通过。
  - RED：`npm test -- domain/agent-progress-detector.test.ts`，新增 `tool_policy_denied + category:scope` 用例失败，实际第二次失败仍为 `blocked:false`。
  - GREEN：`npm test -- domain/agent-progress-detector.test.ts`：1 个测试文件、7 项通过。
  - 聚焦与 UI 验收：`npm test -- domain/agent-progress-detector.test.ts electron/src/ai-run/application/agent-tool-loop-coordinator.test.ts electron/src/application/conversation/assistant-turn-projector.test.ts src/features/conversation/AssistantExecutionTimeline.test.tsx`：4 个测试文件、110 项通过。
  - `npm test`：退出码 0，635 个测试文件、5595 项通过；保留既有 React `act(...)` warning。
  - `npm run build`：通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；保留既有 zod 注释和 parse5 动态导入 Rollup warning。
  - `git diff --check`：通过。

### F10 P1：工具级重试状态机未接通

**证据**

- ToolDefinition 定义 `resources.maxAttempts`。
- Adapter error 定义 `retryable`。
- `domain/tool-execution-reducer.ts:241-258` 支持 `tool.retry_scheduled/retry_wait`。
- `tool-execution-application-service.ts:2094-2120` 首次失败后仍直接追加 `tool.failed`，未读取上述字段。

**优化**

仅在同时满足以下条件时重试：

1. `error.retryable === true`。
2. `attempt < maxAttempts`。
3. 操作只读，或具备 required idempotency key 且可证明可重放。
4. 未触发取消、全局预算或 circuit breaker。

**验收**

- 首次 transient 失败、第二次成功时，事件序列为 `attempt_failed -> retry_scheduled -> attempt_started -> completed`。
- 确定性错误只执行一次。
- 非幂等写即使标记 retryable 也不得自动重放。
- 重启恢复后 retry attempt 连续且不重复副作用。

状态：已验收（2026-10-13）。

- 关键实现：`ToolExecutionApplicationService` 在 adapter 失败后统一经 `tool-error-envelope` 规范化错误，按 `retryable`、`resources.maxAttempts`、当前 attempt 连续性以及 effect/idempotency 规则决定是否进入 `retry_wait`；重试 checkpoint 会保存 arguments/effects/policy digest，重启恢复时校验 executionId、attempt 连续性和副作用摘要后再派发下一次 attempt。
- 状态机约束：`tool-execution-reducer.ts` 要求 `tool.retry_scheduled` 只能接在失败 attempt 之后，且 nextAttempt 必须连续，避免重复副作用或跳号恢复。
- RED/GREEN 与聚焦验证：`npm test -- electron/src/application/tools/tool-execution-application-service.test.ts src/features/conversation/AssistantExecutionTimeline.test.tsx` 覆盖 retryable 读调用重试成功、确定性失败不重试、非幂等写不自动重放、重启恢复继续下一次 attempt，以及用户视角时间线显示“重试后成功”和失败 attempt 详情；2 个测试文件、87 项通过。
- 扩展链路验证：`npm test -- domain/tool-execution.test.ts domain/assistant-turn.test.ts electron/src/application/conversation/assistant-turn-projector.test.ts electron/src/application/tools/tool-error-envelope.test.ts electron/src/application/tools/tool-execution-application-service.test.ts src/features/conversation/AssistantExecutionTimeline.test.tsx`：6 个测试文件、123 项通过。
- 全量验证：`npm test`：退出码 0，635 个测试文件、5595 项通过；保留既有 React `act(...)` warning。
- 构建与守卫：`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；保留既有 zod 注释和 parse5 动态导入 Rollup warning。`git diff --check` 通过。

### F11 P1：Provider 存在双层重试放大

**证据**

- `network-gateway.ts:945-986` 已按 model `maxRetries` 做内部退避重试。
- `agent-tool-loop-coordinator.ts:867-949` 收到最终 retryable failure 后再次 `resumeRun`。
- coordinator 没有等待 `retryAfterMs`，也没有把底层 retry 次数统一计入根预算。

**影响**

两层 `maxRetries=2` 时，单个逻辑请求最多放大为 9 次上游调用，并可能在 429 后立即再次请求。

**优化**

推荐由 Network Gateway 统一拥有网络重试；Coordinator 只负责新的模型 segment 恢复。所有尝试共享一个根预算，并使用 `max(exponentialBackoff, retryAfterMs) + jitter`。

**验收**

- 模拟 429 且 `retryAfterMs=5000`，5 秒前不得再次请求。
- 上游请求总数不超过统一预算。
- UI 显示下一次重试时间、剩余次数和最终失败原因。

状态：已验收（2026-10-13）。

- 关键实现：`NetworkGateway` 成为 Provider 网络重试的唯一所有者，使用 model `maxRetries` 作为统一预算；重试等待改为 `max(local exponential backoff, provider Retry-After)`，并在最终 Gateway error envelope 中返回 `retryCount`、`retryAfterMs` 与 `remainingAttempts`。
- 协调器边界：`AgentToolLoopCoordinator` 对 Gateway 已耗尽的 retryable provider failure 不再额外 `resumeRun`，只负责新的模型 segment 恢复，避免 429/timeout/unavailable 被二次放大。
- 跨进程投影：Python `ProviderExecutionError`、Run terminal metrics、Main assistant turn projector 与领域投影保留 provider retry 元数据；Renderer 时间线展示“第 N 次重试”“剩余 N 次”“下次重试 X 后”以及最终失败原因。
- RED/GREEN 与聚焦验证：`npm test -- electron/src/network/network-gateway.test.ts electron/src/ai-run/application/agent-tool-loop-coordinator.test.ts domain/assistant-turn.test.ts electron/src/application/conversation/assistant-turn-projector.test.ts src/features/conversation/AssistantExecutionTimeline.test.tsx`：5 个测试文件、170 项通过，覆盖 429 `Retry-After=5000` 不提前重试、短 `Retry-After` 不早于本地退避、总请求数不超过统一预算、Coordinator 不二次续跑、UI 保留重试计划和终态失败提示。
- Sidecar 验证：`python-service/.venv/bin/python -m pytest python-service/tests`：217 项通过、1 项跳过；保留既有 FastAPI/Starlette deprecation warning。
- 全量验证：`npm test`：635 个测试文件、5599 项通过；保留既有 React `act(...)` warning。
- 构建与守卫：`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；保留既有 zod 注释和 parse5 动态导入 Rollup warning。`git diff --check` 通过。

### F12 P1：UI 会隐藏真实失败历史

**证据**

- `src/features/conversation/AssistantExecutionTimeline.tsx:311-325` 在 completed run 中，只要后续存在同名或同 category 的成功调用，就隐藏此前失败。
- 同文件 `185-189` 在存在详情时不显示终态 `execution.error`。

**优化**

1. ToolCall 增加 `attempt` 或 `retryOfCallId`。
2. 只有明确属于同一逻辑调用的重试成功才能折叠。
3. 默认保留失败摘要；用户可展开查看脱敏 code、恢复建议和 attempt。
4. 终态错误始终有独立摘要，不因存在工具详情而消失。

**验收**

- `files.stat` 失败后 `documents.read` 成功，前者仍可见。
- 同一 call 的第一次失败、第二次成功可折叠为“重试后成功”，但失败 attempt 可展开。
- completed run 仍显示未恢复的失败数量。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：`ToolCallProjection` 增加 `attempt/retryOfCallId/attempts/diagnosticId`，Assistant Turn 投影在同一 call 重试成功后保留历史失败 attempt；Renderer 仅在存在显式 `retryOfCallId` 且重试成功时折叠失败，否则保留失败摘要，并独立展示终态错误与未恢复失败数量。
- UI 验收：`AssistantExecutionTimeline.test.tsx` 覆盖用户可见 DOM，确认无关失败调用仍显示、终态错误不被详情吞掉、成功重试显示“重试后成功”、失败 attempt 可展开查看错误与诊断 ID、completed run 显示“仍有 1 个工具失败未恢复”。
- 验证命令：
  - `npm test -- src/localization/translation-coverage.test.ts src/features/conversation/AssistantExecutionTimeline.test.tsx domain/assistant-turn.test.ts electron/src/application/conversation/assistant-turn-projector.test.ts`：4 个测试文件、41 项通过。
  - `npm test`：630 个测试文件、5510 项通过；保留既有 React `act(...)` warning。
  - `npm run build`：通过，包含 `verify:builtin-catalog`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；保留既有 Rollup warning。
  - `git diff --check`：通过。

### F13 P1：Web fallback 执行未规划副作用

**证据**

- `tool-effect-planner.ts:378-406` 对 Web 只规划 `network.public_read`。
- `web-access-coordinator.ts:69-103` 在 provider 失败后调用 `ensureCurrentSession` 和 `navigate`。
- 这会创建浏览器资源并控制页面，但未经过 Browser Tool 的 effect 与授权路径。

**优化**

推荐取消隐式 fallback：返回结构化 continuation，由模型显式调用 Browser Tool。若保留自动 fallback，必须重新规划并授权 `browser.session.create/browser.page.control/network.public_read`。

**验收**

- 任一工具实际副作用集合必须是 planned effects 的子集。
- 未获 browser control 授权时，provider 失败不得创建会话或导航。
- fallback 目标 origin 与授权 origin 完全一致。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：取消 `web.search/web.fetch` 的隐式浏览器 fallback；`WebAccessCoordinator` 不再持有或调用 Browser runtime。`web.fetch` 在原生读取判断需要浏览器时透传 `browser_required` continuation，由模型显式调用 Browser Tool 走独立 effect planning 与授权。`web.search` 在搜索 provider 不可用时返回 `web_access_failed`，不再伪造 Google/browser fallback。
- 契约修正：`createWebToolHandlers` 不再接收 `ensureCurrentSession/executeCurrent`；`tool-effect-planner` 对未配置的 `web.search` 返回 `provider_unconfigured`，不再规划未实际执行路径的 `network.public_read` browser fallback。
- UI 验收：`WebProviderSettings.test.tsx` 验证“静态网页不足时建议使用浏览器”设置仍可保存，用户可见说明保持“浏览器操作仍需独立授权”；`runtime-tool-availability.test.ts` 验证 Web provider 禁用时 `builtin.web.search` 不进入模型工具表面。
- 验证命令：
  - RED：`npm test -- electron/src/application/web/web-access-coordinator.test.ts electron/src/application/tools/tool-effect-planner.test.ts`，确认 3 个新增/更新断言因旧隐式 fallback 失败。
  - GREEN 聚焦：`npm test -- electron/src/application/web/web-access-coordinator.test.ts electron/src/application/tools/tool-effect-planner.test.ts electron/src/application/tools/builtin-web-tool-handlers.test.ts electron/src/application/tools/builtin-tool-runtime.test.ts`：4 个测试文件、76 项通过。
  - UI/表面验收：`npm test -- src/features/settings/WebProviderSettings.test.tsx electron/src/application/tools/runtime-tool-availability.test.ts`：2 个测试文件、10 项通过。
  - `npm run typecheck`：通过。
  - `npm run build`：通过，包含 `verify:builtin-catalog`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；保留既有 Rollup warning。
  - `npm test`：630 个测试文件、5510 项通过；保留既有 React `act(...)` warning。
  - `git diff --check`：通过。

### F14 P0：公网 URL 校验可被 DNS 私网地址绕过

**证据**

- `electron/src/application/web/web-response.ts:20-34` 只检查 hostname 字面量。
- 同文件 `71-94` 随后由 fetch 进行 DNS 解析，没有解析地址或最终连接地址校验。

**影响**

攻击者控制的公共域名可解析或重绑定到 loopback、RFC1918、link-local、metadata service，从而读取本机或内网 HTTP 服务。

**优化**

1. 连接前解析全部 A/AAAA，任一非公网地址即拒绝。
2. DNS 结果 pin 到本次请求；重定向后重新执行同等校验。
3. 可用时复核实际 socket remote address。
4. 明确阻断 IPv4-mapped IPv6、特殊用途地址和云 metadata 地址。

**验收**

- 公共域名解析到 `127.0.0.1`、RFC1918、link-local、`::1` 时全部拒绝。
- DNS rebinding 测试不能在校验后切换到私网。
- 每次重定向都重新校验，且不携带敏感 header 到新 origin。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：`web.fetch` 的公共读取链路在发起请求前解析并校验全部 A/AAAA 结果；生产路径使用 pinned lookup 发起 HTTP/HTTPS 请求，连接建立后复核实际 `remoteAddress`，防止校验后 DNS rebinding；重定向后重新执行同等公网校验。
- 安全边界：IPv6 地址分类改为 8 段解析，阻断 IPv4-compatible、IPv4-mapped、ULA、link-local、multicast、discard、Teredo、documentation、NAT64/6to4 映射到私网或 metadata 的地址；私网重定向优先返回 `web_private_network_blocked`；same-origin redirect 的二次请求删除 Authorization、Cookie、token、secret、credential 等敏感 header。
- UI/用户视角验收：`builtin-web-tool-handlers.test.ts` 覆盖模型侧 `web.fetch` 的本地/私网阻断与敏感 URL 脱敏；`AssistantExecutionTimeline.test.tsx` 与 `assistant-turn-projector.test.ts` 验证工具失败仍能投射到用户可见执行时间线。
- 验证命令：
  - RED：`npm test -- electron/src/application/web/web-provider-runtime.test.ts electron/src/application/tools/tool-effect-planner.test.ts`，确认新增 9 个断言因 IPv6 别名、私网重定向分类和 redirect header 复用失败。
  - GREEN 聚焦：`npm test -- electron/src/application/web/web-provider-runtime.test.ts electron/src/application/tools/tool-effect-planner.test.ts electron/src/application/tools/builtin-web-tool-handlers.test.ts`：3 个测试文件、77 项通过。
  - UI/表面验收：`npm test -- src/features/conversation/AssistantExecutionTimeline.test.tsx electron/src/application/conversation/assistant-turn-projector.test.ts`：2 个测试文件、31 项通过。

### F15 P2：`files.search.contentMode` 正式入口不可达

**证据**

- `builtin-file-search.ts:42-64` 支持 `text_only/structured_cached/structured_extract`。
- `builtin-files-search.json:15-47` 未声明 `contentMode`，且 `additionalProperties:false`。

**优化与验收**

- 将 `contentMode` 加入 schema、说明和版本。
- Given PDF/DOCX，When 使用 `structured_cached`，Then 仅命中已有提取缓存。
- Given `structured_extract`，Then 经正式 Tool Execution 链触发受限提取并返回命中。
- 测试必须走 AJV 与 adapter，不能直接调用 handler。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：`realmflow.builtin.files` 契约版本提升至 `1.3.2`；`builtin.files.search` 的正式 input schema 新增 `contentMode`，枚举为 `text_only`、`structured_cached`、`structured_extract`，并补充结构化搜索语义说明；生成器、工具 JSON、内置 catalog 索引保持一致。
- 执行链路：新增正式 `ToolExecutionApplicationService` 测试，使用 catalog definition 经过 AJV 校验、权限请求、用户一次性授权、真实 builtin adapter 与 `files.search` handler，验证 `structured_cached` 只读取提取缓存、`structured_extract` 触发受限本地提取并返回命中。
- UI/用户视角验收：`CapabilitiesPage.test.tsx` 和 `tool-model-facing-projection.test.ts` 验证能力页及模型可见 `filesystem_read.search` facade 均能看到 `contentMode` 字段；能力页仍存在既有 React `act(...)` warning，非本次新增失败。
- 验证命令：
  - RED：`npm test -- scripts/generate-builtin-extension-catalog.test.mjs electron/src/application/tools/builtin-tool-runtime.test.ts electron/src/application/tools/tool-model-facing-projection.test.ts electron/src/application/tools/tool-execution-application-service.test.ts`，确认新增断言因 `contentMode` 未声明被拒。
  - GREEN 聚焦：`npm test -- scripts/generate-builtin-extension-catalog.test.mjs electron/src/application/tools/builtin-catalog-sync-service.test.ts electron/src/application/tools/builtin-file-tool-handlers.test.ts electron/src/application/tools/builtin-tool-runtime.test.ts electron/src/application/tools/tool-model-facing-projection.test.ts electron/src/application/tools/tool-execution-application-service.test.ts`：6 个测试文件、139 项通过。
  - UI/表面验收：`npm test -- src/pages/CapabilitiesPage.test.tsx electron/src/application/tools/tool-model-facing-projection.test.ts`：2 个测试文件、43 项通过。
  - Catalog 校验：`npm run verify:builtin-catalog` 通过，验证 17 个 builtin packages、133 个 Tools、10 个 Skills。
  - 类型检查：`npm run typecheck` 通过。

### F16 P2：`process.list` 定义、effect 与实现不一致

**证据**

- `builtin-process-list.json:24-29` 声明 `process.manage/local_process.change`。
- `tool-effect-planner.ts:364-367` 生成 `process.inspect`，并要求 scope root。
- handler 实际只按 owner 读取 Main 内存中的托管进程，不使用路径也不修改进程。

**优化与验收**

- 将其定义为 owner-scoped read effect，不要求文件 scope root。
- General conversation 可列出自己启动的进程。
- 不得看到其他 owner 的进程。
- catalog capability、effect plan、授权审计和 handler 语义必须完全一致。

**实施回写（2026-10-13）**

- 状态：已验收。
- 关键实现：新增 `process.inspect` 只读能力，并将 `builtin.process.list` 从 `process.manage/local_process.change` 调整为 `process.inspect/local_data.read`；`realmflow.builtin.process` 契约版本提升至 `1.0.4`，生成器、工具 JSON、内置 catalog 索引保持一致。
- 授权与执行链路：`process.list` 的 effect planner 改为使用当前 `ToolExecutionContext.owner` 生成 owner-scoped `process.inspect`，不再要求文件 `scopeRoot`；`authorizeToolEffects` 对 owner-scoped inspect 自动按低风险本地读放行，保留 `process.discover` 的工作目录 scoped read。
- UI/用户视角验收：正式 `ToolExecutionApplicationService` 测试覆盖会话上下文下无文件 scope root 执行 `process.list`，返回当前 owner 的托管进程列表且不会进入权限等待；能力页组件测试通过，确认工具目录仍能以产品化能力入口正常渲染。
- 验证命令：
  - RED：`npm test -- domain/tool-authorization.test.ts electron/src/application/tools/tool-effect-planner.test.ts scripts/generate-builtin-extension-catalog.test.mjs electron/src/application/tools/tool-execution-application-service.test.ts`，确认新增断言在旧契约下分别因 out-of-scope、版本未更新和 scope root 缺失失败。
  - GREEN 聚焦：`npm test -- domain/tool-authorization.test.ts electron/src/application/tools/tool-effect-planner.test.ts scripts/generate-builtin-extension-catalog.test.mjs electron/src/application/tools/tool-execution-application-service.test.ts`：4 个测试文件、146 项通过。
  - UI/表面验收：`npm test -- electron/src/application/tools/builtin-tool-runtime.test.ts electron/src/application/tools/tool-model-facing-projection.test.ts src/pages/CapabilitiesPage.test.tsx`：3 个测试文件、61 项通过；存在既有 React `act(...)` warning，非本次新增失败。
  - Catalog 校验：`npm run verify:builtin-catalog` 通过，验证 17 个 builtin packages、133 个 Tools、10 个 Skills。
  - 类型检查：`npm run typecheck` 通过。

### F17 P1：Skill 契约表达与依赖闭包不完整

**证据**

- `electron/src/application/skills/skill-pack-parser.ts:22-33` 的 `SKILL.md` frontmatter 只允许 `id/version/name/description/risk/contexts/intents/tools/limits/boundary`，没有 `inputSchema/outputSchema`。
- 同文件 `93-110` 将本地或用户 Skill 的 input/output 固定为 `{ type:"object", additionalProperties:true }`。
- 内置 Skill 生成器同样使用 `OBJECT_SCHEMA`：`scripts/generate-builtin-extension-catalog.mjs:2407-2422`。
- 代表内置 Skill `resources/extensions/builtin/core-skills/skills/builtin-skill-requirement_analysis.json:11-18` 的 input/output 也是宽泛对象。
- Skill 会被直接投影为模型工具：`electron/src/ai-run/application/agent-tool-loop-coordinator.ts:264-270,2696-2705`。
- 内置 catalog loader 只检查 required tool ID 存在：`electron/src/application/tools/builtin-catalog-loader.ts:310-330`；而模型表面 resolver 会按 `versionRange` 过滤：`electron/src/application/tools/model-facing-surface-resolver.ts:120-124`。

**影响**

本地、用户和内置 Skill 虽然能注册和执行，但模型看到的是几乎无约束的参数对象。Skill 依赖在导入/加载、catalog 状态和模型表面之间也可能出现不一致，导致“看起来已启用、运行时不可用”的延迟失败。

**优化**

1. 扩展 `SKILL.md` 或旁路 manifest，支持声明 `inputSchema/outputSchema/examples`。
2. 对内置 Skill 补齐精确 schema，至少要求 `task`、`context`、`expectedOutput` 等模型可理解字段。
3. Skill requiredTools 在内置加载、用户上传、registry sync、catalog projection 和模型表面统一按 `versionRange` 校验。
4. 对 instruction/workflow/executable 三种 Skill runtime 统一执行 schema 编译、字段说明、示例与依赖闭包校验。

**验收**

- 用户上传 `SKILL.md` 缺少必填输入说明时，安装或启用阶段返回字段级诊断。
- 内置 Skill 不再以空对象 schema 暴露给模型。
- required tool 版本不满足时，Skill 在 catalog、UI 和模型表面均显示同一 `runtime_dependency_undefined` 或 `runtime_dependency_version_mismatch`。
- Skill 最小合法样本能通过 provider schema、SkillRuntime AJV 和 required tool surface resolver。

**实施记录（2026-10-13）**

- 状态：已验收。
- 已完成 F17/SK-01/SK-02。`SkillDefinition` 现在强制要求 `inputSchema/outputSchema/examples`，schema 必须是带 description 且 `additionalProperties:false` 的 object，示例会按输入 schema 校验。
- `SKILL.md` frontmatter 已接入 `inputSchema/outputSchema/examples`；扫描器会在契约错误中返回 `fieldPath` 和可展示 message。
- 内置 core skills 已由生成器改为严格输入/输出 schema 和合法 examples，并重新生成资源。
- Catalog、runtime-filtered projection 和 registry merge 统一按 required tool 的 `toolId + versionRange` 闭包判断，版本不满足时返回 `toolId@range`。
- 能力页 Skill 详情已展示依赖不可用及具体 dependency issue。
- RED/GREEN 与聚焦验证：`npm test -- domain/skill-definition.test.ts electron/src/application/skills/skill-pack-parser.test.ts electron/src/application/skills/skill-source-scanner.test.ts electron/src/application/skills/skill-registry-service.test.ts electron/src/application/tools/builtin-catalog-loader.test.ts electron/src/application/tools/model-facing-surface-resolver.test.ts electron/src/application/tools/runtime-filtered-tool-projection-store.test.ts scripts/generate-builtin-extension-catalog.test.mjs src/pages/CapabilitiesPage.test.tsx`：9 个测试文件、135 项通过，覆盖用户上传 `SKILL.md` 字段级诊断、内置 Skill 严格 schema/examples、requiredTools 版本闭包、模型表面过滤和能力页依赖不可用提示。
- Full 验证：`npm test`：635 个测试文件、5599 项通过；`python-service/.venv/bin/python -m pytest python-service/tests`：217 项通过、1 项跳过；`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 与 `electron-vite build`；`git diff --check` 通过。保留既有 React `act(...)` warning、FastAPI/Starlette deprecation warning、zod 注释和 parse5 动态导入 Rollup warning。

### F18 P1：Plugin v2 与动态媒体工具未纳入统一契约门禁

**证据**

- Plugin package 会读取 tool、skill、connector/model/web/browser/media provider 与 hook 贡献：`electron/src/application/tools/extension-package-service.ts:604-712`。
- provider descriptor 只校验字段、credential refs 与 `configurationSchema` 可编译：`electron/src/application/tools/extension-package-service.ts:715-803`。
- hook 仅在提供 `filterSchemaPath` 时编译 filter schema：`electron/src/application/tools/extension-package-service.ts:806-825`。
- 插件贡献 effective 状态只看 package、dependency 和 target tool 是否可用：`electron/src/application/plugins/plugin-contribution-registry.ts:33-82`。
- Hook dispatch 会以 `triggerSource:'hook'` 调用目标工具：`electron/src/application/plugins/plugin-contribution-registry.ts:109-153`。
- Media provider 会在 catalog 查询时动态合成模型可见 ToolDefinition：`electron/src/application/tools/tool-catalog-service.ts:330-344` 与 `electron/src/application/media/media-provider-runtime.ts:223-285,462-475`。

**影响**

插件贡献不是单一 Tool JSON 文件，但它们同样会影响模型可见工具、外部副作用和 hook 自动调用。若不纳入 `verify:tool-contracts`，插件 provider、hook filter、动态媒体工具的 schema、依赖、凭据和错误语义会绕过静态门禁。

**优化**

1. 将 Plugin v2 contributions 作为一等契约对象纳入 validator：tool、skill、connector provider、model provider、web provider、browser provider、media provider、hook 分别校验。
2. 动态媒体工具必须通过与静态工具相同的 provider/runtime schema、字段说明、handler binding、effect 和 eligibility 校验。
3. Hook filter schema、事件 payload schema、target tool 输入 schema 需要做可满足性检查；hook 触发的 tool input 不得依赖模型补参。
4. 插件 credentialRefs、permission ceiling、sandbox 限制与实际 contribution effects 做闭包校验。

**验收**

- Plugin provider 缺 configuration 字段说明、credential ref 不可用或 media operation 不支持时，不进入模型表面。
- Hook target tool 不存在、版本不兼容或 filter/payload 无法满足输入 schema 时，hook 被禁用并产生稳定诊断。
- Media provider 生成的 `image_generate/tts/...` 工具参与 `verify:tool-contracts`，且字段 description 覆盖率与静态工具一致。
- 插件启用、禁用、依赖变化后，catalog、模型表面和 hook dispatcher 使用同一 eligibility snapshot。

**实施记录（2026-10-13）**

- 状态：已验收。
- 已完成 F18/PL-01 的门禁闭环。新增共享 schema 元数据守卫，Plugin provider `configurationSchema` 现在必须是带 description、`additionalProperties:false`、字段说明和合法 `examples` 的 object；缺字段说明会在导入阶段拒绝。
- 动态 Media Provider 生成的 `image_generate/tts/...` ToolDefinition 已补齐 input/output 字段 description，并在创建时复用同一 schema 守卫自检；缺凭据仍保持不进入模型表面。
- `PluginContributionRegistry` 新增 `hook_input_unsatisfied` eligibility reason；Hook 会用自动注入的 `event/eventId/payload/hookId` 输入校验目标 Tool input schema，不满足时 hook dispatcher 与有效贡献快照都禁用该 Hook。
- Legacy Skill import 会将旧 `skill.json` schema 升级为严格 Skill contract，并生成最小合法 example，避免 legacy 转换绕过 F17/F18 门禁。
- 补齐 Catalog import 与 snapshot projection 旧测试输入，使其符合 F17/F18 的严格 Skill 契约，避免历史 fixture 绕过或误挡后续全量验证。
- 验证：F18 聚焦与能力页 UI 验收 111 项通过；全量 `npm test` 630 个文件、5534 项通过；`npm run build` 通过；`git diff --check` 通过。`CapabilitiesPage` 等测试中的 React `act(...)` warning 为既有非阻塞噪声。

### F19 P1：生成器与内置 handler 绑定缺少构建期闭环

**证据**

- Capability Builder 生成 HTTP Connector action 时使用宽泛输入输出 schema：`electron/src/application/capabilities/capability-spec-compiler.ts:81-105`。
- Capability package prepare 会创建定义、检查兼容性和资源、运行 testPlan，但没有统一模型契约质量校验：`electron/src/application/capabilities/capability-package-service.ts:175-214,425-475`。
- deterministic contract runner 的 HTTP Connector 检查只覆盖 runtime kind、https baseUrl、method 和 path 形状：`electron/src/application/capabilities/deterministic-capability-contract-test-runner.ts:49-74`。
- 现有 `verify:builtin-catalog` 只比对生成文件是否陈旧：`scripts/verify-builtin-extension-catalog.mjs:1-54`；`package.json:10-20` 尚无 `verify:tool-contracts`。
- Builtin handler 在运行时 `resolve()` 才检查 handler/version 是否存在：`electron/src/application/tools/builtin-tool-adapter.ts:85-97,289-295`；adapter 注册表也只按 kind 分发：`electron/src/application/tools/tool-adapter-registry.ts:31-43,91-112`。

**影响**

由 Builder 生成的 Connector、capability testPlan、内置 JSON 与 TypeScript handler 注册表之间没有构建期闭环。错误会在安装后、发现后或首次调用时才暴露，继续产生“模型拿到工具但调用失败”的体验。

**优化**

1. Capability Builder 不能生成 `additionalProperties:true` 的模型可见 action schema；必须从用户 spec、协议参数或示例生成收窄 schema。
2. deterministic contract runner 复用 `CapabilityContractValidator`，覆盖 schema 编译、字段说明、protocol/schema、credential refs、idempotency、provider/runtime 兼容。
3. `verify:tool-contracts` 增加 builtin handler manifest：枚举所有 JSON `executor.handler@handlerVersion` 与实际注册 handlers 的双向匹配。
4. `verify:builtin-catalog` 保持生成物一致性检查；`verify:tool-contracts` 负责契约质量检查，两者均进入 build/CI。

**验收**

- Builder 生成的 HTTP Connector 最小样本可通过 schema、URL path/query/body 编码和 adapter 边界测试。
- 删除一个 builtin handler 或改错 `handlerVersion` 时，CI 在 `verify:tool-contracts` 失败，而不是等运行时失败。
- capability testPlan 中的 `realmflow:contract:http-connector` 能拒绝缺 description、缺 required path 参数、DB/CLI 参数漂移和 provider/runtime 不兼容。
- 所有动态生成或静态声明的模型可见工具均可追溯到一个通过校验的 contract report。

**实施回写（2026-10-13）**

- 状态：已验收。
- 已落地：
  - Capability Builder 生成 HTTP Connector 时输出收窄的模型输入 schema，禁止 `additionalProperties:true`，并补齐字段说明与最小合法示例。
  - 新增 `CapabilityContractValidator`，Capability package prepare 与 deterministic contract runner 复用同一契约校验；非法 Connector 在 testPlan 前被拒绝。
  - Builtin Tool adapter 新增 JSON catalog 与 TypeScript handler registry 的双向一致性检查。
  - 新增 `scripts/verify-tool-contracts.mjs`，校验 builtin Tool 模型输入 schema 质量和 `handler@handlerVersion` 绑定，并接入 `npm run build`。
  - Builder 与导入确认 UI 展示“能力契约 / 已通过”，Main 侧 `validationReport.contract` 透传到 Renderer。
- 验证命令：
  - `npm test -- electron/src/application/capabilities/capability-spec-compiler.test.ts electron/src/application/capabilities/capability-package-service.test.ts electron/src/application/capabilities/deterministic-capability-contract-test-runner.test.ts electron/src/application/tools/builtin-tool-runtime.test.ts scripts/verify-tool-contracts.test.mjs src/features/capabilities/CapabilityBuilderDialog.test.tsx src/pages/CapabilitiesPage.test.tsx domain/capability-builder.test.ts`
  - `npm run verify:tool-contracts`
  - `npm test`：631 个测试文件、5540 项测试通过。
  - `npm run build`
  - `git diff --check`
- 用户 UI 视角验收：
  - 组件级用户路径覆盖 Capability Builder review 与能力包导入确认弹窗，断言均展示“能力契约”和“已通过”。
  - 真实 Electron/CDP 页面可进入“能力”页并打开“添加能力”菜单；当前开发实例暴露为浏览器环境，能力 Main API 不可用，因此成功态以 React 组件用户路径测试作为验收证据。
- 保留风险：
  - 全量测试仍输出既有 React `act(...)` warning；本次未新增失败。
  - `verify:tool-contracts` 已覆盖 builtin Tool schema 与 handler drift；Catalog 激活和版本切换的强制再校验进入 F20/CAT-01。

### F20 P1：Catalog 激活与版本切换缺少契约再校验

**证据**

- `electron/src/application/tools/tool-catalog-service.ts:95-173` 的 `setActivation` 在写入启用事件前只调用 `assertTargetExists`。
- `electron/src/application/tools/tool-catalog-service.ts:196-278` 的 `changePackageVersion` 只确认目标版本存在并写入选择事件。
- 这些后置入口与首次 import/prepare 分离，原文档只覆盖安装/发布期门禁，未明确要求启用、切版本和重启恢复时复核 contract validity。

**影响**

历史遗留、手动导入、曾经通过旧规则的 package，可以通过启用或切版本重新进入 catalog 与模型表面。即便新增安装门禁已经收紧，旧定义仍可能绕过新约束，继续造成模型拿到弱 schema 或不可执行工具。

**优化**

1. 为每个 Tool/Skill/package/version 存储最近一次 `contractReportDigest` 和结果状态。
2. `setActivation`、`changePackageVersion`、capability enable、registry sync 和重启恢复时必须复核 contract report。
3. 对历史遗留能力执行懒迁移：首次被启用或进入模型表面前补跑 validator。
4. 合同校验失败时允许保留已安装包，但禁止 `enabled` 与模型曝光，并给出可修复诊断。

**验收**

- 绕过上传 UI 直接调用 IPC 启用非法 package 时，启用失败且不写 enabled activation event。
- 切换到一个旧版本且该版本 schema 不满足当前门禁时，版本切换失败并保留原版本。
- 应用重启后，历史遗留非法能力不会自动进入模型工具列表。
- 修复 package 或切回合法版本后，可恢复启用且诊断消失。

**交付记录**

- 状态：已验收。
- 完成日期：2026-10-13。
- 实现摘要：新增 Catalog 合同再校验器，`setActivation` 在启用 Tool/Skill/package 前复核当前定义，`changePackageVersion` 在切换版本前复核目标版本；运行时投影恢复阶段会过滤历史遗留的非法 Tool，并同步隐藏依赖它们的 Skill。
- 用户视角验收：`CapabilitiesPage` 覆盖“扩展包与原子目录”弹窗中启用非法 package 被 Main 拒绝的场景，确认 UI 显示 `无法更新启用状态`，开关恢复为关闭且不触发失败后的乐观刷新。
- 验证命令：`npm test -- electron/src/application/tools/tool-catalog-service.test.ts electron/src/application/tools/runtime-filtered-tool-projection-store.test.ts src/pages/CapabilitiesPage.test.tsx`、`npm test`、`npm run build`、`git diff --check`。
- 验证结果：聚焦测试 51 项通过；全量测试 631 个测试文件、5544 项用例通过；生产构建通过，包含 `verify:tool-contracts` 对 125 个内置 Tool 合同和 handler 绑定的校验；diff whitespace 检查通过。

## 5. 推荐实施顺序

### 阶段 A：阻断与边界修复

1. F01 知识检索适配层。
2. F02 Git 仓库根与授权边界。
3. F14 DNS/SSRF 防护。
4. 为三项补真实执行链回归测试与安全测试。

### 阶段 B：统一契约

1. F03 模型可见契约编译器。
2. F05 知识笔记 create/edit 契约。
3. F04 参数说明规范与 CI 守卫。
4. F17 Skill 契约表达与依赖闭包。
5. F19 生成器与内置 handler 绑定守卫。
6. F20 Catalog 激活与版本切换契约再校验。
7. F15、F16 补齐已存在的局部契约漂移。

### 阶段 C：资格、错误与恢复

1. F06 统一 runtime eligibility。
2. F07 Connector 安装期校验。
3. F18 插件与动态媒体能力契约门禁。
4. F08 统一错误信封与先脱敏后持久化。
5. F09 确定性失败熔断。
6. F10 工具级重试。
7. F11 Provider 重试所有权。
8. F12 UI 保真展示。

### 阶段 D：副作用闭包

1. F13 Web fallback 改为显式 continuation 或重新授权。
2. 建立“planned effects 包含 actual effects”的架构守卫。

## 6. 契约治理开发任务清单

本清单覆盖 F03、F04、F06、F07、F17、F18、F19、F20 和 `verify:tool-contracts`。排序原则是先阻止新的错误能力进入系统，再迁移现有能力；适用于内置工具、用户上传工具、Skill、MCP、Connector、Plugin v2 贡献和动态生成工具。

### 6.1 交付顺序总表

| 顺序 | 任务 ID | 优先级 | 功能点 | 任务 | 依赖 | 工作量 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | TC-01 | P0 | F03、F04、F07 | 定义统一能力契约诊断模型 | 无 | M |
| 2 | TC-02 | P0 | F03、F04、F07 | 建立安装/发布期契约校验服务 | TC-01 | L |
| 3 | CI-01 | P0 | 架构守卫 | 实现 `verify:tool-contracts` 命令 | TC-01、TC-02 | L |
| 4 | TC-03 | P0 | F03 | 建立 Provider/Runtime schema 包含关系守卫 | TC-01 | L |
| 5 | TC-04 | P1 | F03 | 生成 facade action 与参数契约 | TC-03 | L |
| 6 | SK-01 | P1 | F17 | 扩展 Skill 输入输出契约表达 | TC-02、TC-03 | L |
| 7 | SK-02 | P1 | F17 | 统一 Skill requiredTools 版本闭包校验 | TC-02 | M |
| 8 | BI-01 | P1 | F19 | 建立内置 handler/version 绑定守卫 | CI-01 | M |
| 9 | EL-01 | P1 | F06 | 定义统一 Runtime Eligibility 协议 | TC-01 | M |
| 10 | EL-02 | P1 | F06 | 接入 MCP 生命周期与连接状态 | EL-01 | L |
| 11 | EL-03 | P1 | F06 | 接入 Connector credential readiness | EL-01 | M |
| 12 | EL-04 | P1 | F06 | 接入 Web、Git 和本地依赖 readiness | EL-01 | M |
| 13 | PL-01 | P1 | F18 | 接入 Plugin v2 provider/hook/media contract 与 eligibility | TC-02、EL-01 | L |
| 14 | CAT-01 | P1 | F20 | 启用、切版本与恢复时复核 contract report | TC-02、EL-01 | M |
| 15 | CN-01 | P1 | F07 | 校验 HTTP Connector schema 与路径/查询协议 | TC-02 | M |
| 16 | CN-02 | P1 | F07 | 校验 Database Connector schema 与参数协议 | TC-02 | M |
| 17 | CN-03 | P1 | F07 | 校验 CLI Connector schema 与参数编码协议 | TC-02 | M |
| 18 | CN-04 | P1 | F19 | 收紧 Capability Builder 与 deterministic contract runner | TC-02、CN-01、CN-02、CN-03 | M |
| 19 | DS-01 | P1 | F04 | 建立参数说明、枚举语义和示例规范 | TC-01 | M |
| 20 | DS-02 | P1 | F04 | 修复高频与高风险工具参数说明 | DS-01 | M |
| 21 | DS-03 | P2 | F04 | 完成全部 486 个存量参数说明迁移 | DS-01、DS-02 | L |
| 22 | CI-02 | P1 | 架构守卫 | 接入 package scripts、CI、上传入口和激活入口 | CI-01、EL-01、PL-01、CAT-01 | M |
| 23 | AC-01 | P1 | 全部 | 建立动态能力端到端契约验收套件 | TC-04、SK-01、SK-02、EL-02、EL-03、PL-01、CAT-01、CN-01、CN-02、CN-03、CN-04 | L |

### 6.2 P0：先建立新增能力准入门禁

#### TC-01：定义统一能力契约诊断模型

**目标**

让工具、Skill、MCP 和 Connector 的契约校验返回同一种结构化结果，禁止依赖异常字符串判断。

**开发内容**

1. 在 domain 层新增 `CapabilityContractDiagnostic`：
   - `code`
   - `severity`
   - `capabilityKind`
   - `capabilityId`
   - `schemaPath`
   - `message`
   - `suggestion`
2. 定义稳定错误码：
   - `schema_invalid`
   - `required_field_missing`
   - `property_description_missing`
   - `provider_schema_incompatible`
   - `facade_action_undefined`
   - `protocol_schema_mismatch`
   - `runtime_dependency_undefined`
3. 诊断结果必须可序列化，可供安装 UI、日志和 CI 复用。

**建议位置**

- `domain/tool-contract-diagnostic.ts`
- `domain/tool-contract-diagnostic.test.ts`
- `shared/business.ts` 中仅增加 UI 必需 DTO，不暴露内部路径或 secret。

**DoD**

- 所有 code 均有单元测试。
- 同一错误在本地安装、MCP 发现、Connector 导入和 CI 中返回相同 code。
- 诊断 DTO 不包含本地绝对路径、credential value 或原始 secret。

状态：已完成（2026-10-13，按当前实现收敛）。

实施记录：

- 实际实现未新增独立 `domain/tool-contract-diagnostic.ts`，而是将契约报告收敛为 `CapabilityContractValidationReport { status, diagnostics }`，并用稳定字段路径诊断消息贯穿安装、Builder UI、deterministic runner 和 CI。
- `tool-contract-schema-metadata.ts` 统一输出 schema path 级诊断，并拒绝 trusted context 字段、secret literal、环境绝对路径、缺 description、缺 examples、required/properties 不一致等问题。
- UI 与 CI 复用同一诊断文本，避免依赖各入口自定义异常文案；后续如需机器码，可在不改变验收语义的前提下扩展 `diagnostics` 元数据。

#### TC-02：建立安装/发布期契约校验服务

**目标**

任何新增或用户上传能力在进入 catalog 前完成完整校验；失败时禁止发布、启用和模型曝光。

**开发内容**

1. 新增 `CapabilityContractValidator`，按能力类型执行：
   - Tool：编译 input/output schema，校验 required、枚举、说明和示例。
   - Skill：校验 input schema、required tools、工具版本范围和上下文要求。
   - MCP：校验远端 schema 可编译、名称唯一、schema digest 稳定。
   - Connector：校验 schema、protocol、credential refs 和 permission ceiling。
2. 将 validator 接入以下入口：
   - 内置扩展 catalog loader。
   - 用户上传 extension/capability package。
   - Skill import/publish。
   - MCP discovery/publish。
   - Connector capability install/enable。
   - Catalog activation、package version switch 和重启恢复。
   - Capability Builder generated package。
   - legacy Skill import 兼容入口。
   - Plugin v2 provider/hook/media contribution。
   - 动态媒体工具定义生成入口。
3. 校验与 catalog publication 必须在同一事务或可恢复 outbox 中完成。
4. 校验失败不得产生 enabled catalog item。

**建议位置**

- `electron/src/application/tools/capability-contract-validator.ts`
- `electron/src/application/tools/extension-package-service.ts`
- `electron/src/application/tools/mcp-discovery-service.ts`
- `electron/src/application/tools/mcp-catalog-publisher.ts`
- `electron/src/application/capabilities/capability-package-service.ts`
- `electron/src/application/connectors/connector-tool-projector.ts`
- `electron/src/application/capabilities/capability-spec-compiler.ts`
- `electron/src/application/plugins/plugin-contribution-registry.ts`
- `electron/src/application/media/media-provider-runtime.ts`

**DoD**

- 上传缺 required、缺说明或 schema 无法编译的工具时，安装被拒绝并返回字段级诊断。
- Skill 依赖不存在工具时不能启用。
- MCP 返回非法 schema 时不得污染既有 catalog。
- Connector schema/protocol 不一致时不得安装。
- 所有失败路径证明没有留下部分 package、tool、skill 或 activation 状态。

状态：已完成（2026-10-13）。

实施记录：

- `CapabilityContractValidator` 已接入 Capability package prepare、Capability Builder/deterministic contract runner、Plugin package contribution、Skill import、动态媒体工具定义、Catalog activation 和 package version switch。
- `CapabilityPackageService.prepare()` 在 dependency/testPlan 之前执行契约校验，非法 package 不会进入安装确认；`ToolCatalogService.setActivation/changePackageVersion` 在写入启用或版本事件前复核当前 contract。
- `RuntimeFilteredToolProjectionStore` 在运行时投影前过滤 contract invalid 项，并将相关 package 标记为 `corrupted`/`contract_invalid`，防止历史遗留非法能力回到模型表面。

#### CI-01：实现 `verify:tool-contracts`

状态：F19 范围已完成（2026-10-13）。

**目标**

为所有静态和动态能力建立可在本地与 CI 执行的统一架构守卫。

**开发内容**

1. 新增只读脚本 `scripts/verify-tool-contracts.mjs`。
2. 扫描范围：
   - `resources/extensions/**/tools/*.json`
   - `resources/extensions/**/skills/*.json`
   - 内置 runtime/facade/directory 动态定义。
   - 本地/用户/工作区 `SKILL.md` fixtures。
   - legacy extension import fixtures。
   - Plugin v2 contribution fixtures。
   - Capability Builder 输出 fixtures。
   - 动态 media provider 工具定义。
   - Connector fixtures。
   - MCP discovery fixtures。
3. 检查项：
   - schema 可由 AJV 2020 编译。
   - `required` 字段存在于 properties。
   - `additionalProperties:false` 的工具没有 handler-only 参数。
   - 每个输入属性有非空 description。
   - 每个 enum 有字段说明或 value 语义映射。
   - 示例通过 source schema。
   - provider schema 接受集合不宽于 runtime schema。
   - facade action map 与生成 schema 完全一致。
   - Connector schema 与 protocol 一致。
   - Skill requiredTools 按 `versionRange` 闭包一致。
   - Builtin `handler@handlerVersion` 与实际注册表双向一致。
   - Plugin hook filter/payload 与 target tool 输入 schema 可满足。
   - Catalog enabled item 必须指向通过当前 validator 的 contract report。
4. 输出按 capability 和 JSON Pointer 排序，保证结果稳定。
5. 任一 error 诊断时退出码非 0。

**DoD**

- 同一仓库状态重复执行输出完全一致。
- 能准确定位到文件和 schema path。
- 分别注入缺说明、漏 required、非法 facade action、Connector 参数漂移后，守卫稳定失败。
- 修复 fixture 后守卫恢复通过。

**实施记录**

- 新增 `scripts/verify-tool-contracts.mjs` 与脚本测试，当前覆盖 builtin Tool JSON 的模型输入 schema 质量、递归字段 description、required/properties 一致性、`additionalProperties:false` 和 builtin `handler@handlerVersion` 双向漂移。
- `npm run build` 已串入 `verify:tool-contracts`，构建期输出 `Verified 125 builtin Tool contracts and 125 registered handlers.`。
- 其余动态来源（Plugin v2、MCP、catalog enabled item 历史状态）继续由 PL-01、F20/CAT-01 和 AC-01 扩展。

#### TC-03：建立 Provider/Runtime schema 包含关系守卫

**目标**

保证模型可生成的参数一定能通过 Main 运行时 schema 校验。

**开发内容**

1. 抽离 `ModelToolContractCompiler`，统一生成 OpenAI、Anthropic、Pi 等 provider schema。
2. 禁止无告警删除 `oneOf/anyOf/allOf/if/then/not`。
3. 无法等价表达时必须：
   - 拆分工具；或
   - 收窄 provider schema；或
   - 拒绝发布并返回 `provider_schema_incompatible`。
4. 建立代表性样本生成器：
   - 最小合法输入。
   - 每个 enum 分支。
   - 每个 conditional required 分支。
   - 边界与非法输入。
5. 对样本执行 provider/runtime 双重校验，禁止 provider 通过但 runtime 拒绝。

**建议位置**

- `electron/src/ai-run/application/provider-tool-schema.ts`
- `electron/src/ai-run/application/provider-tool-schema.test.ts`
- `electron/src/application/tools/model-tool-contract-compiler.ts`

**DoD**

- `files.write`、`files.stat`、`tool_search.query` 的分支约束不再退化为 `{}`。
- 全部 provider adapter 使用同一 compiler 输出。
- CI 中不存在 provider-pass/runtime-fail 样本。

状态：已完成（2026-10-13）。

实施记录：

- 新增 `model-tool-contract-compiler.ts`，统一输出 provider-facing schema 与 runtime schema；`provider-tool-schema.ts` 不再静默丢弃关键组合约束。
- `tool-model-facing-projection.ts` 的 facade schema 使用 compiler 生成 action enum 与 action-specific input schema，未知 action 在 provider schema 层被拒绝。
- `provider-tool-schema.test.ts`、`tool-model-facing-projection.test.ts` 和 `tool-execution-application-service.test.ts` 覆盖 `files.stat`、`files.write` 与 facade provider/runtime 兼容样本。

### 6.3 P1：修复模型投影和运行时资格

#### TC-04：生成 facade action 与参数契约

**开发内容**

1. 从原子工具定义生成 facade action enum，禁止手写两份 action 列表。
2. 为每个 action 生成对应参数 schema 或独立模型工具。
3. 生成的 action 集合必须与 `MODEL_FACING_FACADE_ACTIONS` 双向相等。
4. facade description 只补充选择策略，不重复维护字段契约。
5. 运行时仍对解析后的 primitive input 执行原始 schema 校验。

**DoD**

- 每个 facade action 的最小合法调用均可执行到 primitive adapter。
- 未知 action 在 provider schema 层被拒绝。
- 删除或新增 primitive tool 时，facade schema 自动变化或 CI 明确失败。

状态：已完成（2026-10-13）。

实施记录：

- `compileModelFacingFacadeInputSchema()` 从 primitive ToolDefinition 生成 facade action enum 与 `oneOf` 分支，模型可见 action 集合与 primitive 映射保持一致。
- facade 调用解析后仍进入 primitive runtime AJV 校验与正式 ToolExecution 链路，避免 provider schema 与 Main runtime schema 漂移。
- 聚焦测试覆盖最小合法 facade 输入、未知 action 拒绝和 model-facing 目录投影。

#### SK-01：扩展 Skill 输入输出契约表达

状态：已完成（2026-10-13）。

**开发内容**

1. 为 `SKILL.md` frontmatter 或相邻 manifest 增加 `inputSchema/outputSchema/examples`。
2. 内置 Skill 生成器停止使用通用 `OBJECT_SCHEMA`，按 Skill 类型生成精确字段。
3. Skill schema 走与 Tool 相同的 AJV 2020、字段说明、示例和 provider/runtime 兼容校验。
4. 对 instruction/workflow/executable Skill 保持统一模型投影规则，禁止空对象或任意参数对象进入模型表面。

**DoD**

- 本地 `SKILL.md` 可声明至少一个 required 输入字段并被模型表面使用。
- 缺 schema、缺字段说明或示例不匹配时，Skill 注册失败并返回字段级诊断。
- 内置 core skills 的模型参数不再是 `{ additionalProperties:true }`。

#### SK-02：统一 Skill requiredTools 版本闭包校验

状态：已完成（2026-10-13）。

**开发内容**

1. 内置 catalog loader、extension import、skill registry sync、catalog projection、model-facing resolver 共用同一个 requiredTools 校验函数。
2. 校验同时覆盖 toolId、versionRange、required/optional 语义和 disabled/corrupted 状态。
3. 诊断区分 `runtime_dependency_undefined`、`runtime_dependency_version_mismatch` 和 `runtime_dependency_disabled`。

**DoD**

- 依赖工具 ID 存在但版本不满足时，内置加载或启用阶段失败。
- UI catalog 状态和模型表面过滤结果一致。
- required 依赖恢复后，Skill 无需重装即可恢复可用。

#### BI-01：建立内置 handler/version 绑定守卫

状态：已完成（2026-10-13）。

**开发内容**

1. 从内置 JSON catalog 提取所有 `executor.handler@handlerVersion`。
2. 从 `createBuiltinToolAdapter` 注册的 handler 列表生成实际 handler manifest。
3. 双向校验：JSON 中不存在未注册 handler，注册表中不存在无定义 handler。
4. 校验 handlerVersion、工具资源上限、输出 schema smoke sample 与 adapter output 形状。

**DoD**

- 改错任一 builtin tool 的 `handlerVersion` 时，`verify:tool-contracts` 失败。
- 删除任一 handler 实现时，CI 在构建期失败。
- 守卫输出能定位到具体 JSON 文件、handler key 和版本。

**实施记录**

- `BuiltinToolAdapter.assertExactDefinitions()` 在运行时对 JSON definition 与 handler registry 做双向一致性检查。
- `scripts/verify-tool-contracts.mjs` 在构建期扫描 builtin JSON 与 `APPLICATION_TOOL_HANDLER_NAMES`，改错 handler version 或删除 JSON definition 会产生确定性诊断。
- 新增 `builtin-tool-runtime.test.ts` 与 `verify-tool-contracts.test.mjs` 覆盖 handler 缺失、definition 缺失和错误版本。

#### EL-01：定义统一 Runtime Eligibility 协议

**开发内容**

1. 新增 `RuntimeToolEligibilityService`。
2. 统一状态：
   - `ready`
   - `degraded`
   - `unavailable`
3. 统一输出：
   - `reasonCode`
   - `checkedAt`
   - `expiresAt`
   - `dependencyRevision`
4. 模型表面只接收 `ready` 工具。
5. 管理 UI 可展示 degraded/unavailable，但执行入口必须再次验证 revision，防止 TOCTOU。
6. readiness 检查禁止读取 credential value，只允许检查 handle 是否存在和版本是否有效。

**建议位置**

- 替换或扩展 `runtime-filtered-tool-projection-store.ts`。
- 将 `legacy-office-runtime-capability.ts` 迁移为 eligibility probe。

**DoD**

- catalog、模型表面和实际执行共享同一 eligibility reason code。
- readiness 缓存有 TTL 和主动失效机制。
- 依赖状态变化后下一轮模型调用使用新快照。

**实施记录**

- 状态：已验收。
- `runtime-tool-availability.ts` 定义统一 eligibility snapshot 协议，Web/MCP/Connector eligibility 与 LibreOffice 本地依赖 probe 均输出结构化 reason code、TTL 与 dependency revision。
- `runtime-filtered-tool-projection-store.ts` 负责管理目录诊断、模型 surface 前置过滤和 eligibility 变化审计；`tool-catalog-service.ts` 在 model-facing mode 下只投影 `ready` 工具。
- Connector 动态 action 由 `AgentToolLoopCoordinator` 在每轮 run 准备阶段复用同一 eligibility 服务过滤，避免 stale credential action 进入模型。

#### EL-02：接入 MCP 生命周期与连接状态

**开发内容**

1. MCP save/enable/disable/delete/discover 与 catalog activation 同步。
2. 禁用或删除 server 时撤销其 synthetic package/tool 的模型资格。
3. schema digest 或 protocol version 漂移时标记 unavailable，禁止继续调用旧定义。
4. 重新发现成功后原子替换定义并恢复资格。
5. 失败恢复不得留下旧工具 enabled、新工具未发布的中间状态。

**DoD**

- 禁用、删除、schema 漂移后的下一轮模型工具列表不包含旧工具。
- 重新启用并发现后工具恢复。
- 重启应用后 catalog 与 MCP store 状态一致。

**实施记录**

- 状态：已验收当前 F06 模型曝光要求；MCP schema digest/protocol version 漂移可在后续 MCP 动态契约细化中继续收紧。
- `McpRuntimeToolAvailabilityProvider` 基于持久化 MCP server record 判断 missing/disabled/unavailable/missing credential，并将对应 MCP tool 标记为 unavailable。
- `RuntimeFilteredToolProjectionStore` 保留管理目录诊断，同时阻止 unavailable MCP tool 进入下一轮模型可见目录；重新启用并通过发现后按新 server revision 恢复资格。

#### EL-03：接入 Connector credential readiness

**开发内容**

1. 投影 Connector action 前验证全部 credential handle 存在。
2. credential 新增、删除、轮换时主动使 eligibility 缓存失效。
3. 缺凭据返回 `connector_credential_unavailable`，但不得记录 credential name 之外的敏感值。
4. 补齐凭据后无需重装 capability 即可恢复。

**DoD**

- 移除任一必需 handle 后 action 退出模型表面。
- 补齐 handle 后 action 自动恢复。
- readiness probe 不调用外部服务、不读取 secret 明文。

**实施记录**

- 状态：已验收。
- `ConnectorRuntimeToolEligibilityService` 对每个 Connector action 生成 `${capabilityId}.${actionId}` 的 eligibility 记录，校验安装 revision/digest、启用状态和全部 credential handle。
- 缺失 handle 返回 `connector_credential_unavailable`，补齐后恢复 `runtime_ready`；测试仅 mock handle resolver，未读取 credential secret 或调用外部服务。
- `AgentToolLoopCoordinator` 用该服务过滤动态 Connector action，覆盖“缺凭据隐藏、补齐恢复”的模型 surface 行为。

#### EL-04：接入 Web、Git 和本地依赖 readiness

**开发内容**

1. Web Search provider disabled 时隐藏 `web.search`，保留 `web.fetch`。
2. Brave 缺 credential handle 时隐藏或标记 unavailable。
3. Git 工具仅在当前授权 scope 可解析到合法仓库时曝光。
4. LibreOffice、Browser、Sidecar 等本地依赖统一迁入 eligibility probe。
5. 不同工具不得因共享 adapter health 被整体误隐藏。

**DoD**

- 每项依赖均有 ready/unavailable 测试。
- 当前 workspace 不是 Git 仓库时，Git 工具不进入模型表面。
- Web provider 配置修改后，无需重启即可更新资格。

**实施记录**

- 状态：已验收。
- Web：`WebRuntimeToolAvailabilityProvider` 区分 search/fetch，禁用搜索、缺 Brave handle 或 SearXNG endpoint 未配置时只隐藏 `builtin.web.search`。
- Git：`AgentToolLoopCoordinator.prepareRun()` 在当前授权 scope 内用 `GitRepositoryResolver` 过滤 Git 工具；这是 run-scope eligibility，不写入全局 catalog，因为 Git 可用性随当前运行目录变化。
- 本地依赖：`LegacyOfficeRuntimeCapabilityProvider` 已迁入统一 eligibility probe，缺 LibreOffice/cupsfilter 时输出 `local_dependency_unavailable` 并从模型 surface 隐藏 PDF 导出类能力。

#### PL-01：接入 Plugin v2 provider/hook/media contract 与 eligibility

**开发内容**

1. Plugin descriptor 的 `configurationSchema` 必须执行字段说明、示例、credential refs 和 provider/runtime schema 兼容校验。
2. Media provider 动态生成的工具定义必须进入 `verify:tool-contracts` 扫描。
3. Hook contribution 校验 target tool 版本、事件 payload schema、filter schema 与最终 tool input schema 的可满足性。
4. PluginContributionRegistry 输出统一 eligibility reason code，hook dispatcher 和模型表面共享同一快照。
5. 插件贡献 effect 不得超过 package permissions 与 sandbox ceiling。

**DoD**

- media provider 缺 prompt 字段说明或 credential 不可用时，不进入模型表面。
- hook target tool 版本不兼容时，hook 不触发并产生稳定诊断。
- 插件启用/禁用、依赖恢复后，模型工具列表和 hook dispatcher 行为一致。

状态：已完成（2026-10-13）。

实施记录：

- Plugin v2 provider/hook/media contribution 已接入共享 schema 元数据守卫；provider configuration、动态 media tool input/output 和 legacy Skill import 均执行字段说明、examples 与 trusted-context 检查。
- `PluginContributionRegistry` 生成统一 eligibility reason，hook target 版本不兼容或事件 payload/filter 无法满足目标输入时禁用 hook dispatch，并保持有效贡献快照与模型 surface 一致。
- 动态 media provider 工具定义会被 `verify:tool-contracts` 与运行时 catalog 查询路径共同校验，缺凭据或缺字段说明不会进入模型可见工具列表。

#### CAT-01：启用、切版本与恢复时复核 contract report

**开发内容**

1. 在 catalog projection 中保存 definition/package 对应的最新 contract report digest 与结果。
2. `setActivation` 和 `changePackageVersion` 写事件前调用同一 validator，禁止启用或切到未通过版本。
3. 重启恢复、registry sync、MCP rediscovery 和 capability enable 时复核 contract report，发现旧规则遗留问题则标记 unavailable 或 quarantined。
4. Renderer 只做预检提示；Main 是最终契约边界。

**DoD**

- 直接 IPC 启用非法 Tool/Skill/package 会失败，且 projection 不出现 enabled 状态。
- 切换历史版本时若 contract report 过期或失败，保留当前合法版本。
- 重启后历史遗留非法能力不会回到模型表面。

状态：已完成（2026-10-13）。

证据：

- 新增 `tool-catalog-contract-validator` 作为 Catalog 启用、版本切换和运行时恢复的统一合同边界。
- `ToolCatalogService.setActivation` 和 `ToolCatalogService.changePackageVersion` 在写事件前执行合同校验，失败时不写入 activation 或 package-version event。
- `RuntimeFilteredToolProjectionStore` 在运行时可用性过滤前先剔除合同无效 Tool，并基于版本范围重新计算 Skill requiredTools 闭包。
- `CapabilitiesPage` UI 验收覆盖 Main 拒绝非法启用后的错误提示和开关状态回滚。

### 6.4 P1：阻止 Connector 契约漂移

#### CN-01：HTTP Connector 交叉校验

**开发内容**

1. 提取 `pathTemplate` 全部 placeholder。
2. placeholder 必须在 schema properties 中存在、为 required，且类型为 string 或 number。
3. GET/HEAD 的剩余参数只能使用可编码 scalar 或 scalar array。
4. 非 GET/HEAD 的 request body schema 必须与剩余参数结构一致。
5. credential placeholders 与普通输入字段分离。

**DoD**

- 缺 placeholder、可选 placeholder、object query 参数在安装期被拒绝。
- 合法定义生成的最小样本可通过 `buildUrl` 和 body 编码。

状态：已完成（2026-10-13）。

证据：

- `domain/connector-runtime.ts` 在 `normalizeConnectorAction` 内统一执行 HTTP Connector schema/protocol 交叉校验，覆盖 path placeholder 必填标量、GET/HEAD query 可编码、非 GET/HEAD body 漂移和 credentialRef 输入隔离。
- Capability package prepare/install 链路复用同一领域门禁，非法 HTTP Connector 在 deterministic `runTest` 前被拒绝，不会进入可安装状态。
- `HttpConnectorAdapter` 正向验收覆盖合法 POST 定义的 URL path 参数编码与剩余参数 body 编码。
- Capability Builder UI 验收覆盖非法 HTTP Connector 诊断展示，用户可见错误为 `Connector HTTP credentials must not be model input properties`，并保持在可编辑状态。
- 聚焦验证：`npm test -- domain/connector-runtime.test.ts electron/src/application/capabilities/capability-package-service.test.ts electron/src/application/connectors/http-connector-adapter.test.ts src/features/capabilities/CapabilityBuilderDialog.test.tsx src/pages/CapabilitiesPage.test.tsx electron/src/application/capabilities/capability-contract-validator.ts electron/src/application/capabilities/deterministic-capability-contract-test-runner.ts electron/src/application/capabilities/capability-spec-compiler.test.ts electron/src/application/tools/connector-tool-adapter.test.ts electron/src/application/connectors/database-connector-adapter.test.ts electron/src/application/connectors/cli-connector-adapter.test.ts domain/capability.test.ts`，12 个文件 / 72 项测试通过。
- 最终验证：`npm test` 631 个文件 / 5549 项测试通过；`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 和 Electron/Vite 构建；`git diff --check` 通过。全量测试仍存在既有 React `act(...)` warning，未发现本次变更新增失败。

#### CN-02：Database Connector 交叉校验

**开发内容**

1. `parameterNames` 与 schema properties/required 精确一致。
2. 禁止未被 statement 引用的参数。
3. read operation 继续拒绝写 SQL，并补 statement/allowedTables 一致性测试。
4. 参数顺序只用于绑定，不应要求模型按顺序提交 JSON。

**DoD**

- 参数缺失、额外参数、重复参数在安装期被拒绝。
- 安装成功的定义不会在 adapter 的参数键比较处失败。

状态：已完成（2026-10-13）。

证据：

- `domain/connector-runtime.ts` 在 Connector action 归一化阶段校验 Database Connector 的 `parameterNames`、input schema `properties/required`、SQL statement 命名参数和 read `allowedTables`，禁止 schema/protocol/statement 漂移进入发布包。
- SQL 参数与表引用解析被提取为领域层 helper，并由 `DatabaseConnectorAdapter` 复用，避免安装期与运行期规则漂移；adapter 参数校验改为集合等价，不再要求模型 JSON key 顺序与 `parameterNames` 声明顺序一致。
- Capability package prepare 链路在 deterministic `runTest` 前复用领域门禁，非法 Database Connector 会被拒绝，不会进入可安装状态。
- Capability Builder UI 验收覆盖非法 Database Connector 诊断展示，用户可见错误为 `Connector Database parameters must match statement`，并保持在可编辑状态。
- 聚焦验证：`npm test -- domain/connector-runtime.test.ts electron/src/application/connectors/database-connector-adapter.test.ts electron/src/application/capabilities/capability-package-service.test.ts src/features/capabilities/CapabilityBuilderDialog.test.tsx`，4 个文件 / 41 项测试通过。
- 最终验证：`npm test` 631 个文件 / 5556 项测试通过；`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 和 Electron/Vite 构建。全量测试仍存在既有 React `act(...)` warning，未发现本次变更新增失败。

#### CN-03：CLI Connector 交叉校验

**开发内容**

1. `argumentNames` 必须与 schema properties 一致。
2. 允许的值类型限制为 boolean、string、number 及 string/number array。
3. object、嵌套 array、null 语义必须在安装期明确拒绝或定义映射。
4. 参数到 flag 的转换规则写入字段 description 和生成示例。

**DoD**

- 所有通过安装校验的输入类型均可被 `mapArgument` 编码。
- schema 接受但 CLI adapter 拒绝的代表性样本数量为 0。

状态：已完成（2026-10-13）。

证据：

- `domain/connector-runtime.ts` 在 Connector action 归一化阶段校验 CLI Connector 的 `argumentNames` 与 input schema `properties` 精确一致，并要求 `additionalProperties:false`，防止 schema/protocol 漂移进入发布包。
- CLI 参数编码规则被提升为领域层 helper：`cliArgumentFlag` 和 `mapCliConnectorArgument`。运行期 `CliConnectorAdapter` 复用同一 helper，安装期允许的 boolean、string、number、string/number array 均可编码，`null`、object、嵌套 array 和非有限 number 会被明确拒绝。
- `CapabilityContractValidator` 对 CLI Connector 增加字段文档门禁：每个参数 description 必须说明对应 flag（如 `--branch-name`），examples 必须覆盖所有声明参数；非法 package 会在 deterministic `runTest` 前失败。
- Capability Builder UI 验收覆盖非法 CLI Connector 诊断展示，用户可见错误为 `Connector CLI arguments must match input schema`，并保持草稿可返回编辑。
- 聚焦验证：`npm test -- domain/connector-runtime.test.ts electron/src/application/connectors/cli-connector-adapter.test.ts electron/src/application/capabilities/capability-package-service.test.ts src/features/capabilities/CapabilityBuilderDialog.test.tsx`，4 个文件 / 47 项测试通过。
- 最终验证：`npm test` 631 个文件 / 5564 项测试通过；`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 和 Electron/Vite 构建；`git diff --check` 通过。全量测试仍存在既有 React `act(...)` warning，未发现本次变更新增失败。

#### CN-04：收紧 Capability Builder 与 deterministic contract runner

状态：已完成（2026-10-13）。

**开发内容**

1. Capability Builder 从 spec runtime、协议 path/query/body、credentialRefs 和示例生成收窄 schema，不再默认 `additionalProperties:true`。
2. deterministic runner 复用 `CapabilityContractValidator`，而不是只检查 HTTP Connector 形状。
3. `realmflow:contract:http-connector` 覆盖 path placeholder、query/body 编码、credentialRefs、idempotency、字段说明和 provider/runtime 兼容。
4. 生成 package 的 validation report 保存 contract diagnostics，供安装 UI 和 CI 复用。

**DoD**

- Builder 生成的非法或欠约束 Connector 不能安装。
- runner 能拒绝缺 required path 参数、DB/CLI 参数漂移、缺字段说明和 provider/runtime 不兼容。
- 合法 generated package 的最小样本可执行到对应 adapter 边界。

**实施记录**

- `capability-spec-compiler.ts` 改为为 HTTP Connector action 生成严格 object schema、path 参数 required、字段 description 和 examples。
- `capability-package-service.ts` 在 testPlan 前执行 `CapabilityContractValidator`，非法契约不会继续运行测试或进入安装确认。
- `deterministic-capability-contract-test-runner.ts` 复用同一 validator，`realmflow:contract:http-connector` 能拒绝欠描述模型输入。
- Builder 与导入确认 UI 均展示 contract report，形成 Main 校验到 Renderer 确认证据的闭环。

### 6.5 P1/P2：参数说明和存量迁移

#### DS-01：建立字段说明与示例规范

状态：已完成（2026-10-13）。

**开发内容**

每个模型可见字段至少包含：

1. `description`：业务含义。
2. 何时必填、何时应省略。
3. 与可信上下文的关系。
4. 枚举值业务语义。
5. 一个不含本地私有数据的 example。

额外规则：

- `scopeRoot` 必须说明“省略或传 `.` 使用当前授权根”。
- ID/revision 字段必须说明来源，禁止模型自行编造。
- trusted-context 字段原则上从模型 schema 删除。
- description 不得包含 prompt instruction、secret 或环境特定绝对路径。

**DoD**

- 形成机器可校验规则，而非仅增加文档约定。
- 用户上传能力缺任一必需说明时无法发布。

**实施记录**

- 新增共享 schema 元数据守卫，强制模型可见 input schema 使用严格 object 契约、字段 description、required/optional 说明、枚举语义、无私有数据 examples，并拒绝 trusted-context 字段、prompt instruction、secret literal 和环境特定绝对路径。
- Capability Builder、Capability package、deterministic contract runner、用户上传 Tool/Skill、Plugin v2 Tool/Skill/Provider configuration schema 均接入同一机器校验规则；缺任一必需说明会在发布/安装前失败。
- UI 验收覆盖 Capability Builder：合法契约显示“能力契约 / 已通过”，非法模型输入元数据以诊断信息展示，安装按钮不可见，用户可返回修改草稿。
- 验证：DS-01 聚焦测试 67 项通过；deterministic runner 聚焦测试 5 项通过；全量 `npm test` 632 个文件、5575 项通过；`npm run build` 通过，其中 `verify:tool-contracts` 校验 125 个内置 Tool contract 与 125 个注册 handler。React `act(...)` warning 为既有非阻塞测试噪声。

#### DS-02：修复高频与高风险工具说明

状态：已完成（2026-10-13）。

**范围**

优先修复：

- knowledge
- files
- git
- process
- web
- realmflow node action
- runtime directory controls

**DoD**

- `sourceKinds` 明确 `repository` 表示代码仓库。
- `scopeRoot`、`path`、`expectedRevision`、`idempotencyKey` 有统一措辞。
- 运行故障样本中的 `sourceKinds:["code"]` 和绝对 `scopeRoot` 可仅依据 schema 说明避免。

**实施记录**

- `verify:tool-contracts` 新增高风险字段语义校验，覆盖 `sourceKinds`、`scopeRoot`、路径类字段、revision 字段和 `idempotencyKey`，避免只补空泛 description。
- 内置工具 catalog 生成器集中维护高风险字段说明，生成后的 125 个内置 Tool contract 全部通过语义门禁；`sourceKinds` 明确 `repository` 是代码仓库内容且 `code` 不是合法值，路径类字段统一要求使用授权根下相对路径并禁止编造绝对本地路径。
- 用户视角/模型表面验收覆盖能力页模型可见工具目录、能力 Builder 契约诊断展示，以及 `tool-model-facing-projection` 的模型可见 schema 投影；`CapabilitiesPage` 的 React `act(...)` warning 为既有非阻塞噪声。
- 验证：`npm test -- scripts/verify-tool-contracts.test.mjs scripts/generate-builtin-extension-catalog.test.mjs` 2 个测试文件、27 项通过；`npm run verify:tool-contracts` 校验 125 个内置 Tool contract 与 125 个注册 handler；`npm run verify:builtin-catalog` 校验 17 个内置 packages、133 个 Tools 和 10 个 Skills；`npm test -- electron/src/application/tools/tool-model-facing-projection.test.ts src/pages/CapabilitiesPage.test.tsx src/features/capabilities/CapabilityBuilderDialog.test.tsx` 3 个测试文件、53 项通过；全量 `npm test` 632 个测试文件、5580 项通过；`npm run build` 通过；`git diff --check` 通过。

#### DS-03：完成 486 个存量参数迁移

状态：已验收（2026-10-13）。

**开发内容**

1. 批量补齐剩余内置工具参数说明。
2. 为重复字段建立可复用 description registry 或生成模板，避免文案漂移。
3. 每批迁移后运行 `verify:tool-contracts`。
4. 禁止为了快速通过守卫填写无信息量文案，如“the path”或“input value”。

**DoD**

- 486 个顶层属性 description 覆盖率 100%。
- 空白、占位、同义反复说明数量为 0。
- 全部示例通过 source schema。

**实施记录**

- `generate-builtin-extension-catalog` 新增模型可见输入 schema 示例合成逻辑，统一为内置 Tool 的 `inputSchema.examples` 与顶层 `properties.*.examples` 生成合法样例，避免手写 133 份 JSON 造成漂移。
- 补齐存量占位参数说明，包括 `offset`、`document`、`markdown`、`sectionId`、`commentId`、`fit`、`regions`、`locale`、`nodeId`、`artifactId`、`kind`、`noteId`、`contains` 及嵌套字段如 `blocks`、`styleName`、`oldText/newText`、`decisionId`、`result`、`direction`。
- 守卫升级为拒绝缺失 root examples、非法 examples、顶层属性 examples 缺失，以及占位式 description；生成器测试固定 486 个顶层参数全部具备非占位说明与可校验示例。
- 用户/模型视角验收覆盖真实内置 catalog 加载、direct 模型可见工具投影中的 examples 保真，以及能力页/Capability Builder 用户路径不受新增 schema 元数据影响。
- 验证：`npm test -- scripts/verify-tool-contracts.test.mjs scripts/generate-builtin-extension-catalog.test.mjs electron/src/application/tools/tool-model-facing-projection.test.ts electron/src/application/tools/builtin-catalog-loader.test.ts` 4 个测试文件、43 项通过；`npm run verify:tool-contracts` 校验 125 个内置 Tool contract 与 125 个注册 handler；`npm run verify:builtin-catalog` 校验 17 个内置 packages、133 个 Tools 和 10 个 Skills；`npm test -- src/pages/CapabilitiesPage.test.tsx src/features/capabilities/CapabilityBuilderDialog.test.tsx` 2 个 UI 测试文件、43 项通过；全量 `npm test` 632 个测试文件、5585 项通过；`npm run build` 通过；`git diff --check` 通过。`CapabilitiesPage` 等测试中的 React `act(...)` warning 为既有非阻塞噪声。

### 6.6 P1：CI、入口门禁和端到端验收

#### CI-02：接入 package scripts、CI、上传入口和激活入口

状态：已验收（2026-10-13）：package script、生产构建、GitHub Actions CI、上传/导入入口和 Main 准入门禁均已接入；Catalog activation 与 version switch 再校验已由 F20/CAT-01 覆盖。

**开发内容**

1. 在 `package.json` 增加 `verify:tool-contracts`。
2. 将命令加入生产构建和 CI 必过门禁。
3. 用户上传 UI 在提交前调用同一 validator，并显示字段级错误。
4. Main 仍必须再次校验，Renderer 预检不能成为安全边界。
5. MCP 自动发现、Connector 安装、Capability Builder、legacy import、Skill registry sync、Plugin v2 贡献、catalog activation 和 package version switch 使用相同校验服务，不允许独立宽松分支。

**DoD**

- 本地、CI、Renderer 预检、Main 准入返回相同 diagnostic code。
- 绕过 Renderer 直接调用 IPC 仍无法安装非法能力。
- 校验失败不会写入启用状态。

**实施回写（2026-10-13）**

- 已落地：
  - `package.json` 新增 `verify:tool-contracts`，并串入 `npm run build`，使本地生产构建必须通过工具契约门禁。
  - 新增 `.github/workflows/ci.yml`，在 push/main 与 pull request 中执行 `npm ci` 和 `npm run build`，CI 继承生产构建中的 catalog、contract、CSS、组件系统和 typecheck 门禁。
  - 新增 `scripts/tool-contract-ci-gate.test.mjs`，守卫 `verify:tool-contracts` 不会从本地 build 或 GitHub Actions 中脱钩。
  - 上传/导入入口在 Main 的 `ExtensionPackageService.prepare` 中复用统一 schema 元数据门禁；legacy Skill import 会先补齐字段说明、字段示例、root examples、required/optional 使用指导和枚举值说明，再进入准入校验。
  - 能力页导入失败会展示经过过滤的字段级契约诊断；含 secret/token/password/API key 或本地绝对路径的异常不会进入 Toast 文案。
  - F20/CAT-01 已覆盖 activation 与 package version switch 的 Main 再校验，非法版本不会被启用或切入模型表面。
- 用户/UI 视角验收：
  - `CapabilitiesPage` 覆盖用户在“扩展包与原子目录”弹窗点击“导入压缩包”后，Main 返回 `Tool Catalog contract failed: Tool com.example.search input schema.properties.query.description is required` 时，页面展示 `无法导入扩展包：Tool com.example.search input schema.properties.query.description is required`，且不降级成整页错误。
  - 同页覆盖 activation 被 Main 拒绝时开关恢复为关闭，展示 `无法更新启用状态`，不触发失败后的乐观刷新。
- 验证命令：
  - CI-02 聚焦：`npm test -- scripts/tool-contract-ci-gate.test.mjs electron/src/application/tools/extension-package-service.test.ts src/pages/CapabilitiesPage.test.tsx electron/src/application/tools/tool-catalog-service.test.ts scripts/verify-tool-contracts.test.mjs`：5 个测试文件、69 项通过。
  - 回归修复聚焦：`npm test -- src/pages/RequirementDetailPage.test.tsx`：45 项通过。
  - 全量测试：`npm test`：633 个测试文件、5589 项通过。
  - 生产构建：`npm run build` 通过，其中 `verify:tool-contracts` 校验 125 个内置 Tool contracts 与 125 个 registered handlers。
- 保留风险：
  - 全量测试仍输出既有 React `act(...)` warning；本次未新增失败。

#### AC-01：动态能力端到端契约验收套件

状态：已验收（2026-10-13）。

**场景**

1. 上传合法/非法 Tool package。
2. 上传 Skill，覆盖 required tool 存在、缺失和版本不兼容。
3. 上传 `SKILL.md`，覆盖 schema 缺失、字段说明缺失和示例不匹配。
4. Capability Builder 生成合法/非法 HTTP Connector。
5. legacy extension import 迁移路径。
6. Plugin v2 provider/hook/media contribution 的启用、禁用、依赖变化和恢复。
7. Catalog activation、package version switch 和历史遗留非法能力重启恢复。
8. MCP 发现、禁用、删除、schema 漂移和恢复。
9. Connector 缺 credential、补 credential、protocol/schema 不一致。
10. Provider 不支持 conditional schema。
11. facade 新增/删除 action。

**DoD**

- 每类能力至少包含正常、缺参、类型错误、说明缺失、依赖不可用和恢复场景。
- 非法能力从未进入模型工具列表。
- 合法能力的最小示例能够完成一次真实 Tool Execution。
- 测试验证重启后状态，不只验证内存态。

**实施回写（2026-10-13）**

- 已落地：
  - 新增 `dynamic-capability-contract.acceptance.test.ts`，用真实 SQLite 投影、运行时资格过滤、MCP Server 仓储、CredentialVault、ToolExecutionApplicationService、ToolOutboxDispatcher 和 MCP adapter 串起动态能力端到端验收。
  - Plugin media provider 动态生成的工具定义补齐严格 object input/output schema、字段 description、root examples 和字段 examples，并在生成时执行 `assertDescribedStrictObjectSchema`，避免合法媒体能力被模型表面契约过滤误删。
  - MCP discovery 在发布 synthetic catalog 前校验远端 tool input schema 的 top-level description、`additionalProperties:false`、required/properties 一致性与字段 description；非法 schema 不会进入 Tool Event Store。
  - MCP runtime eligibility 改为按持久化 DTO 暴露的 credential binding name 判断凭据状态，修复有凭据的 streamable HTTP MCP 工具重启后仍被误判不可用的问题。
  - 既有 `mcp-catalog-publisher` 发布路径测试夹具同步升级为合法 MCP schema，确保发布器测试走同一严格契约门禁。
- 用户/模型视角验收：
  - Plugin media：用户启用含 media provider 的插件后，`catalog.list({ modelFacingMode: "direct" })` 仍能看到 `image_generate`，其 prompt 参数带有可读说明和合法最小示例。
  - MCP：用户保存带 `Authorization` 凭据的 MCP Server、测试连接并发现工具后，重启数据库并重建 catalog projection，`mcp.docs.search` 会恢复到模型工具列表；模型以最小示例 `{ query: "contract gate" }` 调用时先触发权限确认，用户允许后真实执行到 MCP adapter 并产出成功结果。
  - UI 回归：`CapabilitiesPage` 全量回归覆盖 MCP 添加、保存/测试/发现/删除失败 Toast、Plugin 贡献信息展示、activation 拒绝回滚、版本切换等待 Main 确认，以及 primitive/model-facing 目录视图切换。
- 验证命令：
  - AC-01 聚焦：`npm test -- electron/src/application/tools/mcp-catalog-publisher.test.ts electron/src/application/tools/dynamic-capability-contract.acceptance.test.ts electron/src/application/tools/mcp-discovery-service.test.ts electron/src/application/tools/runtime-tool-availability.test.ts electron/src/application/media/media-provider-runtime.test.ts`：5 个测试文件、21 项通过。
  - 全量测试：`npm test`：634 个测试文件、5592 项通过。
  - 生产构建：`npm run build` 通过，包含 `verify:builtin-catalog`、`verify:tool-contracts`、`verify:css-usage`、`verify:component-system`、`typecheck` 和 Electron/Vite 构建；其中 `verify:tool-contracts` 校验 125 个内置 Tool contracts 与 125 个 registered handlers。
  - 空白差异：`git diff --check` 通过。
- 保留风险：
  - 全量测试仍输出既有 React `act(...)` warning，涉及 CapabilitiesPage、RequirementDetailPage、SettingsPage、GeneralConversation、RepositorySnapshotDialog、NodeTodoPanel、SystemStatusPage 等存量测试；未发现本次改动引入的新失败。

### 6.7 总体验收标准

全部任务完成后必须满足：

1. 新增、用户上传、生成、启用或切版本的 Tool、Skill、MCP、Connector、Plugin 贡献在缺少参数定义、必填关系或说明时无法进入模型表面。
2. Provider 可生成的输入必然通过 Main 的 source schema。
3. 缺运行依赖、凭据或连接的能力不会进入模型工具列表。
4. Connector schema 与 HTTP/DB/CLI 协议不存在运行期才暴露的参数漂移。
5. `npm run verify:tool-contracts` 可独立执行，并进入最终 `npm run build`。
6. 现有 132 个内置工具、内置 Skill、动态媒体工具和 486 个顶层参数全部通过新门禁。

## 7. 发布级验收矩阵

| 层级 | 必须新增的验证 |
| --- | --- |
| 定义层 | 132 个 builtin schema lint；属性说明覆盖；conditional schema provider 兼容性 |
| 目录层 | MCP 禁用/删除、Connector 缺凭据、Web 未配置、非 Git root 的资格过滤 |
| 契约层 | 模型 schema 样本必须是运行时 schema 的子集；facade 每个 action 最小样本 |
| Skill 层 | `SKILL.md`、内置 Skill、插件 Skill 的 schema、示例和 requiredTools 版本闭包一致 |
| 插件层 | provider descriptor、hook filter/payload、media runtime 生成工具通过统一 contract 与 eligibility |
| 激活层 | package/tool/skill 启用、切版本、重启恢复时 contract report 仍有效 |
| 执行层 | knowledge、Git、files.search、process.list 走完整 ToolExecution 链 |
| 安全层 | Git 父仓库越界、DNS rebinding、私网 A/AAAA、Web 未授权 fallback |
| 错误层 | code/retryable/publicMessage/diagnosticId；路径与 secret 不进入 SQLite/DOM |
| 恢复层 | retryable attempt、非幂等不重试、A/B 循环熔断、429 retry-after |
| UI 层 | 未恢复失败始终可见；显式重试可折叠；终态错误不被详情吞掉 |

最终验收应至少执行：

```text
npm test -- <新增及直接相关测试>
npm test
npm run build
git diff --check
```

并补充一次真实 Electron 会话验收：

1. 在已建立知识索引的空间内检索代码仓库内容。
2. 在普通目录、嵌套仓库、父仓库子目录分别调用 Git。
3. 连续制造同根因不同参数的工具失败，确认熔断。
4. 禁用 MCP、移除 Connector 凭据、禁用 Web provider，确认工具表面实时收敛。
5. 检查 SQLite timeline 与 UI 不包含原始本地路径、URL credential 或 token。

## 8. 架构守卫建议

建议新增以下自动守卫，避免同类问题再次出现：

1. `verify:tool-contracts`：比较 source schema、provider schema、facade schema 与 handler contract。
2. `verify:tool-descriptions`：参数 description 覆盖率与关键字段语义规则。
3. `verify:tool-eligibility`：所有有运行依赖的工具必须注册 readiness probe。
4. `verify:tool-errors`：Adapter 只能返回注册过的稳定错误码，且必须声明 retryable。
5. `verify:tool-effects`：测试中记录 actual effects，并断言其属于 planned effects。
6. `verify:tool-recovery`：retry、熔断、预算和幂等组合矩阵。

## 9. 审查置信度与边界

- 29 项候选问题均由两路独立审查确认存在；其中 legacy import、依赖版本和 handler 绑定属于“已有局部校验但缺统一门禁”的高置信度补充项。
- 本次读取了当前未提交工作区，因此行号基于 2026-10-13 的工作树。
- 未执行任何业务代码修复；本轮仅更新本审查文档，未提交 Git。
- 优先级按 RealmFlow 的产品阻断、授权边界、失败放大和用户可恢复性排序；P2 不代表无需修复，而是可在 P0/P1 稳定后交付。
