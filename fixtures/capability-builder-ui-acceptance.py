from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "tmp" / "acceptance"

FIXTURE = """
const empty = async () => [];
const noop = async () => undefined;
const subscribe = () => () => undefined;
const catalog = { definitions: [], installations: [] };
let sequence = 0;
const definitionFor = (spec) => ({
  schemaVersion: 1,
  id: spec.id,
  kind: spec.kind,
  version: spec.version,
  source: 'generated',
  manifestDigest: 'a'.repeat(64),
  definitionDigest: 'b'.repeat(64),
  name: spec.name,
  description: spec.description,
  runtime: spec.runtime.kind === 'connector'
    ? {
        kind: 'connector',
        connectorKind: 'http',
        credentialRefs: spec.runtime.credentialRefs,
        configurationSchema: { type: 'object' },
        actions: [{ id: 'invoke' }]
      }
    : spec.runtime.kind === 'skill'
      ? { kind: 'skill', instructionsPath: 'SKILL.md', executable: false }
      : {
          kind: 'agent',
          promptPath: 'PROMPT.md',
          modelCapabilities: ['tool_calling'],
          reasoningModes: ['medium'],
          delegation: { allowed: false, maximumDepth: 0 }
        },
  permissions: spec.permissions,
  dependencies: [],
  compatibility: spec.compatibility,
  testPlan: [{ id: 'contract', command: 'fixture:contract' }],
  publishedAt: 100
});
const sessionFor = (command) => {
  sequence += 1;
  const definition = definitionFor(command.spec);
  const failed = command.request.includes('FAIL');
  return {
    id: `generation-${sequence}`,
    conversationId: command.conversationId,
    requestedBy: command.requestedBy,
    request: command.request,
    spec: { ...command.spec, specDigest: 'd'.repeat(64) },
    status: failed ? 'draft' : 'awaiting_approval',
    revision: 3,
    ...(failed
      ? {
          diagnostics: ['Capability package test failed: contract']
        }
      : {
          proposal: {
            id: `proposal-${sequence}`,
            packageDigest: 'c'.repeat(64),
            definitionDigest: definition.definitionDigest,
            scope: command.spec.scope,
            draftRevision: 1,
            definition,
            validationReport: {
              compatible: true,
              dependencyStatus: 'resolved',
              tests: [{ id: 'contract', status: 'passed' }]
            },
            fileNames: command.spec.kind === 'connector'
              ? ['README.md', 'capability.yaml']
              : command.spec.kind === 'skill'
                ? ['README.md', 'SKILL.md', 'capability.yaml']
                : ['PROMPT.md', 'README.md', 'capability.yaml'],
            byteSize: 256,
            fileCount: command.spec.kind === 'connector' ? 2 : 3,
            validatedAt: 120
          }
        }),
    createdAt: 100,
    updatedAt: 120
  };
};
window.__fixtureCatalog = catalog;
window.realmflow = {
  platform: 'darwin',
  getSidecarStatus: async () => 'ready',
  quitApp: noop,
  business: new Proxy({
    listConnectors: empty,
    listRecentConversations: async () => ({
      conversations: [],
      folderPaths: []
    }),
    onConversationEvent: subscribe
  }, {
    get: (target, property) => target[property] ?? empty
  }),
  workbenchHub: new Proxy({
    dashboard: new Proxy({}, { get: () => empty })
  }, {
    get: (target, property) =>
      target[property] ?? new Proxy({}, { get: () => empty })
  }),
  aiRuns: new Proxy({ onEvent: subscribe }, {
    get: (target, property) => target[property] ?? noop
  }),
  persistence: {
    load: async () => ({
      status: 'loaded',
      snapshot: { revision: 0, value: null }
    }),
    onChanged: subscribe
  },
  workspace: new Proxy({}, { get: () => empty }),
  webWorkbench: new Proxy({
    hideAll: noop,
    onStateChange: subscribe
  }, { get: (target, property) => target[property] ?? noop }),
  terminal: new Proxy({ onEvent: subscribe }, {
    get: (target, property) => target[property] ?? noop
  }),
  nativeOverlay: new Proxy({ onEvent: subscribe }, {
    get: (target, property) => target[property] ?? noop
  }),
  toolCatalog: {
    list: async () => ({ packages: [], tools: [], skills: [] }),
    listMcpServers: empty
  },
  capabilityCatalog: {
    list: async () => structuredClone(catalog)
  },
  capabilityBuilder: {
    createDraft: async (command) => sessionFor(command),
    getSession: async () => undefined,
    reviseDraft: async (command) => sessionFor({
      conversationId: 'capability-studio',
      requestedBy: 'local-user',
      request: command.request,
      spec: command.spec
    }),
    confirmInstall: async (command) => {
      const sessionDefinition = window.__lastBuilderDefinition;
      const definition = sessionDefinition ?? {
        ...definitionFor({
          id: 'com.example.issue-lookup',
          kind: 'connector',
          version: '1.0.0',
          name: '问题查询',
          description: '根据问题 ID 查询详情',
          runtime: {
            kind: 'connector',
            credentialRefs: ['issue-api-key']
          },
          permissions: {
            maximumRisk: 'medium',
            capabilities: ['network.connect', 'credential.use'],
            pathPrefixes: [],
            networkTargets: ['api.example.com']
          },
          compatibility: {
            realmflowVersionRange: '>=0.1.0',
            platforms: ['darwin']
          }
        })
      };
      const installation = {
        id: `installation-${definition.id}`,
        capabilityId: definition.id,
        capabilityVersion: definition.version,
        capabilityDigest: definition.definitionDigest,
        scope: command.scope,
        enabled: command.enable,
        permissionCeiling: definition.permissions,
        status: command.enable ? 'enabled' : 'installed_disabled',
        revision: 1,
        installedAt: 200,
        updatedAt: 200
      };
      catalog.definitions = [definition];
      catalog.installations = [installation];
      return { definition, installation };
    },
    cancel: async ({ sessionId, expectedRevision }) => ({
      id: sessionId,
      status: 'cancelled',
      revision: expectedRevision + 1
    })
  }
};
const originalCreate = window.realmflow.capabilityBuilder.createDraft;
window.realmflow.capabilityBuilder.createDraft = async (command) => {
  const session = await originalCreate(command);
  window.__lastBuilderDefinition = session.proposal?.definition;
  return session;
};
"""


def open_builder(page: Page) -> None:
    page.get_by_role("button", name="添加能力").click()
    page.get_by_role("menuitem", name="对话创建").click()
    page.get_by_role("dialog", name="对话创建能力").wait_for()


def fill_base(
    page: Page,
    *,
    name: str,
    capability_id: str,
    request: str,
) -> None:
    page.get_by_label("能力名称").fill(name)
    page.get_by_label("能力 ID").fill(capability_id)
    page.get_by_label("需求描述").fill(request)


def test_viewport(page: Page, width: int, height: int) -> None:
    page.goto("http://localhost:5173/#/capabilities")
    page.wait_for_load_state("networkidle")
    open_builder(page)
    fill_base(
        page,
        name="问题查询",
        capability_id="com.example.issue-lookup",
        request="根据问题 ID 查询详情",
    )
    page.get_by_label("服务地址").fill("https://api.example.com")
    page.get_by_label("请求路径").fill("/issues/{issueId}")
    page.get_by_label("凭据槽位").fill("issue-api-key")
    page.get_by_role("button", name="生成并验证").click()
    page.get_by_text("权限与验证").wait_for()
    assert page.get_by_text("issue-api-key").is_visible()
    assert page.get_by_text("2 个文件").is_visible()
    assert page.get_by_text("1 项测试通过").is_visible()
    assert page.evaluate("window.__fixtureCatalog.definitions.length") == 0
    assert page.evaluate("document.body.scrollWidth <= window.innerWidth")
    page.screenshot(
        path=SHOTS / f"epic-12-builder-{width}x{height}.png",
        full_page=True,
    )

    if width == 1280:
        page.get_by_role("button", name="仅安装").click()
        page.get_by_text("问题查询").wait_for()
        assert page.evaluate("window.__fixtureCatalog.definitions.length") == 1
    else:
        page.get_by_role("button", name="返回修改").click()
        page.get_by_label("请求方法").select_option("POST")
        page.get_by_role("button", name="生成并验证").click()
        install_enable = page.get_by_role("button", name="安装并启用")
        install_enable.wait_for()
        assert install_enable.is_disabled()
        assert page.get_by_role("button", name="仅安装").is_enabled()
        page.get_by_role("button", name="取消").click()

    open_builder(page)
    page.get_by_role("button", name="指令技能").click()
    fill_base(
        page,
        name="变更审查",
        capability_id="com.example.review-skill",
        request="审查变更并输出风险清单",
    )
    page.get_by_role("button", name="生成并验证").click()
    page.get_by_text("权限与验证").wait_for()
    assert page.get_by_text("3 个文件").is_visible()
    page.get_by_role("button", name="取消").click()

    open_builder(page)
    page.get_by_role("button", name="智能体").click()
    fill_base(
        page,
        name="审查智能体",
        capability_id="com.example.review-agent",
        request="协调代码审查并返回优先级结论",
    )
    page.get_by_role("button", name="生成并验证").click()
    page.get_by_text("权限与验证").wait_for()
    page.get_by_role("button", name="取消").click()

    open_builder(page)
    fill_base(
        page,
        name="失败连接器",
        capability_id="com.example.failed-connector",
        request="FAIL contract",
    )
    page.get_by_label("服务地址").fill("https://api.example.com")
    page.get_by_label("请求路径").fill("/issues")
    page.get_by_role("button", name="生成并验证").click()
    page.get_by_text("Capability package test failed: contract").wait_for()
    assert page.get_by_role("button", name="仅安装").count() == 0
    page.get_by_role("button", name="返回修改").click()
    assert page.get_by_label("需求描述").is_visible()
    page.get_by_role("button", name="取消").click()


def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        browser_errors: list[str] = []
        for width, height in ((1280, 800), (920, 760)):
            page = browser.new_page(viewport={"width": width, "height": height})
            page.on("pageerror", lambda error: browser_errors.append(str(error)))
            page.add_init_script(FIXTURE)
            test_viewport(page, width, height)
            page.close()
        browser.close()
        assert not browser_errors, browser_errors
    print("capability builder UI acceptance passed at 1280x800 and 920x760")


if __name__ == "__main__":
    main()
