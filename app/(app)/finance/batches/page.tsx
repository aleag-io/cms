"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  LedgerOwnerSwitcher,
  useFinanceLedgerOwner,
} from "@/components/finance/ledger-owner-switcher";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, ErrorState, ForbiddenState, PageSkeleton } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";
import { formatCents } from "@/lib/finance/money";

type Batch = {
  id: string;
  batchDate: string;
  label: string;
  status: string;
  totalCents: string;
  donationCount: number;
};

const DATE = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export default function BatchesPage() {
  const ledger = useFinanceLedgerOwner();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10));

  const batchesQuery = useQuery({
    queryKey: ["finance", "batches", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () => apiRequest<{ ok: true; batches: Batch[] }>(`/api/finance/donation-batches?owner=${encodeURIComponent(ledger.owner)}`),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest<{ ok: true; batch: Batch }>("/api/finance/donation-batches", {
        method: "POST",
        body: JSON.stringify({ owner: ledger.owner, batchDate, label }),
      }),
    onSuccess: (res) => {
      toast.success("Batch created");
      setOpen(false);
      setLabel("");
      router.push(`/finance/batches/${res.batch.id}?owner=${encodeURIComponent(ledger.owner)}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const header = (
    <PageHeader
      title="Donation Batches"
      description="Record a collection (envelopes + plate cash) as a batch, then post it as one deposit that matches your bank statement."
      actions={
        <>
          <LedgerOwnerSwitcher state={ledger} />
          {ledger.canWrite ? (
            <Button type="button" onClick={() => setOpen(true)} disabled={!ledger.isReady}>
              <PlusIcon className="mr-2 size-4" /> New batch
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && batchesQuery.isPending)) {
    return <div className="flex min-h-full flex-col" data-testid="finance-batches">{header}<PageSkeleton rows={6} /></div>;
  }
  if (ledger.isForbidden) {
    return <div className="flex min-h-full flex-col" data-testid="finance-batches">{header}<div className="flex-1 p-4 sm:p-6"><ForbiddenState /></div></div>;
  }
  if (batchesQuery.error) {
    return <div className="flex min-h-full flex-col" data-testid="finance-batches">{header}<div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load batches" description={batchesQuery.error.message} retry={() => void batchesQuery.refetch()} /></div></div>;
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-batches">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={batchesQuery.data?.batches ?? []}
          getRowKey={(b) => b.id}
          empty={<EmptyState title="No batches yet" description="Create a batch to start recording a collection." />}
          columns={[
            { key: "date", header: "Date", cell: (b) => DATE.format(new Date(b.batchDate)) },
            { key: "label", header: "Batch", cell: (b) => <span className="font-medium">{b.label}</span> },
            { key: "count", header: "Gifts", cell: (b) => b.donationCount },
            { key: "status", header: "Status", cell: (b) => <Badge variant={b.status === "POSTED" ? "secondary" : "outline"}>{b.status}</Badge> },
            { key: "total", header: <span className="block text-right">Total</span>, className: "text-right", cell: (b) => <span className="tabular-nums">{formatCents(b.totalCents)}</span> },
            {
              key: "actions", header: "", className: "text-right",
              cell: (b) => (
                <Button type="button" variant="ghost" size="sm" onClick={() => router.push(`/finance/batches/${b.id}?owner=${encodeURIComponent(ledger.owner)}`)}>
                  {b.status === "OPEN" ? "Open" : "View"}
                </Button>
              ),
            },
          ]}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New batch</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="b-label">Label</Label><Input id="b-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sunday 2026-07-13" /></div>
            <div className="grid gap-1.5"><Label htmlFor="b-date">Date</Label><Input id="b-date" type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={!label.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create & add gifts"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
