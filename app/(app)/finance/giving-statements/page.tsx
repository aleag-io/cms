"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/api-client";
import { formatCents } from "@/lib/finance/money";

type Statement = {
  id: string;
  recipientType: string;
  periodKey: string;
  status: string;
  totalCents: string;
  family: { familyName: string } | null;
  member: { firstName: string; lastName: string } | null;
};

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = { SENT: "secondary", FAILED: "destructive" };

export default function GivingStatementsPage() {
  const queryClient = useQueryClient();
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear() - 1));
  const [recipientType, setRecipientType] = useState("ALL");

  const listQuery = useQuery({
    queryKey: ["finance", "statements", taxYear],
    queryFn: () => apiRequest<{ ok: true; statements: Statement[] }>(`/api/finance/giving-statements?taxYear=${taxYear}`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance", "statements", taxYear] });

  const generate = useMutation({
    mutationFn: () => apiRequest<{ ok: true; generated: number }>("/api/finance/giving-statements/generate", { method: "POST", body: JSON.stringify({ taxYear: Number(taxYear), recipientType }) }),
    onSuccess: (d) => { toast.success(`Generated ${d.generated} statement(s)`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const send = useMutation({
    mutationFn: (resend: boolean) => apiRequest<{ ok: true; sent: number }>("/api/finance/giving-statements/send", { method: "POST", body: JSON.stringify({ taxYear: Number(taxYear), resend }) }),
    onSuccess: (d) => { toast.success(`Sent ${d.sent} statement(s)`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const header = (
    <PageHeader
      title="Giving Statements"
      description="Generate annual contribution statements per family or member, then email them individually with the PDF attached."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Tax year" className="w-24" value={taxYear} onChange={(e) => setTaxYear(e.target.value)} />
          <Select value={recipientType} onValueChange={setRecipientType}>
            <SelectTrigger className="w-36" aria-label="Recipient type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Families & members</SelectItem>
              <SelectItem value="FAMILY">Families</SelectItem>
              <SelectItem value="MEMBER">Members</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? "Generating…" : "Generate"}</Button>
          <Button type="button" disabled={send.isPending} onClick={() => send.mutate(false)}>{send.isPending ? "Sending…" : "Send"}</Button>
        </div>
      }
    />
  );

  if (listQuery.isPending) return <div className="flex min-h-full flex-col" data-testid="finance-statements">{header}<PageSkeleton rows={6} /></div>;
  if (listQuery.error) return <div className="flex min-h-full flex-col" data-testid="finance-statements">{header}<div className="flex-1 p-4 sm:p-6"><ErrorState title="Could not load statements" description={listQuery.error.message} retry={() => void listQuery.refetch()} /></div></div>;

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-statements">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={listQuery.data.statements}
          getRowKey={(s) => s.id}
          empty={<EmptyState title="No statements for this year" description="Generate statements to create downloadable PDFs for each recipient." />}
          columns={[
            { key: "recipient", header: "Recipient", cell: (s) => <span className="font-medium">{s.recipientType === "FAMILY" ? (s.family?.familyName ?? "Family") : `${s.member?.firstName ?? ""} ${s.member?.lastName ?? ""}`.trim()}</span> },
            { key: "type", header: "Type", cell: (s) => <Badge variant="outline">{s.recipientType}</Badge> },
            { key: "status", header: "Status", cell: (s) => <Badge variant={STATUS_VARIANT[s.status] ?? "outline"}>{s.status}</Badge> },
            { key: "total", header: <span className="block text-right">Total</span>, className: "text-right", cell: (s) => <span className="tabular-nums">{formatCents(s.totalCents)}</span> },
            { key: "actions", header: "", className: "text-right", cell: (s) => <a className="text-sm text-primary underline" href={`/api/finance/giving-statements/${s.id}/pdf`} target="_blank" rel="noreferrer">Download</a> },
          ]}
        />
      </div>
    </div>
  );
}
