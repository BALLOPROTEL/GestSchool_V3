import * as React from 'react';

import { cn } from './lib/cn';

export type DataTableColumn<Row> = {
  cell: (row: Row) => React.ReactNode;
  className?: string;
  header: React.ReactNode;
  headerClassName?: string;
  id: string;
};

export type DataTableProperties<Row> = {
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  emptyState?: React.ReactNode;
  getRowId: (row: Row) => React.Key;
  minWidth?: number;
  rows: readonly Row[];
};

export function DataTable<Row>({
  caption,
  columns,
  emptyState,
  getRowId,
  minWidth = 760,
  rows,
}: DataTableProperties<Row>) {
  return (
    <div
      aria-label={caption}
      className="w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      data-slot="data-table-scroll"
      role="region"
      tabIndex={0}
    >
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-muted/45">
            {columns.map((column) => (
              <th
                className={cn(
                  'px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                  column.headerClassName,
                )}
                key={column.id}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className="border-b border-border last:border-0 hover:bg-muted/25"
              key={getRowId(row)}
            >
              {columns.map((column) => (
                <td className={cn('px-4 py-3 align-middle', column.className)} key={column.id}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? emptyState : null}
    </div>
  );
}
