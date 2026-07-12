"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUUpLeftIcon, PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  LedgerOwnerSwitcher,
  useFinanceLedgerOwner,
} from "@/components/finance/ledger-owner-switcher";
import { JournalEntryDialog } from "@/components/finance/journal-entry-dialog";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  PageSkeleton,
} from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { formatCents } from "@/lib/finance/money";

type JournalEntry = {
  id: string;
  entryDate: string;
  description: string;
  status: string;
  source: string;
  lines?: Array<{ amountCents: string; direction: string }>;
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function entryTotal(entry: JournalEntry): string {
  const debit = (entry.lines ?? [])
    .filter((line) => line.direction === "DEBIT")
    .reduce((sum, line) => sum + BigInt(line.amountCents), 0n);
  return formatCents(debit);
}

function label(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

export default function FinanceJournalPage() {
  const ledger = useFinanceLedgerOwner();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const journalQuery = useQuery({
    queryKey: ["finance", "journal", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () =>
      apiRequest<{ ok: true; entries: JournalEntry[] }>(
        `/api/finance/journal?owner=${encodeURIComponent(ledger.owner)}`,
      ),
  });

  const reverse = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/finance/journal/${id}/reverse`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "journal", ledger.owner] });
      toast.success("Reversing entry posted");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Reverse failed"),
  });

  const header = (
    <PageHeader
      title="Journal"
      description="Draft, approval-pending, and posted entries for the selected ledger. Corrections use reversing entries rather than editing posted rows."
      actions={
        <>
          <LedgerOwnerSwitcher state={ledger} />
          {ledger.canWrite ? (
            <Button type="button" onClick={() => setDialogOpen(true)} disabled={!ledger.isReady}>
              <PlusIcon className="mr-2 size-4" /> New entry
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && journalQuery.isPending)) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-journal">
        {header}
        <PageSkeleton rows={8} />
      </div>
    );
  }

  if (ledger.isForbidden) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-journal">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          <ForbiddenState description="This ledger owner is not available to your account." />
        </div>
      </div>
    );
  }

  if (journalQuery.error) {
    const forbidden =
      isApiClientError(journalQuery.error) && journalQuery.error.kind === "forbidden";
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-journal">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          {forbidden ? (
            <ForbiddenState />
          ) : (
            <ErrorState
              title="Could not load the journal"
              description={journalQuery.error.message}
              retry={() => void journalQuery.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  const entries = journalQuery.data?.entries ?? [];

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-journal">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={entries}
          getRowKey={(entry) => entry.id}
          empty={
            <EmptyState
              title="No journal entries"
              description="Entries will appear here when activity is recorded for this ledger."
            />
          }
          columns={[
            {
              key: "date",
              header: "Date",
              cell: (entry) => DATE_FORMAT.format(new Date(entry.entryDate)),
            },
            {
              key: "description",
              header: "Description",
              cell: (entry) => (
                <span className="font-medium whitespace-normal">{entry.description}</span>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (entry) => (
                <Badge variant={entry.status === "POSTED" ? "secondary" : "outline"}>
                  {label(entry.status)}
                </Badge>
              ),
            },
            {
              key: "source",
              header: "Source",
              cell: (entry) => label(entry.source),
            },
            {
              key: "amount",
              header: <span className="block text-right">Amount</span>,
              className: "text-right",
              cell: (entry) => (
                <span className="tabular-nums">{entryTotal(entry)}</span>
              ),
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              cell: (entry) =>
                ledger.canWrite && entry.status === "POSTED" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={reverse.isPending}
                    onClick={() => reverse.mutate(entry.id)}
                  >
                    <ArrowUUpLeftIcon className="mr-1.5 size-4" /> Reverse
                  </Button>
                ) : null,
            },
          ]}
        />
      </div>
      <JournalEntryDialog owner={ledger.owner} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
