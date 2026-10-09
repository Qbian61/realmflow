import { render, screen } from "@testing-library/react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "./DataTable";

describe("DataTable", () => {
  it("renders a labelled semantic table with shared density and numeric cells", () => {
    render(
      <DataTable caption="Usage" density="compact">
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>Model</DataTableHead>
            <DataTableHead numeric>Tokens</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          <DataTableRow>
            <DataTableCell>Local</DataTableCell>
            <DataTableCell numeric>42</DataTableCell>
          </DataTableRow>
        </DataTableBody>
      </DataTable>,
    );

    expect(screen.getByRole("table", { name: "Usage" })).toHaveClass(
      "ui-data-table",
      "ui-data-table--compact",
    );
    expect(screen.getByRole("cell", { name: "42" })).toHaveClass(
      "ui-data-table__numeric",
    );
    expect(screen.getByRole("table").parentElement).toHaveClass(
      "ui-data-table-scroll",
    );
  });
});
