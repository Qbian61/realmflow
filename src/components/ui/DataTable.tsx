import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";

export type DataTableProps = TableHTMLAttributes<HTMLTableElement> & {
  caption: string;
  density?: "compact" | "default";
  scrollClassName?: string;
};

export const DataTable = forwardRef<HTMLTableElement, DataTableProps>(
  function DataTable(
    {
      caption,
      density = "default",
      scrollClassName,
      className,
      children,
      ...props
    },
    ref,
  ): JSX.Element {
    return (
      <div
        className={["ui-data-table-scroll", scrollClassName]
          .filter(Boolean)
          .join(" ")}
      >
        <table
          {...props}
          ref={ref}
          className={[
            "ui-data-table",
            `ui-data-table--${density}`,
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    );
  },
);

export const DataTableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function DataTableHeader(props, ref): JSX.Element {
  return <thead {...props} ref={ref} />;
});

export const DataTableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function DataTableBody(props, ref): JSX.Element {
  return <tbody {...props} ref={ref} />;
});

export const DataTableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement>
>(function DataTableRow(props, ref): JSX.Element {
  return <tr {...props} ref={ref} />;
});

export type DataTableHeadProps = ThHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
};

export const DataTableHead = forwardRef<
  HTMLTableCellElement,
  DataTableHeadProps
>(function DataTableHead(
  { numeric = false, className, ...props },
  ref,
): JSX.Element {
  return (
    <th
      {...props}
      ref={ref}
      className={[
        numeric && "ui-data-table__numeric",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
});

export type DataTableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
};

export const DataTableCell = forwardRef<
  HTMLTableCellElement,
  DataTableCellProps
>(function DataTableCell(
  { numeric = false, className, ...props },
  ref,
): JSX.Element {
  return (
    <td
      {...props}
      ref={ref}
      className={[
        numeric && "ui-data-table__numeric",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
});
