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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, isApiClientError } from "@/lib/api-client";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  fund?: { id: string; name: string } | null;
};

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

export default function FinanceAccountsPage() {
  const ledger = useFinanceLedgerOwner();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const accountsQuery = useQuery({
    queryKey: ["finance", "accounts", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () =>
      apiRequest<{ ok: true; accounts: Account[] }>(
        `/api/finance/accounts?owner=${encodeURIComponent(ledger.owner)}`,
      ),
  });

  const seedChart = useMutation({
    mutationFn: () =>
      apiRequest("/api/finance/seed-chart", {
        method: "POST",
        body: JSON.stringify({ owner: ledger.owner }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["finance", "accounts", ledger.owner],
      });
      toast.success("Default chart is ready");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Chart setup failed");
    },
  });

  const header = (
    <PageHeader
      title="Chart of Accounts"
      description="Accounts are grouped by type and scoped to the selected ledger. Organization oversight remains read-only for parish administrators."
      actions={
        <>
          <LedgerOwnerSwitcher state={ledger} />
          {ledger.canWrite ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={seedChart.isPending || !ledger.isReady}
                onClick={() => seedChart.mutate()}
              >
                <PlusIcon className="mr-2 size-4" />
                {seedChart.isPending ? "Setting up…" : "Seed default chart"}
              </Button>
              <Button type="button" onClick={() => setAddOpen(true)} disabled={!ledger.isReady}>
                <PlusIcon className="mr-2 size-4" /> Add account
              </Button>
            </>
          ) : null}
        </>
      }
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && accountsQuery.isPending)) {
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <PageSkeleton rows={7} />
      </div>
    );
  }

  if (ledger.isForbidden) {
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          <ForbiddenState description="This ledger owner is not available to your account." />
        </div>
      </div>
    );
  }

  if (accountsQuery.error) {
    const forbidden =
      isApiClientError(accountsQuery.error) && accountsQuery.error.kind === "forbidden";
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          {forbidden ? (
            <ForbiddenState />
          ) : (
            <ErrorState
              title="Could not load accounts"
              description={accountsQuery.error.message}
              retry={() => void accountsQuery.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  const accounts = accountsQuery.data?.accounts ?? [];

  return (
    <div className="flex min-h-full flex-col">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={accounts}
          getRowKey={(account) => account.id}
          empty={
            <EmptyState
              title="No accounts yet"
              description={
                ledger.canWrite
                  ? "Set up the default chart to create a church-ready starting structure."
                  : "No accounts are available for this ledger."
              }
              action={
                ledger.canWrite ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={seedChart.isPending}
                    onClick={() => seedChart.mutate()}
                  >
                    Seed default chart
                  </Button>
                ) : undefined
              }
            />
          }
          columns={[
            {
              key: "code",
              header: "Code",
              className: "w-28",
              cell: (account) => (
                <span className="font-mono tabular-nums">{account.code}</span>
              ),
            },
            {
              key: "name",
              header: "Account",
              cell: (account) => <span className="font-medium">{account.name}</span>,
            },
            {
              key: "type",
              header: "Type",
              cell: (account) => <Badge variant="outline">{account.type}</Badge>,
            },
            {
              key: "fund",
              header: "Fund",
              cell: (account) => account.fund?.name ?? "—",
            },
          ]}
        />
      </div>
      {ledger.canWrite ? (
        <AddAccountDialog owner={ledger.owner} open={addOpen} onOpenChange={setAddOpen} />
      ) : null}
    </div>
  );
}

function AddAccountDialog({ owner, open, onOpenChange }: { owner: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>("ASSET");
  const [fundId, setFundId] = useState("");

  const fundsQuery = useQuery({
    queryKey: ["finance", "funds", owner],
    enabled: open && Boolean(owner),
    queryFn: () => apiRequest<{ ok: true; funds: { id: string; name: string }[] }>(`/api/finance/funds?owner=${encodeURIComponent(owner)}`),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/finance/accounts", {
        method: "POST",
        body: JSON.stringify({ owner, code, name, type, fundId: fundId || null }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "accounts", owner] });
      toast.success("Account added");
      setCode(""); setName(""); setFundId("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add account</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="ac-code">Code</Label><Input id="ac-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 1000" /></div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as (typeof ACCOUNT_TYPES)[number])}>
                <SelectTrigger aria-label="Account type"><SelectValue /></SelectTrigger>
                <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="ac-name">Name</Label><Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-1.5">
            <Label>Fund (optional)</Label>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger aria-label="Fund"><SelectValue placeholder="No fund" /></SelectTrigger>
              <SelectContent>{(fundsQuery.data?.funds ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!code.trim() || !name.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Adding…" : "Add account"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
