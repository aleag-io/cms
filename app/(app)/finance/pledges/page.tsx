"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";
import { formatCents, parseCentsInput } from "@/lib/finance/money";

type Campaign = { id: string; name: string };
type Pledge = {
  id: string;
  amountCents: string;
  fulfilledCents: string;
  status: string;
  family: { familyName: string } | null;
  member: { firstName: string; lastName: string } | null;
};

export default function PledgesPage() {
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState("");
  const [open, setOpen] = useState(false);

  const campaignsQuery = useQuery({ queryKey: ["finance", "campaigns"], queryFn: () => apiRequest<{ ok: true; campaigns: Campaign[] }>("/api/finance/campaigns") });
  const pledgesQuery = useQuery({
    queryKey: ["finance", "pledges", campaignId],
    enabled: Boolean(campaignId),
    queryFn: () => apiRequest<{ ok: true; pledges: Pledge[] }>(`/api/finance/pledges?campaignId=${campaignId}`),
  });
  const remind = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/finance/pledges/${id}/remind`, { method: "POST" }),
    onSuccess: () => toast.success("Reminder queued"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const header = (
    <PageHeader
      title="Pledges"
      description="Track pledge fulfillment per campaign and send reminders for unfulfilled pledges."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="w-56" aria-label="Campaign"><SelectValue placeholder="Select a campaign" /></SelectTrigger>
            <SelectContent>{(campaignsQuery.data?.campaigns ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" disabled={!campaignId} onClick={() => setOpen(true)}><PlusIcon className="mr-2 size-4" /> New pledge</Button>
        </div>
      }
    />
  );

  if (!campaignId) {
    return <div className="flex min-h-full flex-col" data-testid="finance-pledges">{header}<div className="flex-1 p-4 sm:p-6"><EmptyState title="Select a campaign" description="Choose a campaign above to view and manage its pledges." /></div></div>;
  }
  if (pledgesQuery.isPending) return <div className="flex min-h-full flex-col" data-testid="finance-pledges">{header}<PageSkeleton rows={6} /></div>;
  if (pledgesQuery.error) return <div className="flex min-h-full flex-col" data-testid="finance-pledges">{header}<div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load pledges" description={pledgesQuery.error.message} retry={() => void pledgesQuery.refetch()} /></div></div>;

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-pledges">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={pledgesQuery.data.pledges}
          getRowKey={(p) => p.id}
          empty={<EmptyState title="No pledges yet" description="Record a pledge for this campaign." />}
          columns={[
            { key: "who", header: "Pledged by", cell: (p) => <span className="font-medium">{p.member ? `${p.member.firstName} ${p.member.lastName}` : (p.family?.familyName ?? "—")}</span> },
            { key: "amount", header: <span className="block text-right">Pledged</span>, className: "text-right", cell: (p) => <span className="tabular-nums">{formatCents(p.amountCents)}</span> },
            { key: "fulfilled", header: <span className="block text-right">Fulfilled</span>, className: "text-right", cell: (p) => <span className="tabular-nums">{formatCents(p.fulfilledCents)}</span> },
            { key: "status", header: "Status", cell: (p) => <Badge variant={p.status === "FULFILLED" ? "secondary" : "outline"}>{p.status}</Badge> },
            { key: "actions", header: "", className: "text-right", cell: (p) => (BigInt(p.fulfilledCents) < BigInt(p.amountCents) ? <Button type="button" variant="ghost" size="sm" disabled={remind.isPending} onClick={() => remind.mutate(p.id)}><BellIcon className="mr-1.5 size-4" /> Remind</Button> : null) },
          ]}
        />
      </div>
      <CreatePledgeDialog campaignId={campaignId} open={open} onOpenChange={setOpen} onDone={() => queryClient.invalidateQueries({ queryKey: ["finance", "pledges", campaignId] })} />
    </div>
  );
}

function CreatePledgeDialog({ campaignId, open, onOpenChange, onDone }: { campaignId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [familyId, setFamilyId] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const familiesQuery = useQuery({ queryKey: ["families", "min"], enabled: open, queryFn: () => apiRequest<{ ok: true; families: { id: string; familyName: string }[] }>("/api/families") });
  const create = useMutation({
    mutationFn: () => apiRequest("/api/finance/pledges", { method: "POST", body: JSON.stringify({ campaignId, familyId, amountCents: parseCentsInput(amount).toString(), startDate }) }),
    onSuccess: () => { toast.success("Pledge recorded"); onDone(); onOpenChange(false); setFamilyId(""); setAmount(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New pledge</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Family</Label>
            <Select value={familyId} onValueChange={setFamilyId}><SelectTrigger aria-label="Family"><SelectValue placeholder="Select family" /></SelectTrigger><SelectContent>{(familiesQuery.data?.families ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.familyName}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="pl-amt">Amount</Label><Input id="pl-amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="pl-start">Start date</Label><Input id="pl-start" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!familyId || !amount || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
