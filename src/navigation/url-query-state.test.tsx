import { fireEvent, render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  createEnumQueryCodec,
  createPositiveIntegerQueryCodec,
  createTextQueryCodec,
  setQueryValue,
  useUrlQueryState,
} from "./url-query-state";

describe("URL query state", () => {
  it("parses supported enum values and falls back for missing or invalid values", () => {
    const codec = createEnumQueryCodec(
      ["overview", "resources"] as const,
      "overview",
    );

    expect(codec.parse("resources")).toBe("resources");
    expect(codec.parse(null)).toBe("overview");
    expect(codec.parse("unknown")).toBe("overview");
  });

  it("normalizes positive integer and text values", () => {
    const pageCodec = createPositiveIntegerQueryCodec(1);
    const textCodec = createTextQueryCodec();

    expect(pageCodec.parse("3")).toBe(3);
    expect(pageCodec.parse("0")).toBe(1);
    expect(pageCodec.parse("-2")).toBe(1);
    expect(pageCodec.parse("1.5")).toBe(1);
    expect(pageCodec.parse("word")).toBe(1);
    expect(textCodec.parse("  local knowledge  ")).toBe("local knowledge");
    expect(textCodec.parse(null)).toBe("");
  });

  it("omits defaults and preserves unrelated query parameters", () => {
    const codec = createEnumQueryCodec(
      ["overview", "resources"] as const,
      "overview",
    );

    expect(
      setQueryValue(
        new URLSearchParams("createRequirement=1&tab=resources"),
        "tab",
        codec,
        "overview",
      ).toString(),
    ).toBe("createRequirement=1");
    expect(
      setQueryValue(
        new URLSearchParams("createRequirement=1"),
        "tab",
        codec,
        "resources",
      ).toString(),
    ).toBe("createRequirement=1&tab=resources");
  });

  it("pushes discrete choices, replaces text input, and restores state on back", () => {
    render(
      <MemoryRouter initialEntries={["/capabilities?tab=tools"]}>
        <QueryHarness />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/capabilities?tab=tools",
    );
    expect(screen.getByTestId("tab")).toHaveTextContent("tools");

    fireEvent.click(screen.getByRole("button", { name: "Skills" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/capabilities?tab=skills",
    );

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/capabilities?tab=skills&query=local+knowledge",
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("tab")).toHaveTextContent("tools");
    expect(screen.getByTestId("query")).toHaveTextContent("");
  });
});

function QueryHarness(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useUrlQueryState(
    "tab",
    createEnumQueryCodec(["tools", "skills"] as const, "tools"),
  );
  const [query, setQuery] = useUrlQueryState("query", createTextQueryCodec());

  return (
    <>
      <span data-testid="location">
        {location.pathname}
        {location.search}
      </span>
      <span data-testid="tab">{tab}</span>
      <span data-testid="query">{query}</span>
      <button type="button" onClick={() => setTab("skills")}>
        Skills
      </button>
      <button
        type="button"
        onClick={() => setQuery("local knowledge", { replace: true })}
      >
        Search
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}
