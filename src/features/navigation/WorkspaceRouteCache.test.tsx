import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  useWorkspacePageActive,
  WorkspaceRouteCache,
} from "./WorkspaceRouteCache";

describe("WorkspaceRouteCache", () => {
  it("retains independent state for every visited dynamic location", () => {
    const lifecycle = new Map<string, { mounts: number; unmounts: number }>();
    render(<RouteCacheHarness lifecycle={lifecycle} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Draft one" }), {
      target: { value: "first draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open two" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Draft two" }), {
      target: { value: "second draft" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open one" }));
    expect(screen.getByRole("textbox", { name: "Draft one" })).toHaveValue(
      "first draft",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open two" }));
    expect(screen.getByRole("textbox", { name: "Draft two" })).toHaveValue(
      "second draft",
    );
    expect(lifecycle.get("one")).toEqual({ mounts: 1, unmounts: 0 });
    expect(lifecycle.get("two")).toEqual({ mounts: 1, unmounts: 0 });
  });

  it("exposes activity so only the visible page handles global input", () => {
    const handled: string[] = [];
    render(<RouteCacheHarness handled={handled} />);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Open two" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(handled).toEqual(["one", "two"]);
  });

  it("keeps cached containers connected and hides only inactive routes", () => {
    render(<RouteCacheHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open two" }));

    const containers = Array.from(
      document.querySelectorAll<HTMLDivElement>(".workspace-route-container"),
    );
    expect(containers).toHaveLength(2);
    expect(containers.map((container) => container.hidden)).toEqual([
      true,
      false,
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Open one" }));
    expect(containers.map((container) => container.hidden)).toEqual([
      false,
      true,
    ]);
  });
});

function RouteCacheHarness({
  lifecycle = new Map(),
  handled = [],
}: {
  lifecycle?: Map<string, { mounts: number; unmounts: number }>;
  handled?: string[];
}): JSX.Element {
  return (
    <MemoryRouter initialEntries={["/items/one"]}>
      <Navigation />
      <WorkspaceRouteCache
        shouldCache={(location) => location.pathname.startsWith("/items/")}
      >
        {(location) => (
          <Routes location={location}>
            <Route
              path="/items/:itemId"
              element={<StatefulRoute lifecycle={lifecycle} handled={handled} />}
            />
          </Routes>
        )}
      </WorkspaceRouteCache>
    </MemoryRouter>
  );
}

function Navigation(): JSX.Element {
  const navigate = useNavigate();
  return (
    <nav>
      <button type="button" onClick={() => navigate("/items/one")}>
        Open one
      </button>
      <button type="button" onClick={() => navigate("/items/two")}>
        Open two
      </button>
    </nav>
  );
}

function StatefulRoute({
  lifecycle,
  handled,
}: {
  lifecycle: Map<string, { mounts: number; unmounts: number }>;
  handled: string[];
}): JSX.Element {
  const { itemId = "" } = useParams();
  const active = useWorkspacePageActive();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const current = lifecycle.get(itemId) ?? { mounts: 0, unmounts: 0 };
    current.mounts += 1;
    lifecycle.set(itemId, current);
    return () => {
      current.unmounts += 1;
    };
  }, [itemId, lifecycle]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") handled.push(itemId);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, handled, itemId]);

  return (
    <label>
      Draft {itemId}
      <input
        aria-label={`Draft ${itemId}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  );
}
