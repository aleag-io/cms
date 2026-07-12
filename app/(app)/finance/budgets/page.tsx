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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/api-client";
import { formatCents, parseCentsInput } from "@/lib/finance/money";

type Account = { id: string; code: string; name: string; type: string };
type BudgetLine = { id: string; accountId: string; account: Account; originalCents: string; revisedCents: string; actualCents: string; varianceCents: string };

export default function BudgetsPage() {
  const ledger = useFinanceLedgerOwner();
  const queryClient = useQueryClient();
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [accountId, setAccountId] = useState("");
  const [original, setOriginal] = useState("");

  const budgetQuery = useQuery({
    queryKey: ["finance", "budget", ledger.owner, fiscalYear],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () => apiRequest<{ ok: true; budget: { lines: BudgetLine[] } | null }>(`/api/finance/budgets?owner=${encodeURIComponent(ledger.owner)}&fiscalYear=${fiscalYear}`),
  });
  const summaryQuery = useQuery({
    queryKey: ["finance", "summary", ledger.owner, basis],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () => apiRequest<{ ok: true; summary: { incomeCents: string; expenseCents: string; netCents: string } }>(`/api/finance/summary?owner=${encodeURIComponent(ledger.owner)}&basis=${basis}`),
  });
  const accountsQuery = useQuery({
    queryKey: ["finance", "accounts", ledger.owner],
    enabled: ledger.isReady && Boolean(ledger.owner),
    queryFn: () => apiRequest<{ ok: true; accounts: Account[] }>(`/api/finance/accounts?owner=${encodeURIComponent(ledger.owner)}`),
  });

  const addLine = useMutation({
    mutationFn: () => apiRequest("/api/finance/budgets", { method: "POST", body: JSON.stringify({ owner: ledger.owner, fiscalYear: Number(fiscalYear), lines: [{ accountId, originalCents: parseCentsInput(original).toString(), revisedCents: parseCentsInput(original).toString() }] }) }),
    onSuccess: () => { toast.success("Budget line saved"); setAccountId(""); setOriginal(""); void queryClient.invalidateQueries({ queryKey: ["finance", "budget", ledger.owner, fiscalYear] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const summary = summaryQuery.data?.summary;
  const header = (
    <PageHeader
      title="Budgets"
      description="Annual budget vs. actual by account. Toggle the reporting basis to see cash or accrual actuals."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Fiscal year" className="w-24" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} />
          <Select value={basis} onValueChange={(v) => setBasis(v as "accrual" | "cash")}>
            <SelectTrigger className="w-32" aria-label="Reporting basis"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="accrual">Accrual</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent>
          </Select>
          <LedgerOwnerSwitcher state={ledger} />
        </div>
      }
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && budgetQuery.isPending)) return <div className="flex min-h-full flex-col" data-testid="finance-budgets">{header}<PageSkeleton rows={6} /></div>;
  if (ledger.isForbidden) return <div className="flex min-h-full flex-col" data-testid="finance-budgets">{header}<div className="flex-1 p-4 sm:p-6"><ForbiddenState /></div></div>;
  if (budgetQuery.error) return <div className="flex min-h-full flex-col" data-testid="finance-budgets">{header}<div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load budget" description={budgetQuery.error.message} retry={() => void budgetQuery.refetch()} /></div></div>;

  const lines = budgetQuery.data?.budget?.lines ?? [];

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-budgets">
      {header}
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {summary ? (
          <div className="grid grid-cols-3 gap-3">
            <Stat label={`Income (${basis})`} value={formatCents(summary.incomeCents)} />
            <Stat label={`Expense (${basis})`} value={formatCents(summary.expenseCents)} />
            <Stat label={`Net (${basis})`} value={formatCents(summary.netCents)} />
          </div>
        ) : null}

        {ledger.canWrite ? (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border p-4">
            <div className="grid gap-1.5">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-64" aria-label="Budget account"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{(accountsQuery.data?.accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="bl-amt">Budget amount</Label><Input id="bl-amt" className="w-36" inputMode="decimal" placeholder="0.00" value={original} onChange={(e) => setOriginal(e.target.value)} /></div>
            <Button type="button" disabled={!accountId || !original || addLine.isPending} onClick={() => addLine.mutate()}>Set line</Button>
          </div>
        ) : null}

        <DataTable
          rows={lines}
          getRowKey={(l) => l.id}
          empty={<EmptyState title="No budget lines" description="Add budget amounts per account to track variance." />}
          columns={[
            { key: "account", header: "Account", cell: (l) => <span className="font-medium">{l.account.code} · {l.account.name}</span> },
            { key: "revised", header: <span className="block text-right">Budget</span>, className: "text-right", cell: (l) => <span className="tabular-nums">{formatCents(l.revisedCents)}</span> },
            { key: "actual", header: <span className="block text-right">Actual</span>, className: "text-right", cell: (l) => <span className="tabular-nums">{formatCents(l.actualCents)}</span> },
            { key: "variance", header: <span className="block text-right">Variance</span>, className: "text-right", cell: (l) => <span className={`tabular-nums ${BigInt(l.varianceCents) < 0n ? "text-destructive" : ""}`}>{formatCents(l.varianceCents)}</span> },
          ]}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
