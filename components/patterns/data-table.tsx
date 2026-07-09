"use client";

import { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/patterns/states";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type DataTableSelection<T> = {
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  /** When false, row checkbox is disabled (e.g. already inactive). Default: all selectable. */
  isRowSelectable?: (row: T) => boolean;
};

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  empty,
  selection,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  empty?: ReactNode;
  selection?: DataTableSelection<T>;
}) {
  if (rows.length === 0) {
    return empty ?? <EmptyState />;
  }

  const selectableRows = selection
    ? rows.filter((row) => selection.isRowSelectable?.(row) ?? true)
    : [];
  const selectableKeys = selectableRows.map(getRowKey);
  const allSelected =
    selectableKeys.length > 0 &&
    selectableKeys.every((key) => selection?.selectedKeys.has(key));
  const someSelected =
    !allSelected &&
    selectableKeys.some((key) => selection?.selectedKeys.has(key));

  function toggleAll(checked: boolean) {
    if (!selection) return;
    if (!checked) {
      // Deselect only keys that are currently on this table (not unrelated state).
      const next = new Set(selection.selectedKeys);
      for (const key of selectableKeys) next.delete(key);
      selection.onChange(next);
      return;
    }
    const next = new Set(selection.selectedKeys);
    for (const key of selectableKeys) next.add(key);
    selection.onChange(next);
  }

  function toggleRow(key: string, checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selectedKeys);
    if (checked) next.add(key);
    else next.delete(key);
    selection.onChange(next);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selection ? (
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all rows"
                checked={
                  allSelected ? true : someSelected ? "indeterminate" : false
                }
                disabled={selectableKeys.length === 0}
                onCheckedChange={(value) => toggleAll(value === true)}
              />
            </TableHead>
          ) : null}
          {columns.map((column) => (
            <TableHead key={column.key} className={column.className}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const key = getRowKey(row);
          const selectable = selection?.isRowSelectable?.(row) ?? true;
          const selected = selection?.selectedKeys.has(key) ?? false;
          return (
            <TableRow
              key={key}
              data-state={selected ? "selected" : undefined}
            >
              {selection ? (
                <TableCell>
                  <Checkbox
                    aria-label={`Select row ${key}`}
                    checked={selected}
                    disabled={!selectable}
                    onCheckedChange={(value) =>
                      toggleRow(key, value === true)
                    }
                  />
                </TableCell>
              ) : null}
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
