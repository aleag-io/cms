"use client";

import { useEffect, useMemo, useState } from "react";
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

export type EditableEntry = {
  id: string;
  description: string;
  entryDate: string;
  reference: string | null;
  status: string;
  lines: Array<{ accountId: string; direction: "DEBIT" | "CREDIT"; amountCents: string }>;
};

const BLANK: Line = { accountId: "", direction: "DEBIT", amount: "" };

/** cents string → editable dollar string (no currency symbol). */
function centsToInput(cents: string): string {
  let n: bigint;
  try {
    n = BigInt(cents);
  } catch {
    return "";
  }
  const neg = n < 0n;
  const abs = neg ? -n : n;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export function JournalEntryDialog({
  owner,
  open,
  onOpenChange,
  entry,
}: {
  owner: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: EditableEntry | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(entry);
  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...BLANK }, { ...BLANK, direction: "CREDIT" }]);

  // Initialize from the entry being edited, or reset to blank for a new entry.
  useEffect(() => {
    if (!open) return;
    if (entry) {
      setDescription(entry.description);
      setEntryDate(entry.entryDate.slice(0, 10));
      setReference(entry.reference ?? "");
      setLines(
        entry.lines.map((l) => ({
          accountId: l.accountId,
          direction: l.direction,
          amount: centsToInput(l.amountCents),
        })),
      );
    } else {
      setDescription("");
      setEntryDate(new Date().toISOString().slice(0, 10));
      setReference("");
      setLines([{ ...BLANK }, { ...BLANK, direction: "CREDIT" }]);
    }
  }, [open, entry]);

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
    const openPeriods = (periodsQuery.data?.periods ?? []).filter((p) => p.status === "OPEN");
    const d = new Date(entryDate);
    return openPeriods.find((p) => new Date(p.startDate) <= d && d <= new Date(p.endDate))?.id ?? null;
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

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      const payloadLines = lines
        .filter((l) => l.accountId && l.amount.trim())
        .map((l) => ({
          accountId: l.accountId,
          direction: l.direction,
          amountCents: parseCentsInput(l.amount).toString(),
        }));
      if (entry) {
        await apiRequest(`/api/finance/journal/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({ description, entryDate, reference: reference || null, periodId, lines: payloadLines }),
        });
        if (submit) {
          await apiRequest(`/api/finance/journal/${entry.id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "submit" }),
          });
        }
        return;
      }
      await apiRequest("/api/finance/journal", {
        method: "POST",
        body: JSON.stringify({
          owner,
          description,
          entryDate,
          reference: reference || null,
          periodId,
          submit,
          lines: payloadLines,
        }),
      });
    },
    onSuccess: async (_data, submit) => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "journal", owner] });
      toast.success(entry ? "Entry updated" : submit ? "Entry submitted" : "Draft saved");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Save failed"),
  });

  const canSave = Boolean(description.trim()) && Boolean(periodId) && totals.balanced && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit journal entry" : "New journal entry"}</DialogTitle>
          <DialogDescription>
            Debits must equal credits. Save as a draft, or submit to post (routed through
            approval when a policy requires it). Posted entries are corrected with a reversing entry.
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
            <p className="text-sm text-destructive">No open accounting period covers this date. Open a period first.</p>
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
