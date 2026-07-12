"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";
import { formatCents, parseCentsInput } from "@/lib/finance/money";

type Fund = { id: string; name: string };
type Account = { id: string; code: string; name: string; type: string };
type Campaign = { id: string; name: string; status: string; goalCents: string; receivedCents: string; pledgedCents: string; fund: { name: string } };

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ["finance", "campaigns"],
    queryFn: () => apiRequest<{ ok: true; campaigns: Campaign[] }>("/api/finance/campaigns"),
  });
  const fundsQuery = useQuery({ queryKey: ["finance", "funds", "parish"], enabled: open, queryFn: () => apiRequest<{ ok: true; funds: Fund[] }>("/api/finance/funds?owner=parish") });
  const accountsQuery = useQuery({ queryKey: ["finance", "accounts", "parish"], enabled: open, queryFn: () => apiRequest<{ ok: true; accounts: Account[] }>("/api/finance/accounts?owner=parish") });

  const header = (
    <PageHeader
      title="Campaigns"
      description="Fundraising campaigns with pledge and donation progress toward goal."
      actions={<Button type="button" onClick={() => setOpen(true)}><PlusIcon className="mr-2 size-4" /> New campaign</Button>}
    />
  );

  if (campaignsQuery.isPending) return <div className="flex min-h-full flex-col" data-testid="finance-campaigns">{header}<PageSkeleton rows={6} /></div>;
  if (campaignsQuery.error) return <div className="flex min-h-full flex-col" data-testid="finance-campaigns">{header}<div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load campaigns" description={campaignsQuery.error.message} retry={() => void campaignsQuery.refetch()} /></div></div>;

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-campaigns">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={campaignsQuery.data.campaigns}
          getRowKey={(c) => c.id}
          empty={<EmptyState title="No campaigns yet" description="Create a campaign to track pledges and giving toward a goal." />}
          columns={[
            { key: "name", header: "Campaign", cell: (c) => <span className="font-medium">{c.name}</span> },
            { key: "fund", header: "Fund", cell: (c) => c.fund.name },
            { key: "status", header: "Status", cell: (c) => <Badge variant={c.status === "ACTIVE" ? "secondary" : "outline"}>{c.status}</Badge> },
            {
              key: "progress", header: "Progress",
              cell: (c) => {
                const goal = Number(BigInt(c.goalCents)) || 1;
                const received = Number(BigInt(c.receivedCents));
                const pct = Math.min(100, Math.round((received / goal) * 100));
                return (
                  <div className="min-w-40">
                    <Progress value={pct} aria-label={`${pct}% of goal`} />
                    <p className="mt-1 text-xs text-muted-foreground">{formatCents(c.receivedCents)} received · {formatCents(c.pledgedCents)} pledged · goal {formatCents(c.goalCents)}</p>
                  </div>
                );
              },
            },
            {
              key: "actions", header: "", className: "text-right",
              cell: (c) => (
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditCampaign(c)}>
                  <PencilSimpleIcon className="mr-1.5 size-4" /> Edit
                </Button>
              ),
            },
          ]}
        />
      </div>
      <CreateCampaignDialog open={open} onOpenChange={setOpen} funds={fundsQuery.data?.funds ?? []} accounts={accountsQuery.data?.accounts ?? []} onDone={() => queryClient.invalidateQueries({ queryKey: ["finance", "campaigns"] })} />
      <EditCampaignDialog campaign={editCampaign} onOpenChange={(o) => !o && setEditCampaign(null)} onDone={() => queryClient.invalidateQueries({ queryKey: ["finance", "campaigns"] })} />
    </div>
  );
}

function CreateCampaignDialog({ open, onOpenChange, funds, accounts, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; funds: Fund[]; accounts: Account[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [fundId, setFundId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEnd] = useState("");
  const create = useMutation({
    mutationFn: () => apiRequest("/api/finance/campaigns", { method: "POST", body: JSON.stringify({ name, fundId, accountId, goalCents: parseCentsInput(goal).toString(), startDate, endDate }) }),
    onSuccess: () => { toast.success("Campaign created"); onDone(); onOpenChange(false); setName(""); setGoal(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const income = accounts.filter((a) => a.type === "INCOME");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New campaign</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="c-name">Name</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Fund</Label>
              <Select value={fundId} onValueChange={setFundId}><SelectTrigger aria-label="Fund"><SelectValue placeholder="Fund" /></SelectTrigger><SelectContent>{funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Income account</Label>
              <Select value={accountId} onValueChange={setAccountId}><SelectTrigger aria-label="Income account"><SelectValue placeholder="Account" /></SelectTrigger><SelectContent>{income.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="c-goal">Goal</Label><Input id="c-goal" inputMode="decimal" placeholder="0.00" value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="c-start">Start</Label><Input id="c-start" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="c-end">End</Label><Input id="c-end" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!name || !fundId || !accountId || !goal || !endDate || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCampaignDialog({ campaign, onOpenChange, onDone }: { campaign: Campaign | null; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState("ACTIVE");

  // Render-phase sync when a different campaign is selected for editing.
  const [lastId, setLastId] = useState<string | null>(null);
  if (campaign && campaign.id !== lastId) {
    setLastId(campaign.id);
    setName(campaign.name);
    setGoal((Number(BigInt(campaign.goalCents)) / 100).toFixed(2));
    setStatus(campaign.status);
  }

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/finance/campaigns/${campaign!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, goalCents: parseCentsInput(goal).toString(), status }),
      }),
    onSuccess: () => { toast.success("Campaign updated"); onDone(); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={Boolean(campaign)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit campaign</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="ec-name">Name</Label><Input id="ec-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="ec-goal">Goal</Label><Input id="ec-goal" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>{["ACTIVE", "COMPLETED", "CANCELLED"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!name || !goal || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
