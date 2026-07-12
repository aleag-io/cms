"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LedgerOwnerSwitcher,
  useFinanceLedgerOwner,
} from "@/components/finance/ledger-owner-switcher";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  PageSkeleton,
} from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { apiRequest, isApiClientError } from "@/lib/api-client";

type Period = {
  id: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  return DATE_FORMAT.format(new Date(value));
}

export default function FinancePeriodsPage() {
  const ledger = useFinanceLedgerOwner();
  const periodsQuery = useQuery({
    queryKey: ["finance", "periods", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () =>
      apiRequest<{ ok: true; periods: Period[] }>(
        `/api/finance/periods?owner=${encodeURIComponent(ledger.owner)}`,
      ),
  });

  const header = (
    <PageHeader
      title="Accounting Periods"
      description="Open periods accept postings; closed periods reject ledger writes at the database layer."
      actions={<LedgerOwnerSwitcher state={ledger} />}
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && periodsQuery.isPending)) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-periods">
        {header}
        <PageSkeleton rows={6} />
      </div>
    );
  }

  if (ledger.isForbidden) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-periods">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          <ForbiddenState description="This ledger owner is not available to your account." />
        </div>
      </div>
    );
  }

  if (periodsQuery.error) {
    const forbidden =
      isApiClientError(periodsQuery.error) && periodsQuery.error.kind === "forbidden";
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-periods">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          {forbidden ? (
            <ForbiddenState />
          ) : (
            <ErrorState
              title="Could not load periods"
              description={periodsQuery.error.message}
              retry={() => void periodsQuery.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  const periods = periodsQuery.data?.periods ?? [];

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-periods">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={periods}
          getRowKey={(period) => period.id}
          empty={
            <EmptyState
              title="No accounting periods"
              description="Periods will appear here once they are configured for this ledger."
            />
          }
          columns={[
            {
              key: "start",
              header: "Starts",
              cell: (period) => formatDate(period.startDate),
            },
            {
              key: "end",
              header: "Ends",
              cell: (period) => formatDate(period.endDate),
            },
            {
              key: "status",
              header: "Status",
              cell: (period) => (
                <Badge variant={period.status === "OPEN" ? "secondary" : "outline"}>
                  {period.status === "OPEN" ? "Open" : "Closed"}
                </Badge>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
