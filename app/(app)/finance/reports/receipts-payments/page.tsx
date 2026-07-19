"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { ReportView, type ReportResult } from "@/components/reports/report-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LedgerOwnerSwitcher,
  useFinanceLedgerOwner,
} from "@/components/finance/ledger-owner-switcher";
import { apiRequest } from "@/lib/api-client";

export default function ReceiptsPaymentsPage() {
  const ledger = useFinanceLedgerOwner();
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const queryString = useMemo(() => {
    const search = new URLSearchParams({ year });
    if (ledger.owner) search.set("owner", ledger.owner);
    return search.toString();
  }, [year, ledger.owner]);

  const report = useQuery({
    queryKey: ["reports", "receipts-payments", queryString],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () =>
      apiRequest<{ ok: true; result: ReportResult }>(
        `/api/reports/receipts-payments?${queryString}`,
      ),
  });

  const downloadHref = (format: "csv" | "pdf") =>
    `/api/reports/receipts-payments?${queryString}&format=${format}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts &amp; Payments"
        description="Annual cash-basis statement. Receipts are giving categories grouped by section; payments are expense accounts grouped by report section. Budget comes from the fiscal-year budget."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                className="w-24"
                inputMode="numeric"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </div>
            <Button asChild variant="outline">
              <a href={downloadHref("csv")}>Download CSV</a>
            </Button>
            <Button asChild variant="outline">
              <a href={downloadHref("pdf")}>Download PDF</a>
            </Button>
            <LedgerOwnerSwitcher state={ledger} />
          </div>
        }
      />

      {report.isLoading ? <PageSkeleton rows={8} /> : null}
      {report.isError ? (
        <ErrorState
          title="Could not build the statement"
          description="The report failed to run for the selected year and ledger."
          retry={() => void report.refetch()}
        />
      ) : null}
      {report.data ? <ReportView result={report.data.result} /> : null}
    </div>
  );
}
