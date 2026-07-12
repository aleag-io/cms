"use client";

import { useQuery } from "@tanstack/react-query";
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

type Donation = {
  id: string;
  receivedAt: string;
  method: string;
  amountCents: string;
  familyId: string | null;
  memberId: string | null;
  externalDonorId: string | null;
  isAnonymous: boolean;
  status: string;
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function attribution(donation: Donation): string {
  if (donation.isAnonymous) return "Anonymous";
  if (donation.memberId) return "Member attributed";
  if (donation.familyId) return "Family attributed";
  if (donation.externalDonorId) return "External donor";
  return "Unattributed";
}

function label(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

export default function FinanceDonationsPage() {
  const donationsQuery = useQuery({
    queryKey: ["finance", "donations"],
    queryFn: () =>
      apiRequest<{ ok: true; donations: Donation[] }>("/api/finance/donations"),
  });

  const header = (
    <PageHeader
      title="Donations"
      description="Gifts are family-attributed by default; member attribution is explicit and is never inferred or allocated automatically."
    />
  );

  if (donationsQuery.isPending) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-donations">
        {header}
        <PageSkeleton rows={8} />
      </div>
    );
  }

  if (donationsQuery.error) {
    const forbidden =
      isApiClientError(donationsQuery.error) &&
      donationsQuery.error.kind === "forbidden";
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-donations">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          {forbidden ? (
            <ForbiddenState />
          ) : (
            <ErrorState
              title="Could not load donations"
              description={donationsQuery.error.message}
              retry={() => void donationsQuery.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  const donations = donationsQuery.data?.donations ?? [];

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-donations">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={donations}
          getRowKey={(donation) => donation.id}
          empty={
            <EmptyState
              title="No donations recorded"
              description="Recorded gifts will appear here with their explicit attribution."
            />
          }
          columns={[
            {
              key: "date",
              header: "Date",
              cell: (donation) => DATE_FORMAT.format(new Date(donation.receivedAt)),
            },
            {
              key: "method",
              header: "Method",
              cell: (donation) => label(donation.method),
            },
            {
              key: "attribution",
              header: "Attribution",
              cell: (donation) => attribution(donation),
            },
            {
              key: "amount",
              header: <span className="block text-right">Amount</span>,
              className: "text-right",
              cell: (donation) => (
                <span className="tabular-nums">{formatCents(donation.amountCents)}</span>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (donation) => (
                <Badge variant={donation.status === "ACTIVE" ? "secondary" : "outline"}>
                  {label(donation.status)}
                </Badge>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
