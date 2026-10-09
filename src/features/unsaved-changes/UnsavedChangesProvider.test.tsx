import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useNavigate,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import {
  UnsavedChangesProvider,
  useUnsavedChangesGuard,
} from "./UnsavedChangesProvider";

function EditorHarness({
  initiallyDirty = true,
  save = vi.fn().mockResolvedValue(true),
  onContinue = vi.fn(),
  onStay = vi.fn(),
}: {
  initiallyDirty?: boolean;
  save?: () => Promise<boolean>;
  onContinue?: () => void;
  onStay?: () => void;
}): JSX.Element {
  const [dirty, setDirty] = useState(initiallyDirty);
  const navigate = useNavigate();
  const guard = useUnsavedChangesGuard({
    id: "editor-1",
    dirty,
    save: async () => {
      const saved = await save();
      if (saved) setDirty(false);
      return saved;
    },
    discard: () => setDirty(false),
    onStay,
  });

  return (
    <>
      <button type="button" onClick={() => guard.request(onContinue)}>
        Continue locally
      </button>
      <button type="button" onClick={() => navigate("/next")}>
        Navigate
      </button>
      <output>{dirty ? "dirty" : "clean"}</output>
    </>
  );
}

function renderHarness(
  editor: JSX.Element,
): ReturnType<typeof render> & { router: ReturnType<typeof createMemoryRouter> } {
  const router = createMemoryRouter(
    [
      {
        element: (
          <LocalizationProvider>
            <UnsavedChangesProvider>
              <Outlet />
            </UnsavedChangesProvider>
          </LocalizationProvider>
        ),
        children: [
          { path: "/", element: editor },
          { path: "/next", element: <h1>Next page</h1> },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}

describe("UnsavedChangesProvider", () => {
  afterEach(() => {
    delete window.realmflow;
  });

  it("runs local continuations immediately when the editor is clean", () => {
    const onContinue = vi.fn();
    renderHarness(
      <EditorHarness initiallyDirty={false} onContinue={onContinue} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue locally" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves a dirty editor before continuing a local action", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const onContinue = vi.fn();
    renderHarness(<EditorHarness save={save} onContinue={onContinue} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue locally" }));
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "保存并继续" }),
    );

    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the decision dialog open when saving fails", async () => {
    const save = vi.fn().mockResolvedValue(false);
    const onContinue = vi.fn();
    renderHarness(<EditorHarness save={save} onContinue={onContinue} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue locally" }));
    fireEvent.click(screen.getByRole("button", { name: "保存并继续" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法保存更改，请重试或选择其他操作",
    );
    expect(screen.getByRole("dialog", { name: "未保存的更改" })).toBeVisible();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("supports discarding changes or staying", () => {
    const onContinue = vi.fn();
    const onStay = vi.fn();
    renderHarness(
      <EditorHarness onContinue={onContinue} onStay={onStay} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue locally" }));
    fireEvent.click(screen.getByRole("button", { name: "留在当前页" }));
    expect(onContinue).not.toHaveBeenCalled();
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(screen.getByText("dirty")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Continue locally" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃更改" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(screen.getByText("clean")).toBeVisible();
  });

  it("blocks route navigation until the user decides", async () => {
    renderHarness(<EditorHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Navigate" }));

    expect(screen.queryByRole("heading", { name: "Next page" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "放弃更改" }));
    expect(
      await screen.findByRole("heading", { name: "Next page" }),
    ).toBeVisible();
  });

  it("prevents browser unload while an editor is dirty", () => {
    renderHarness(<EditorHarness />);
    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("answers Electron close requests only after the user decides", () => {
    let requestClose: (() => void) | undefined;
    const respondToCloseRequest = vi.fn().mockResolvedValue(undefined);
    window.realmflow = {
      appLifecycle: {
        onCloseRequested: (listener: () => void) => {
          requestClose = listener;
          return () => undefined;
        },
        respondToCloseRequest,
      },
    } as unknown as typeof window.realmflow;
    renderHarness(<EditorHarness />);

    act(() => requestClose?.());
    expect(screen.getByRole("dialog", { name: "未保存的更改" })).toBeVisible();
    expect(respondToCloseRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "留在当前页" }));
    expect(respondToCloseRequest).toHaveBeenCalledWith(false);

    act(() => requestClose?.());
    fireEvent.click(screen.getByRole("button", { name: "放弃更改" }));
    expect(respondToCloseRequest).toHaveBeenLastCalledWith(true);
  });
});
