"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSkeleton } from "@/components/patterns/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LedgerOwnerSwitcher,
  useFinanceLedgerOwner,
} from "@/components/finance/ledger-owner-switcher";
import { apiRequest } from "@/lib/api-client";

type ReportSummary = {
  id: string;
  title: string;
  description: string;
  category: string;
};

export default function FinanceReportsPage() {
  const ledger = useFinanceLedgerOwner();
  const query = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () =>
      apiRequest<{ ok: true; reports: ReportSummary[] }>("/api/reports"),
  });

  if (query.isLoading) return <PageSkeleton rows={3} />;

  const financeReports = (query.data?.reports ?? []).filter(
    (report) => report.category === "finance",
  );
  const ownerSuffix = ledger.owner
    ? `?owner=${encodeURIComponent(ledger.owner)}`
    : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial reports"
        description="Statement pack for the selected ledger. Receipts & Payments is the annual cash-basis statement with budget comparison."
        actions={<LedgerOwnerSwitcher state={ledger} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href={`/finance/reports/receipts-payments${ownerSuffix}`}
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Card className="h-full border-primary/40 transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle className="text-base">Receipts &amp; Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Annual cash-basis statement: giving categories by section and
                expenses by report section, with Budget / Actual / Variance.
              </p>
            </CardContent>
          </Card>
        </Link>

        {financeReports
          .filter((report) => report.id !== "receipts-payments")
          .map((report) => (
            <Link
              key={report.id}
              href={`/reports/${report.id}${ownerSuffix}`}
              className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {report.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>
    </div>
  );
}
