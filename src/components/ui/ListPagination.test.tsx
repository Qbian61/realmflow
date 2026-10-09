import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ListPagination, useListPagination } from "./ListPagination";

describe("ListPagination", () => {
  it("reports the visible range and navigates between bounded pages", () => {
    function Example(): JSX.Element {
      const [page, setPage] = useState(1);
      return (
        <ListPagination
          total={150}
          page={page}
          onPageChange={setPage}
        />
      );
    }

    render(
      <LocalizationProvider>
        <Example />
      </LocalizationProvider>,
    );

    expect(screen.getByText("1-100 / 150")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("101-150 / 150")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("clamps the active page when filtering shortens the item collection", () => {
    function Example(): JSX.Element {
      const [items, setItems] = useState(
        Array.from({ length: 150 }, (_, index) => index),
      );
      const pagination = useListPagination(items);
      return (
        <>
          <button type="button" onClick={() => setItems(items.slice(0, 20))}>
            Filter
          </button>
          <button type="button" onClick={() => pagination.setPage(2)}>
            Page 2
          </button>
          <span>{pagination.pageItems[0]}</span>
          <span data-testid="page">{pagination.page}</span>
        </>
      );
    }

    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(screen.getByTestId("page")).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByTestId("page")).toHaveTextContent("1");
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("supports a controlled page for URL-backed collections", () => {
    function Example(): JSX.Element {
      const [page, setPage] = useState(2);
      const pagination = useListPagination(
        Array.from({ length: 150 }, (_, index) => index),
        100,
        { page, onPageChange: setPage },
      );
      return (
        <>
          <span data-testid="first-item">{pagination.pageItems[0]}</span>
          <button type="button" onClick={() => pagination.setPage(1)}>
            Page 1
          </button>
        </>
      );
    }

    render(<Example />);

    expect(screen.getByTestId("first-item")).toHaveTextContent("100");
    fireEvent.click(screen.getByRole("button", { name: "Page 1" }));
    expect(screen.getByTestId("first-item")).toHaveTextContent("0");
  });
});
