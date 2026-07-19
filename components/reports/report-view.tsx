"use client";

import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/patterns/states";

export type ReportColumn = {
  key: string;
  label: string;
  kind?: "text" | "number" | "money" | "date";
};

export type ReportResult = {
  columns: ReportColumn[];
  sections: {
    title?: string;
    rows: Record<string, string | number | null>[];
    totals?: Record<string, string | number | null>;
  }[];
  grandTotals?: Record<string, string | number | null>;
  meta: { title: string; subtitle?: string; generatedAt: string };
};

function alignment(column: ReportColumn) {
  return column.kind === "money" || column.kind === "number"
    ? "text-right tabular-nums"
    : "";
}

function cell(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

/** Renders any ReportResult — the same shape the CSV and PDF renderers consume. */
export function ReportView({ result }: { result: ReportResult }) {
  const hasRows = result.sections.some((section) => section.rows.length > 0);
  if (!hasRows) {
    return (
      <EmptyState
        title="No data for this report"
        description="Nothing was recorded for the selected parameters."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{result.meta.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {result.meta.subtitle ? `${result.meta.subtitle} · ` : ""}
          Generated {result.meta.generatedAt}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {result.columns.map((column) => (
                  <TableHead key={column.key} className={alignment(column)}>
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.sections.map((section, sectionIndex) => (
                <Fragment key={`section-${sectionIndex}`}>
                  {section.title ? (
                    <TableRow className="bg-muted/50">
                      <TableCell
                        colSpan={result.columns.length}
                        className="font-semibold"
                      >
                        {section.title}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {section.rows.map((row, rowIndex) => (
                    <TableRow key={`row-${sectionIndex}-${rowIndex}`}>
                      {result.columns.map((column) => (
                        <TableCell key={column.key} className={alignment(column)}>
                          {cell(row[column.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {section.totals ? (
                    <TableRow className="border-t font-medium">
                      {result.columns.map((column, columnIndex) => (
                        <TableCell key={column.key} className={alignment(column)}>
                          {columnIndex === 0 && section.totals?.[column.key] == null
                            ? "Total"
                            : cell(section.totals?.[column.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
              {result.grandTotals ? (
                <TableRow className="border-t-2 font-semibold">
                  {result.columns.map((column, columnIndex) => (
                    <TableCell key={column.key} className={alignment(column)}>
                      {columnIndex === 0 && result.grandTotals?.[column.key] == null
                        ? "Grand total"
                        : cell(result.grandTotals?.[column.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
