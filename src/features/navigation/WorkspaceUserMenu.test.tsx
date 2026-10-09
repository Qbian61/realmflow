import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";
import type { BusinessApi } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { WorkspaceUserMenu } from "./WorkspaceUserMenu";

function renderUserMenu(storage: Storage = window.localStorage) {
  return render(
    <ThemeProvider storage={storage}>
      <LocalizationProvider storage={storage}>
        <ToastProvider>
          <MemoryRouter>
            <WorkspaceUserMenu />
          </MemoryRouter>
        </ToastProvider>
      </LocalizationProvider>
    </ThemeProvider>,
  );
}

describe("WorkspaceUserMenu", () => {
  afterEach(() => {
    delete window.realmflow;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("opens the website through the typed support command", () => {
    const openSupportLink = vi.fn().mockResolvedValue({
      requestId: "website-open",
      target: "website",
      status: "opened",
    });
    window.realmflow = {
      getSidecarStatus: vi.fn(
        () => new Promise<"ready">(() => undefined),
      ),
      business: { openSupportLink } as unknown as BusinessApi,
    } as unknown as typeof window.realmflow;

    renderUserMenu();

    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));
    const website = screen.getByRole("menuitem", {
      name: "RealmFlow 官网",
    });
    expect(website.tagName).toBe("BUTTON");

    fireEvent.click(website);

    expect(openSupportLink).toHaveBeenCalledWith({
      requestId: expect.any(String),
      target: "website",
    });
    expect(
      screen.queryByRole("menu", { name: "用户菜单" }),
    ).not.toBeInTheDocument();
  });

  it("reports website launch failures as Toast", async () => {
    const openSupportLink = vi
      .fn()
      .mockRejectedValue(new Error("private browser detail"));
    window.realmflow = {
      getSidecarStatus: vi.fn(
        () => new Promise<"ready">(() => undefined),
      ),
      business: { openSupportLink } as unknown as BusinessApi,
    } as unknown as typeof window.realmflow;

    renderUserMenu();
    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "RealmFlow 官网" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("toast-message");
    expect(alert).toHaveTextContent("无法打开系统浏览器");
    expect(screen.queryByText("private browser detail")).not.toBeInTheDocument();
  });

  it("exposes settings destinations in the requested order", () => {
    renderUserMenu();

    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));

    const settingsLinks = screen
      .getAllByRole("menuitem")
      .filter((item) => item.tagName === "A")
      .slice(0, 3);
    expect(
      settingsLinks.map((item) => ({
        label: item.textContent?.trim(),
        href: item.getAttribute("href"),
      })),
    ).toEqual([
      { label: "通用", href: "/settings?section=general" },
      { label: "模型配置", href: "/settings?section=models" },
      { label: "数据备份", href: "/settings?section=backup" },
    ]);
  });

  it("shows current preferences and changes language from a submenu", () => {
    renderUserMenu();

    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));
    const language = screen.getByRole("menuitem", {
      name: /语言.*简体中文/,
    });
    expect(
      screen.getByRole("menuitem", { name: /主题.*跟随系统/ }),
    ).toBeVisible();

    fireEvent.click(language);

    expect(
      screen.getByRole("menuitemradio", { name: "简体中文" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(
      JSON.parse(
        window.localStorage.getItem("realmflow:locale:v1") ?? "null",
      ),
    ).toEqual({ version: 1, locale: "en" });
    expect(
      screen.queryByRole("menu", { name: "Interface language" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Language.*English/ }),
    ).toBeVisible();
  });

  it("changes theme from a submenu and marks the selected preference", () => {
    renderUserMenu();

    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /主题.*跟随系统/ }),
    );
    expect(
      screen
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent?.trim()),
    ).toEqual(["深色", "亮色", "跟随系统"]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "深色" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(
      JSON.parse(
        window.localStorage.getItem("realmflow:theme:v1") ?? "null",
      ),
    ).toEqual({ version: 1, theme: "dark" });
    expect(
      screen.getByRole("menuitem", { name: /主题.*深色/ }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("menuitem", { name: /主题.*深色/ }));
    expect(
      screen.getByRole("menuitemradio", { name: "深色" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("portals the submenu outside the clipping sidebar and anchors it to the trigger", () => {
    renderUserMenu();

    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));
    const theme = screen.getByRole("menuitem", {
      name: /主题.*跟随系统/,
    });
    vi.spyOn(theme, "getBoundingClientRect").mockReturnValue({
      x: 240,
      y: 420,
      top: 420,
      right: 454,
      bottom: 454,
      left: 240,
      width: 214,
      height: 34,
      toJSON: () => ({}),
    });

    fireEvent.click(theme);

    const submenu = screen.getByRole("menu", { name: "界面主题" });
    expect(submenu.parentElement).toBe(document.body);
    expect(submenu).toHaveStyle({ left: "462px", top: "420px" });

    fireEvent.mouseDown(
      screen.getByRole("menuitemradio", { name: "跟随系统" }),
    );
    expect(screen.getByRole("menu", { name: "用户菜单" })).toBeVisible();
    expect(submenu).toBeVisible();
  });

  it("keeps only one preference submenu open and closes all menus on Escape", () => {
    renderUserMenu();

    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /语言.*简体中文/ }),
    );
    expect(
      screen.getByRole("menu", { name: "界面语言" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("menuitem", { name: /主题.*跟随系统/ }),
    );
    expect(
      screen.queryByRole("menu", { name: "界面语言" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "界面主题" })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("menu", { name: "用户菜单" }),
    ).not.toBeInTheDocument();
  });

  it("uses shared menu navigation and restores focus to the trigger", () => {
    renderUserMenu();

    const trigger = screen.getByRole("button", { name: /Qbian61/ });
    trigger.focus();
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "用户菜单" });
    const language = screen.getByRole("menuitem", {
      name: /语言.*简体中文/,
    });
    const theme = screen.getByRole("menuitem", {
      name: /主题.*跟随系统/,
    });
    expect(menu).toHaveClass("ui-menu");
    expect(language).toHaveFocus();

    fireEvent.keyDown(language, { key: "ArrowDown" });
    expect(theme).toHaveFocus();
    fireEvent.keyDown(theme, { key: "Escape" });
    expect(menu).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the current language and reports persistence failure", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    } as unknown as Storage;
    renderUserMenu(storage);

    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /语言.*简体中文/ }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "日本語" }));

    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
    expect(screen.getByRole("alert")).toHaveClass("toast-message");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "无法保存语言偏好，请重试",
    );
    expect(document.querySelector(".user-menu-error")).toBeNull();
    expect(
      screen.getByRole("menuitemradio", { name: "简体中文" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("keeps the current theme and reports persistence failure", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    } as unknown as Storage;
    renderUserMenu(storage);

    fireEvent.click(screen.getByRole("button", { name: /Qbian61/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /主题.*跟随系统/ }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "深色" }));

    expect(document.documentElement).toHaveAttribute(
      "data-theme-preference",
      "system",
    );
    expect(screen.getByRole("alert")).toHaveClass("toast-message");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "无法保存主题偏好，请重试",
    );
    expect(document.querySelector(".user-menu-error")).toBeNull();
    expect(
      screen.getByRole("menuitemradio", { name: "跟随系统" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
