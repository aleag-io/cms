"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
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

function defaultYearRange() {
  const y = new Date().getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export default function FinancePeriodsPage() {
  const ledger = useFinanceLedgerOwner();
  const queryClient = useQueryClient();
  const { claims } = useSession();
  const isGlobalAdmin = (claims?.app_metadata.roles ?? []).includes("global_admin");

  const [openDialog, setOpenDialog] = useState(false);
  const [reopenPeriod, setReopenPeriod] = useState<Period | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const defaults = defaultYearRange();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  const periodsQuery = useQuery({
    queryKey: ["finance", "periods", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () =>
      apiRequest<{ ok: true; periods: Period[] }>(
        `/api/finance/periods?owner=${encodeURIComponent(ledger.owner)}`,
      ),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["finance", "periods", ledger.owner] });

  const createPeriod = useMutation({
    mutationFn: () =>
      apiRequest("/api/finance/periods", {
        method: "POST",
        body: JSON.stringify({ owner: ledger.owner, startDate, endDate }),
      }),
    onSuccess: () => { toast.success("Period opened"); invalidate(); setOpenDialog(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const closePeriod = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/finance/periods/${id}`, { method: "PATCH", body: JSON.stringify({ action: "CLOSE" }) }),
    onSuccess: () => { toast.success("Period closed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Cannot close period"),
  });
  const reopen = useMutation({
    mutationFn: () =>
      apiRequest(`/api/finance/periods/${reopenPeriod!.id}/reopen`, { method: "POST", body: JSON.stringify({ reason: reopenReason }) }),
    onSuccess: () => { toast.success("Period reopened"); invalidate(); setReopenPeriod(null); setReopenReason(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const header = (
    <PageHeader
      title="Accounting Periods"
      description="Open periods accept postings; closed periods reject ledger writes at the database layer."
      actions={
        <>
          <LedgerOwnerSwitcher state={ledger} />
          {ledger.canWrite ? (
            <Button type="button" onClick={() => setOpenDialog(true)} disabled={!ledger.isReady}>
              <PlusIcon className="mr-2 size-4" /> Open period
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && periodsQuery.isPending)) {
    return <div className="flex min-h-full flex-col" data-testid="finance-periods">{header}<PageSkeleton rows={6} /></div>;
  }
  if (ledger.isForbidden) {
    return <div className="flex min-h-full flex-col" data-testid="finance-periods">{header}<div className="flex-1 p-4 sm:p-6"><ForbiddenState description="This ledger owner is not available to your account." /></div></div>;
  }
  if (periodsQuery.error) {
    const forbidden = isApiClientError(periodsQuery.error) && periodsQuery.error.kind === "forbidden";
    return <div className="flex min-h-full flex-col" data-testid="finance-periods">{header}<div className="flex-1 p-4 sm:p-6">{forbidden ? <ForbiddenState /> : <ErrorState title="Could not load periods" description={periodsQuery.error.message} retry={() => void periodsQuery.refetch()} />}</div></div>;
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-periods">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={periodsQuery.data?.periods ?? []}
          getRowKey={(period) => period.id}
          empty={
            <EmptyState
              title="No accounting periods"
              description={ledger.canWrite ? "Open a period to start posting to this ledger." : "Periods will appear here once they are configured for this ledger."}
              action={ledger.canWrite ? <Button type="button" onClick={() => setOpenDialog(true)}>Open period</Button> : undefined}
            />
          }
          columns={[
            { key: "start", header: "Starts", cell: (p) => formatDate(p.startDate) },
            { key: "end", header: "Ends", cell: (p) => formatDate(p.endDate) },
            { key: "status", header: "Status", cell: (p) => <Badge variant={p.status === "OPEN" ? "secondary" : "outline"}>{p.status === "OPEN" ? "Open" : "Closed"}</Badge> },
            {
              key: "actions", header: "", className: "text-right",
              cell: (p) =>
                !ledger.canWrite ? null : p.status === "OPEN" ? (
                  <Button type="button" variant="ghost" size="sm" disabled={closePeriod.isPending} onClick={() => closePeriod.mutate(p.id)}>Close</Button>
                ) : isGlobalAdmin ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setReopenPeriod(p)}>Reopen</Button>
                ) : null,
            },
          ]}
        />
      </div>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open accounting period</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="ap-start">Start date</Label><Input id="ap-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="ap-end">End date</Label><Input id="ap-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={createPeriod.isPending} onClick={() => createPeriod.mutate()}>{createPeriod.isPending ? "Opening…" : "Open period"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reopenPeriod)} onOpenChange={(o) => !o && setReopenPeriod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen closed period</DialogTitle>
            <DialogDescription>Reopening is restricted to super admins and requires a reason (audited).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="reopen-reason">Reason</Label>
            <Textarea id="reopen-reason" rows={3} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Why is this period being reopened?" />
          </div>
          <DialogFooter>
            <Button type="button" disabled={!reopenReason.trim() || reopen.isPending} onClick={() => reopen.mutate()}>{reopen.isPending ? "Reopening…" : "Reopen period"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
