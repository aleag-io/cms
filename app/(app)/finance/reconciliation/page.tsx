"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api-client";

type Run = { id: string; status: string; matchedCount: number; unmatchedCount: number; importedAt: string };

export default function ReconciliationPage() {
  const ledger = useFinanceLedgerOwner();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");

  const runsQuery = useQuery({
    queryKey: ["finance", "recon", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () => apiRequest<{ ok: true; runs: Run[] }>(`/api/finance/reconciliation?owner=${encodeURIComponent(ledger.owner)}`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance", "recon", ledger.owner] });

  const importCsv = useMutation({
    mutationFn: () => apiRequest<{ ok: true; imported: number }>("/api/finance/reconciliation/import", { method: "POST", body: JSON.stringify({ owner: ledger.owner, csv }) }),
    onSuccess: (d) => { toast.success(`Imported ${d.imported} line(s)`); setCsv(""); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });
  const match = useMutation({
    mutationFn: (runId: string) => apiRequest<{ ok: true; matchedCount: number }>("/api/finance/reconciliation/match", { method: "POST", body: JSON.stringify({ runId }) }),
    onSuccess: (d) => { toast.success(`Matched ${d.matchedCount} line(s)`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Match failed"),
  });

  const header = (
    <PageHeader
      title="Bank Reconciliation"
      description="Import a bank CSV (date, amount, description), then auto-match statement lines to posted cash entries by amount and date."
      actions={<LedgerOwnerSwitcher state={ledger} />}
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && runsQuery.isPending)) return <div className="flex min-h-full flex-col" data-testid="finance-recon">{header}<PageSkeleton rows={6} /></div>;
  if (ledger.isForbidden) return <div className="flex min-h-full flex-col" data-testid="finance-recon">{header}<div className="flex-1 p-4 sm:p-6"><ForbiddenState /></div></div>;
  if (runsQuery.error) return <div className="flex min-h-full flex-col" data-testid="finance-recon">{header}<div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load runs" description={runsQuery.error.message} retry={() => void runsQuery.refetch()} /></div></div>;

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-recon">
      {header}
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {ledger.canWrite ? (
          <div className="grid gap-2 rounded-lg border p-4">
            <Label htmlFor="csv">Paste bank CSV</Label>
            <Textarea id="csv" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"Date,Amount,Description\n2026-06-01,-125.00,Utility Co\n2026-06-03,500.00,Sunday Deposit"} className="font-mono text-xs" />
            <div>
              <Button type="button" disabled={!csv.trim() || importCsv.isPending} onClick={() => importCsv.mutate()}>{importCsv.isPending ? "Importing…" : "Import CSV"}</Button>
            </div>
          </div>
        ) : null}

        <DataTable
          rows={runsQuery.data?.runs ?? []}
          getRowKey={(r) => r.id}
          empty={<EmptyState title="No reconciliation runs" description="Import a bank CSV to start a reconciliation run." />}
          columns={[
            { key: "date", header: "Imported", cell: (r) => new Date(r.importedAt).toLocaleDateString() },
            { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "COMPLETED" ? "secondary" : "outline"}>{r.status}</Badge> },
            { key: "matched", header: "Matched", cell: (r) => r.matchedCount },
            { key: "unmatched", header: "Unmatched", cell: (r) => r.unmatchedCount },
            { key: "actions", header: "", className: "text-right", cell: (r) => (ledger.canWrite && r.unmatchedCount > 0 ? <Button type="button" variant="ghost" size="sm" disabled={match.isPending} onClick={() => match.mutate(r.id)}>Auto-match</Button> : null) },
          ]}
        />
      </div>
    </div>
  );
}
