from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "tmp" / "acceptance"

FIXTURE = """
const db = {
  id: 'db', kind: 'connector', version: '1.0.0', source: 'local_upload',
  name: 'Analytics DB', description: 'Connector package.',
  runtime: { kind: 'connector', connectorKind: 'database', actions: [{}, {}] },
  permissions: { maximumRisk: 'low' }
};
const mcp = {
  id: 'mcp', kind: 'connector', version: '1.0.0', source: 'mcp',
  name: 'Docs MCP', description: 'Connector package.',
  runtime: { kind: 'connector', connectorKind: 'mcp', actions: [{}, {}, {}] },
  permissions: { maximumRisk: 'low' }
};
const http = {
  id: 'http', kind: 'connector', version: '1.0.0', source: 'local_upload',
  name: 'CRM API', description: 'Connector package.',
  runtime: { kind: 'connector', connectorKind: 'http', actions: [{}] },
  permissions: { maximumRisk: 'medium' }
};
const cli = {
  id: 'cli', kind: 'connector', version: '1.0.0', source: 'local_upload',
  name: 'Release CLI', description: 'Connector package.',
  runtime: { kind: 'connector', connectorKind: 'cli', actions: [{}] },
  permissions: { maximumRisk: 'low' }
};
const install = (definition, status) => ({
  id: `installation.${definition.id}`,
  capabilityId: definition.id,
  capabilityVersion: definition.version,
  scope: { kind: 'global' },
  enabled: status === 'enabled',
  status,
  revision: 1
});
const empty = async () => [];
const noop = async () => undefined;
const subscribe = () => () => undefined;
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
    list: async () => ({
      definitions: [mcp, http, db, cli],
      installations: [
        install(mcp, 'enabled'),
        install(http, 'installed_disabled'),
        install(db, 'quarantined'),
        install(cli, 'enabled')
      ]
    })
  }
};
"""


def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        browser_errors: list[str] = []
        for width, height in ((1280, 800), (920, 760)):
            page = browser.new_page(viewport={"width": width, "height": height})
            page.on("pageerror", lambda error: browser_errors.append(str(error)))
            page.add_init_script(FIXTURE)
            page.goto("http://localhost:5173/#/capabilities")
            page.wait_for_load_state("networkidle")
            page.get_by_role("tab", name="连接器").click()
            page.get_by_role("button", name="MCP", exact=True).click()
            page.get_by_text("Docs MCP").wait_for()
            assert page.get_by_text("MCP · 3 个动作 · 可用").is_visible()
            page.get_by_role("button", name="HTTP", exact=True).click()
            page.get_by_text("CRM API").wait_for()
            assert page.get_by_text("HTTP · 1 个动作 · 已关闭").is_visible()
            page.get_by_role("button", name="Database", exact=True).click()
            page.get_by_text("Analytics DB").wait_for()
            assert page.get_by_text("Database · 2 个动作 · 待复核").is_visible()
            assert page.get_by_text("暂无 Database 连接器").count() == 0
            assert page.evaluate(
                "document.body.scrollWidth <= window.innerWidth"
            )
            page.screenshot(
                path=SHOTS / f"epic-11-connectors-{width}x{height}.png",
                full_page=True,
            )
            page.get_by_role("button", name="CLI", exact=True).click()
            page.get_by_text("Release CLI").wait_for()
            assert page.get_by_text("CLI · 1 个动作 · 可用").is_visible()
            assert page.get_by_text("Analytics DB").count() == 0
            page.close()
        browser.close()
        assert not browser_errors, browser_errors
    print("connector UI acceptance passed at 1280x800 and 920x760")


if __name__ == "__main__":
    main()
