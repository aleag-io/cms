"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";

type Category = {
  id: string;
  name: string;
  section: string;
  sortOrder: number;
  isActive: boolean;
  fundId: string | null;
  incomeAccountId: string;
  incomeAccount: { code: string; name: string };
};
type Account = { id: string; code: string; name: string; type: string };
type Fund = { id: string; name: string };

export default function GivingCategoriesPage() {
  const ledger = useFinanceLedgerOwner();
  const [edit, setEdit] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["finance", "giving-categories", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () => apiRequest<{ ok: true; categories: Category[] }>(`/api/finance/giving-categories?owner=${encodeURIComponent(ledger.owner)}`),
  });

  const header = (
    <PageHeader
      title="Giving Categories"
      description="Offering purposes (Subscription, Plate, Birthday Offertory…) mapped to an income account and report section."
      actions={
        <>
          <LedgerOwnerSwitcher state={ledger} />
          {ledger.canWrite ? (
            <Button type="button" onClick={() => { setEdit(null); setOpen(true); }} disabled={!ledger.isReady}>
              <PlusIcon className="mr-2 size-4" /> New category
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && categoriesQuery.isPending)) {
    return <div className="flex min-h-full flex-col" data-testid="finance-giving-categories">{header}<PageSkeleton rows={6} /></div>;
  }
  if (ledger.isForbidden) {
    return <div className="flex min-h-full flex-col" data-testid="finance-giving-categories">{header}<div className="flex-1 p-4 sm:p-6"><ForbiddenState /></div></div>;
  }
  if (categoriesQuery.error) {
    return <div className="flex min-h-full flex-col" data-testid="finance-giving-categories">{header}<div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load categories" description={categoriesQuery.error.message} retry={() => void categoriesQuery.refetch()} /></div></div>;
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-giving-categories">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={categoriesQuery.data?.categories ?? []}
          getRowKey={(c) => c.id}
          empty={<EmptyState title="No categories yet" description="Add a category to tag gifts by purpose." />}
          columns={[
            { key: "name", header: "Category", cell: (c) => <span className="font-medium">{c.name}</span> },
            { key: "section", header: "Section", cell: (c) => c.section },
            { key: "account", header: "Income account", cell: (c) => `${c.incomeAccount.code} · ${c.incomeAccount.name}` },
            { key: "active", header: "Status", cell: (c) => <Badge variant={c.isActive ? "secondary" : "outline"}>{c.isActive ? "Active" : "Inactive"}</Badge> },
            {
              key: "actions", header: "", className: "text-right",
              cell: (c) => (ledger.canWrite ? <Button type="button" variant="ghost" size="sm" onClick={() => { setEdit(c); setOpen(true); }}><PencilSimpleIcon className="mr-1.5 size-4" /> Edit</Button> : null),
            },
          ]}
        />
      </div>
      {ledger.canWrite ? (
        <CategoryDialog
          owner={ledger.owner}
          category={edit}
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}
        />
      ) : null}
    </div>
  );
}

function CategoryDialog({ owner, category, open, onOpenChange }: { owner: string; category: Category | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [section, setSection] = useState("Church Operation");
  const [fundId, setFundId] = useState("");
  const [incomeAccountId, setIncome] = useState("");

  // Render-phase sync from the selected category (or reset for create).
  const [initSig, setInitSig] = useState("");
  const sig = open ? (category?.id ?? "new") : "";
  if (sig && sig !== initSig) {
    setInitSig(sig);
    setName(category?.name ?? "");
    setSection(category?.section ?? "Church Operation");
    setFundId(category?.fundId ?? "");
    setIncome(category?.incomeAccountId ?? "");
  }

  const accountsQuery = useQuery({ queryKey: ["finance", "accounts", owner], enabled: open, queryFn: () => apiRequest<{ ok: true; accounts: Account[] }>(`/api/finance/accounts?owner=${encodeURIComponent(owner)}`) });
  const fundsQuery = useQuery({ queryKey: ["finance", "funds", owner], enabled: open, queryFn: () => apiRequest<{ ok: true; funds: Fund[] }>(`/api/finance/funds?owner=${encodeURIComponent(owner)}`) });
  const income = (accountsQuery.data?.accounts ?? []).filter((a) => a.type === "INCOME");

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ owner, name, section, fundId: fundId || null, incomeAccountId });
      return category
        ? apiRequest(`/api/finance/giving-categories/${category.id}`, { method: "PATCH", body })
        : apiRequest("/api/finance/giving-categories", { method: "POST", body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "giving-categories", owner] });
      toast.success(category ? "Category updated" : "Category added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="gc-name">Name</Label><Input id="gc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscription" /></div>
          <div className="grid gap-1.5"><Label htmlFor="gc-section">Section (report head)</Label><Input id="gc-section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Church Operation" /></div>
          <div className="grid gap-1.5">
            <Label>Income account</Label>
            <Select value={incomeAccountId} onValueChange={setIncome}>
              <SelectTrigger aria-label="Income account"><SelectValue placeholder="Select income account" /></SelectTrigger>
              <SelectContent>{income.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Fund (optional)</Label>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger aria-label="Fund"><SelectValue placeholder="No fund" /></SelectTrigger>
              <SelectContent>{(fundsQuery.data?.funds ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!name.trim() || !section.trim() || !incomeAccountId || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : category ? "Save changes" : "Add category"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
