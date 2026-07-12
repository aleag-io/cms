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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/api-client";
import { formatCents, parseCentsInput } from "@/lib/finance/money";

type Vendor = { id: string; name: string };
type Account = { id: string; code: string; name: string; type: string };
type Bill = {
  id: string;
  description: string;
  amountCents: string;
  status: string;
  vendor: { name: string };
  billDate: string;
};

const STATUS_VARIANT: Record<string, "secondary" | "outline"> = { POSTED: "secondary", PAID: "secondary" };

export default function FinanceBillsPage() {
  const ledger = useFinanceLedgerOwner();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitBill, setSubmitBill] = useState<Bill | null>(null);
  const [payBill, setPayBill] = useState<Bill | null>(null);

  const billsQuery = useQuery({
    queryKey: ["finance", "bills", ledger.owner],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () => apiRequest<{ ok: true; bills: Bill[] }>(`/api/finance/bills?owner=${encodeURIComponent(ledger.owner)}`),
  });
  const vendorsQuery = useQuery({
    queryKey: ["finance", "vendors"],
    enabled: ledger.isReady,
    queryFn: () => apiRequest<{ ok: true; vendors: Vendor[] }>("/api/finance/vendors"),
  });
  const accountsQuery = useQuery({
    queryKey: ["finance", "accounts", ledger.owner],
    enabled: ledger.isReady && Boolean(ledger.owner),
    queryFn: () => apiRequest<{ ok: true; accounts: Account[] }>(`/api/finance/accounts?owner=${encodeURIComponent(ledger.owner)}`),
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance", "bills", ledger.owner] });

  const header = (
    <PageHeader
      title="Bills & Payments"
      description="Record vendor bills, route them through approval, and pay approved bills. Bills post an accrual; payments post the cash entry."
      actions={
        <>
          <LedgerOwnerSwitcher state={ledger} />
          {ledger.canWrite ? (
            <Button type="button" onClick={() => setCreateOpen(true)} disabled={!ledger.isReady}>
              <PlusIcon className="mr-2 size-4" /> New bill
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (!ledger.isReady || (!ledger.isForbidden && billsQuery.isPending)) {
    return <div className="flex min-h-full flex-col" data-testid="finance-bills">{header}<PageSkeleton rows={6} /></div>;
  }
  if (ledger.isForbidden) {
    return <div className="flex min-h-full flex-col" data-testid="finance-bills">{header}<div className="flex-1 p-4 sm:p-6"><ForbiddenState /></div></div>;
  }
  if (billsQuery.error) {
    return <div className="flex min-h-full flex-col" data-testid="finance-bills">{header}<div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load bills" description={billsQuery.error.message} retry={() => void billsQuery.refetch()} /></div></div>;
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-bills">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={billsQuery.data?.bills ?? []}
          getRowKey={(b) => b.id}
          empty={<EmptyState title="No bills yet" description="Record a vendor bill to begin the accounts-payable workflow." />}
          columns={[
            { key: "vendor", header: "Vendor", cell: (b) => <span className="font-medium">{b.vendor.name}</span> },
            { key: "desc", header: "Description", cell: (b) => b.description },
            { key: "status", header: "Status", cell: (b) => <Badge variant={STATUS_VARIANT[b.status] ?? "outline"}>{b.status}</Badge> },
            { key: "amount", header: <span className="block text-right">Amount</span>, className: "text-right", cell: (b) => <span className="tabular-nums">{formatCents(b.amountCents)}</span> },
            {
              key: "actions", header: "", className: "text-right",
              cell: (b) =>
                !ledger.canWrite ? null : b.status === "DRAFT" ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSubmitBill(b)}>Submit</Button>
                ) : b.status === "POSTED" ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPayBill(b)}>Pay</Button>
                ) : null,
            },
          ]}
        />
      </div>

      <CreateBillDialog owner={ledger.owner} vendors={vendorsQuery.data?.vendors ?? []} open={createOpen} onOpenChange={setCreateOpen} onDone={invalidate} />
      <SubmitBillDialog bill={submitBill} accounts={accounts} onOpenChange={(o) => !o && setSubmitBill(null)} onDone={invalidate} />
      <PayBillDialog bill={payBill} accounts={accounts} onOpenChange={(o) => !o && setPayBill(null)} onDone={invalidate} />
    </div>
  );
}

function CreateBillDialog({ owner, vendors, open, onOpenChange, onDone }: { owner: string; vendors: Vendor[]; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [vendorId, setVendorId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/finance/bills", {
        method: "POST",
        body: JSON.stringify({ owner, vendorId, amountCents: parseCentsInput(amount).toString(), description, billDate }),
      }),
    onSuccess: () => { toast.success("Bill created"); onDone(); onOpenChange(false); setVendorId(""); setAmount(""); setDescription(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New bill</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger aria-label="Vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="b-desc">Description</Label><Input id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="b-amt">Amount</Label><Input id="b-amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="b-date">Bill date</Label><Input id="b-date" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!vendorId || !amount || !description || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmitBillDialog({ bill, accounts, onOpenChange, onDone }: { bill: Bill | null; accounts: Account[]; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [expenseAccountId, setExpense] = useState("");
  const [apAccountId, setAp] = useState("");
  const submit = useMutation({
    mutationFn: () =>
      apiRequest(`/api/finance/bills/${bill!.id}/submit`, { method: "POST", body: JSON.stringify({ expenseAccountId, apAccountId }) }),
    onSuccess: () => { toast.success("Bill submitted"); onDone(); onOpenChange(false); setExpense(""); setAp(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const expenses = accounts.filter((a) => a.type === "EXPENSE");
  const liabilities = accounts.filter((a) => a.type === "LIABILITY");
  return (
    <Dialog open={Boolean(bill)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Submit bill for approval</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Expense account (debit)</Label>
            <Select value={expenseAccountId} onValueChange={setExpense}>
              <SelectTrigger aria-label="Expense account"><SelectValue placeholder="Select expense account" /></SelectTrigger>
              <SelectContent>{expenses.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Accounts payable (credit)</Label>
            <Select value={apAccountId} onValueChange={setAp}>
              <SelectTrigger aria-label="Accounts payable"><SelectValue placeholder="Select liability account" /></SelectTrigger>
              <SelectContent>{liabilities.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!expenseAccountId || !apAccountId || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayBillDialog({ bill, accounts, onOpenChange, onDone }: { bill: Bill | null; accounts: Account[]; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [cashAccountId, setCash] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const pay = useMutation({
    mutationFn: () =>
      apiRequest("/api/finance/payments", {
        method: "POST",
        body: JSON.stringify({ vendorBillId: bill!.id, amountCents: bill!.amountCents, cashAccountId, paidAt, method: "CHECK" }),
      }),
    onSuccess: () => { toast.success("Payment recorded"); onDone(); onOpenChange(false); setCash(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const assets = accounts.filter((a) => a.type === "ASSET");
  return (
    <Dialog open={Boolean(bill)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pay bill {bill ? `· ${formatCents(bill.amountCents)}` : ""}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Cash account (credit)</Label>
            <Select value={cashAccountId} onValueChange={setCash}>
              <SelectTrigger aria-label="Cash account"><SelectValue placeholder="Select cash account" /></SelectTrigger>
              <SelectContent>{assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="p-date">Payment date</Label><Input id="p-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!cashAccountId || pay.isPending} onClick={() => pay.mutate()}>{pay.isPending ? "Paying…" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
