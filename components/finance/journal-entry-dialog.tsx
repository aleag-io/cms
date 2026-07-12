"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";
import { formatCents, parseCentsInput } from "@/lib/finance/money";

type Account = { id: string; code: string; name: string; type: string };
type Line = { accountId: string; direction: "DEBIT" | "CREDIT"; amount: string };

const BLANK: Line = { accountId: "", direction: "DEBIT", amount: "" };

export function JournalEntryDialog({
  owner,
  open,
  onOpenChange,
}: {
  owner: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...BLANK }, { ...BLANK, direction: "CREDIT" }]);

  const accountsQuery = useQuery({
    queryKey: ["finance", "accounts", owner],
    enabled: open && Boolean(owner),
    queryFn: () =>
      apiRequest<{ ok: true; accounts: Account[] }>(
        `/api/finance/accounts?owner=${encodeURIComponent(owner)}`,
      ),
  });
  const periodsQuery = useQuery({
    queryKey: ["finance", "periods", owner],
    enabled: open && Boolean(owner),
    queryFn: () =>
      apiRequest<{ ok: true; periods: Array<{ id: string; startDate: string; endDate: string; status: string }> }>(
        `/api/finance/periods?owner=${encodeURIComponent(owner)}`,
      ),
  });
  const accounts = accountsQuery.data?.accounts ?? [];

  const periodId = useMemo(() => {
    const open = (periodsQuery.data?.periods ?? []).filter((p) => p.status === "OPEN");
    const d = new Date(entryDate);
    return open.find((p) => new Date(p.startDate) <= d && d <= new Date(p.endDate))?.id ?? null;
  }, [periodsQuery.data, entryDate]);

  const totals = useMemo(() => {
    let debit = 0n;
    let credit = 0n;
    for (const l of lines) {
      if (!l.amount.trim()) continue;
      try {
        const cents = parseCentsInput(l.amount);
        if (l.direction === "DEBIT") debit += cents;
        else credit += cents;
      } catch {
        /* ignore partial input */
      }
    }
    return { debit, credit, balanced: debit === credit && debit > 0n };
  }, [lines]);

  function reset() {
    setDescription("");
    setReference("");
    setLines([{ ...BLANK }, { ...BLANK, direction: "CREDIT" }]);
  }

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      apiRequest("/api/finance/journal", {
        method: "POST",
        body: JSON.stringify({
          owner,
          description,
          entryDate,
          reference: reference || null,
          periodId,
          submit,
          lines: lines
            .filter((l) => l.accountId && l.amount.trim())
            .map((l) => ({
              accountId: l.accountId,
              direction: l.direction,
              amountCents: parseCentsInput(l.amount).toString(),
            })),
        }),
      }),
    onSuccess: async (_data, submit) => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "journal", owner] });
      toast.success(submit ? "Entry submitted" : "Draft saved");
      reset();
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Save failed"),
  });

  const canSave = description.trim() && periodId && totals.balanced && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New journal entry</DialogTitle>
          <DialogDescription>
            Debits must equal credits. Save as a draft, or submit to post (routed through
            approval when a policy requires it).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="je-date">Date</Label>
              <Input id="je-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="je-ref">Reference (optional)</Label>
              <Input id="je-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. check #, invoice" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="je-desc">Description</Label>
            <Input id="je-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this entry for?" />
          </div>

          <div className="grid gap-2">
            <Label>Lines</Label>
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={line.accountId} onValueChange={(v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, accountId: v } : l)))}>
                  <SelectTrigger className="flex-1" aria-label={`Account for line ${i + 1}`}>
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={line.direction} onValueChange={(v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, direction: v as Line["direction"] } : l)))}>
                  <SelectTrigger className="w-28" aria-label={`Direction for line ${i + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="w-32 text-right tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Amount for line ${i + 1}`}
                  value={line.amount}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, amount: e.target.value } : l)))}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setLines((ls) => [...ls, { ...BLANK }])}>
              <PlusIcon className="mr-1.5 size-4" /> Add line
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Debits {formatCents(totals.debit)} · Credits {formatCents(totals.credit)}
            </span>
            <Badge variant={totals.balanced ? "secondary" : "outline"}>
              {totals.balanced ? "Balanced" : "Unbalanced"}
            </Badge>
          </div>
          {!periodId && periodsQuery.data ? (
            <p className="text-sm text-destructive">No open accounting period covers this date. Create/open a period first.</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={!canSave} onClick={() => save.mutate(false)}>
            Save draft
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => save.mutate(true)}>
            {save.isPending ? "Saving…" : "Submit / Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
