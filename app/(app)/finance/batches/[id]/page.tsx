"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DonorPicker, EMPTY_DONOR, type DonorValue } from "@/components/finance/donor-picker";
import { apiRequest } from "@/lib/api-client";
import { formatCents, parseCentsInput } from "@/lib/finance/money";

type Category = { id: string; name: string; section: string; isActive: boolean };
type Family = { id: string; familyName: string };
type ExternalDonor = { id: string; name: string };
type Account = { id: string; code: string; name: string; type: string };
type Donation = {
  id: string;
  amountCents: string;
  method: string;
  isAnonymous: boolean;
  category: { name: string } | null;
  family: { familyName: string } | null;
  member: { firstName: string; lastName: string } | null;
  externalDonor: { name: string } | null;
};
type Batch = {
  id: string;
  label: string;
  batchDate: string;
  status: string;
  totalCents: string;
  donationCount: number;
  postedJournalEntryId: string | null;
  donations: Donation[];
};

const METHODS = ["CASH", "CHECK", "ZELLE", "ACH", "CARD", "OTHER"];

function donorLabel(d: Donation): string {
  if (d.isAnonymous) return "Anonymous / plate";
  if (d.member) return `${d.member.firstName} ${d.member.lastName}`;
  if (d.family) return d.family.familyName;
  if (d.externalDonor) return `${d.externalDonor.name} (non-member)`;
  return "—";
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const owner = searchParams.get("owner") ?? "parish";
  const queryClient = useQueryClient();

  const [donor, setDonor] = useState<DonorValue>(EMPTY_DONOR);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [method, setMethod] = useState("CASH");
  const [checkNumber, setCheckNumber] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");

  const batchQuery = useQuery({
    queryKey: ["finance", "batch", id],
    queryFn: () => apiRequest<{ ok: true; batch: Batch }>(`/api/finance/donation-batches/${id}`),
  });
  const categoriesQuery = useQuery({
    queryKey: ["finance", "giving-categories", owner],
    queryFn: () => apiRequest<{ ok: true; categories: Category[] }>(`/api/finance/giving-categories?owner=${encodeURIComponent(owner)}`),
  });
  const familiesQuery = useQuery({ queryKey: ["families", "min"], queryFn: () => apiRequest<{ ok: true; families: Family[] }>("/api/families") });
  const donorsQuery = useQuery({ queryKey: ["finance", "external-donors"], queryFn: () => apiRequest<{ ok: true; donors: ExternalDonor[] }>("/api/finance/external-donors") });
  const accountsQuery = useQuery({ queryKey: ["finance", "accounts", owner], queryFn: () => apiRequest<{ ok: true; accounts: Account[] }>(`/api/finance/accounts?owner=${encodeURIComponent(owner)}`) });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["finance", "batch", id] });

  const addGift = useMutation({
    mutationFn: () =>
      apiRequest(`/api/finance/donation-batches/${id}/donations`, {
        method: "POST",
        body: JSON.stringify({
          amountCents: parseCentsInput(amount).toString(),
          categoryId,
          method,
          checkNumber: checkNumber || null,
          familyId: donor.familyId,
          memberId: donor.memberId,
          externalDonorId: donor.externalDonorId,
          isAnonymous: donor.isAnonymous,
        }),
      }),
    onSuccess: () => {
      refetch();
      setAmount("");
      setCheckNumber("");
      setDonor(EMPTY_DONOR);
      toast.success("Gift added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeGift = useMutation({
    mutationFn: (donationId: string) =>
      apiRequest(`/api/finance/donation-batches/${id}/donations/${donationId}`, { method: "DELETE" }),
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const post = useMutation({
    mutationFn: () =>
      apiRequest(`/api/finance/donation-batches/${id}/post`, { method: "POST", body: JSON.stringify({ depositAccountId }) }),
    onSuccess: () => { refetch(); toast.success("Batch posted as a deposit"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (batchQuery.isPending) return <div className="flex min-h-full flex-col" data-testid="finance-batch"><PageSkeleton rows={8} /></div>;
  if (batchQuery.error) return <div className="flex min-h-full flex-col" data-testid="finance-batch"><div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load batch" description={batchQuery.error.message} retry={() => void batchQuery.refetch()} /></div></div>;

  const batch = batchQuery.data.batch;
  const isOpen = batch.status === "OPEN";
  const categories = (categoriesQuery.data?.categories ?? []).filter((c) => c.isActive);
  const assetAccounts = (accountsQuery.data?.accounts ?? []).filter((a) => a.type === "ASSET");
  const canAdd = isOpen && amount.trim() && categoryId && (donor.familyId || donor.externalDonorId || donor.isAnonymous);

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-batch">
      <PageHeader
        title={batch.label}
        description={`Batch ${new Date(batch.batchDate).toLocaleDateString()} · ${batch.donationCount} gift(s) · total ${formatCents(batch.totalCents)}`}
        actions={<Badge variant={batch.status === "POSTED" ? "secondary" : "outline"}>{batch.status}</Badge>}
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {isOpen ? (
          <div className="grid gap-2 rounded-lg border p-3">
            <Label className="text-xs text-muted-foreground">Add a gift</Label>
            <div className="flex flex-wrap items-center gap-2">
              <DonorPicker
                families={familiesQuery.data?.families ?? []}
                externalDonors={donorsQuery.data?.donors ?? []}
                value={donor}
                onChange={setDonor}
                onExternalCreated={() => void donorsQuery.refetch()}
              />
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-48" aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-28" aria-label="Method"><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="w-24" placeholder="Check #" aria-label="Check number" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
              <Input
                className="w-28 text-right tabular-nums"
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canAdd) addGift.mutate(); }}
              />
              <Button type="button" disabled={!canAdd || addGift.isPending} onClick={() => addGift.mutate()}>
                <PlusIcon className="mr-1.5 size-4" /> Add
              </Button>
            </div>
          </div>
        ) : null}

        <DataTable
          rows={batch.donations}
          getRowKey={(d) => d.id}
          empty={<div className="p-6 text-sm text-muted-foreground">No gifts yet — add them above.</div>}
          columns={[
            { key: "donor", header: "Donor", cell: (d) => <span className="font-medium">{donorLabel(d)}</span> },
            { key: "category", header: "Category", cell: (d) => d.category?.name ?? "—" },
            { key: "method", header: "Method", cell: (d) => d.method },
            { key: "amount", header: <span className="block text-right">Amount</span>, className: "text-right", cell: (d) => <span className="tabular-nums">{formatCents(d.amountCents)}</span> },
            {
              key: "actions", header: "", className: "text-right",
              cell: (d) => (isOpen ? <Button type="button" variant="ghost" size="icon" aria-label="Remove gift" disabled={removeGift.isPending} onClick={() => removeGift.mutate(d.id)}><TrashIcon className="size-4" /></Button> : null),
            },
          ]}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            Batch total <span className="font-semibold tabular-nums text-foreground">{formatCents(batch.totalCents)}</span>
          </span>
          {isOpen ? (
            <div className="flex items-center gap-2">
              <Select value={depositAccountId} onValueChange={setDepositAccountId}>
                <SelectTrigger className="w-56" aria-label="Deposit account"><SelectValue placeholder="Deposit to (cash account)" /></SelectTrigger>
                <SelectContent>{assetAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" disabled={!depositAccountId || batch.donationCount === 0 || post.isPending} onClick={() => post.mutate()}>
                {post.isPending ? "Posting…" : "Post batch"}
              </Button>
            </div>
          ) : batch.postedJournalEntryId ? (
            <a className="text-sm text-primary underline" href={`/finance/journal?owner=${encodeURIComponent(owner)}`}>Posted to the journal →</a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
