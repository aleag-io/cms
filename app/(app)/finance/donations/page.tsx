"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { formatCents, parseCentsInput } from "@/lib/finance/money";

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
  const { claims } = useSession();
  const [open, setOpen] = useState(false);
  const donationsQuery = useQuery({
    queryKey: ["finance", "donations"],
    queryFn: () =>
      apiRequest<{ ok: true; donations: Donation[] }>("/api/finance/donations"),
  });
  const canRecord = (claims?.app_metadata.roles ?? []).some((r) =>
    ["global_admin", "diocese_admin", "diocese_staff", "parish_admin", "parish_staff"].includes(r),
  );

  const header = (
    <PageHeader
      title="Donations"
      description="Gifts are family-attributed by default; member attribution is explicit and is never inferred or allocated automatically."
      actions={
        canRecord ? (
          <Button type="button" onClick={() => setOpen(true)}>
            <PlusIcon className="mr-2 size-4" /> Record donation
          </Button>
        ) : undefined
      }
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
      {canRecord ? <RecordDonationDialog open={open} onOpenChange={setOpen} /> : null}
    </div>
  );
}

type Family = { id: string; familyName: string };
type Account = { id: string; code: string; name: string; type: string };
type Fund = { id: string; name: string };

function RecordDonationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [familyId, setFamilyId] = useState("");
  const [fundId, setFundId] = useState("");
  const [cashAccountId, setCash] = useState("");
  const [incomeAccountId, setIncome] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));

  const familiesQuery = useQuery({ queryKey: ["families", "min"], enabled: open, queryFn: () => apiRequest<{ ok: true; families: Family[] }>("/api/families") });
  const accountsQuery = useQuery({ queryKey: ["finance", "accounts", "parish"], enabled: open, queryFn: () => apiRequest<{ ok: true; accounts: Account[] }>("/api/finance/accounts?owner=parish") });
  const fundsQuery = useQuery({ queryKey: ["finance", "funds", "parish"], enabled: open, queryFn: () => apiRequest<{ ok: true; funds: Fund[] }>("/api/finance/funds?owner=parish") });
  const accounts = accountsQuery.data?.accounts ?? [];

  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/finance/donations", {
        method: "POST",
        body: JSON.stringify({
          familyId: familyId || null,
          fundId: fundId || null,
          cashAccountId,
          incomeAccountId,
          amountCents: parseCentsInput(amount).toString(),
          method,
          receivedAt,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "donations"] });
      toast.success("Donation recorded");
      setAmount("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record donation</DialogTitle>
          <DialogDescription>Posts a balanced cash/income entry in the same transaction.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Family (attribution)</Label>
            <Select value={familyId} onValueChange={setFamilyId}><SelectTrigger aria-label="Family"><SelectValue placeholder="Select family" /></SelectTrigger><SelectContent>{(familiesQuery.data?.families ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.familyName}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="d-amt">Amount</Label><Input id="d-amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="d-date">Received</Label><Input id="d-date" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger aria-label="Method"><SelectValue /></SelectTrigger><SelectContent>{["CASH", "CHECK", "ZELLE", "ACH", "CARD", "OTHER"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Fund</Label>
              <Select value={fundId} onValueChange={setFundId}><SelectTrigger aria-label="Fund"><SelectValue placeholder="Fund" /></SelectTrigger><SelectContent>{(fundsQuery.data?.funds ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Cash account (debit)</Label>
              <Select value={cashAccountId} onValueChange={setCash}><SelectTrigger aria-label="Cash account"><SelectValue placeholder="Asset account" /></SelectTrigger><SelectContent>{accounts.filter((a) => a.type === "ASSET").map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Income account (credit)</Label>
              <Select value={incomeAccountId} onValueChange={setIncome}><SelectTrigger aria-label="Income account"><SelectValue placeholder="Income account" /></SelectTrigger><SelectContent>{accounts.filter((a) => a.type === "INCOME").map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!amount || !cashAccountId || !incomeAccountId || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Recording…" : "Record donation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
