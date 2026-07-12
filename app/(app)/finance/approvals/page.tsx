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
import { formatCents } from "@/lib/finance/money";

type ApprovalRequest = {
  id: string;
  entityKind: string;
  status: string;
  amountCents: string;
  createdAt: string;
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function label(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

export default function FinanceApprovalsPage() {
  const ledger = useFinanceLedgerOwner();
  const approvalsQuery = useQuery({
    queryKey: ["finance", "approvals", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () =>
      apiRequest<{ ok: true; requests: ApprovalRequest[] }>(
        `/api/finance/approvals?owner=${encodeURIComponent(ledger.owner)}`,
      ),
  });

  const header = (
    <PageHeader
      title="Approvals"
      description="Maker-checker requests for journals, vendor bills, and payments on the selected ledger."
      actions={<LedgerOwnerSwitcher state={ledger} />}
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && approvalsQuery.isPending)) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-approvals">
        {header}
        <PageSkeleton rows={7} />
      </div>
    );
  }

  if (ledger.isForbidden) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-approvals">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          <ForbiddenState description="This ledger owner is not available to your account." />
        </div>
      </div>
    );
  }

  if (approvalsQuery.error) {
    const forbidden =
      isApiClientError(approvalsQuery.error) &&
      approvalsQuery.error.kind === "forbidden";
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-approvals">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          {forbidden ? (
            <ForbiddenState />
          ) : (
            <ErrorState
              title="Could not load approvals"
              description={approvalsQuery.error.message}
              retry={() => void approvalsQuery.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  const requests = approvalsQuery.data?.requests ?? [];

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-approvals">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={requests}
          getRowKey={(request) => request.id}
          empty={
            <EmptyState
              title="No approval requests"
              description="New requests will appear here when a governed transaction is submitted."
            />
          }
          columns={[
            {
              key: "kind",
              header: "Transaction",
              cell: (request) => <span className="font-medium">{label(request.entityKind)}</span>,
            },
            {
              key: "status",
              header: "Status",
              cell: (request) => (
                <Badge
                  variant={
                    request.status === "APPROVED" || request.status === "AUTO_APPROVED"
                      ? "secondary"
                      : request.status === "REJECTED"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {label(request.status)}
                </Badge>
              ),
            },
            {
              key: "amount",
              header: <span className="block text-right">Amount</span>,
              className: "text-right",
              cell: (request) => (
                <span className="tabular-nums">{formatCents(request.amountCents)}</span>
              ),
            },
            {
              key: "created",
              header: "Submitted",
              cell: (request) => DATE_FORMAT.format(new Date(request.createdAt)),
            },
          ]}
        />
      </div>
    </div>
  );
}
