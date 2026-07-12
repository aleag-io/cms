"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
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
import { apiRequest } from "@/lib/api-client";

type Vendor = { id: string; name: string; email: string | null; phone: string | null; taxId: string | null };

export default function FinanceVendorsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const vendorsQuery = useQuery({
    queryKey: ["finance", "vendors"],
    queryFn: () => apiRequest<{ ok: true; vendors: Vendor[] }>("/api/finance/vendors"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/finance/vendors", {
        method: "POST",
        body: JSON.stringify({ name, email: email || null, phone: phone || null }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "vendors"] });
      toast.success("Vendor added");
      setName("");
      setEmail("");
      setPhone("");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const header = (
    <PageHeader
      title="Vendors"
      description="Payees for accounts-payable bills and payments."
      actions={
        <Button type="button" onClick={() => setOpen(true)}>
          <PlusIcon className="mr-2 size-4" /> Add vendor
        </Button>
      }
    />
  );

  if (vendorsQuery.isPending) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-vendors">
        {header}
        <PageSkeleton rows={6} />
      </div>
    );
  }
  if (vendorsQuery.error) {
    return (
      <div className="flex min-h-full flex-col" data-testid="finance-vendors">
        {header}
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Could not load vendors" description={vendorsQuery.error.message} retry={() => void vendorsQuery.refetch()} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-vendors">
      {header}
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={vendorsQuery.data.vendors}
          getRowKey={(v) => v.id}
          empty={<EmptyState title="No vendors yet" description="Add a vendor to start recording bills." />}
          columns={[
            { key: "name", header: "Vendor", cell: (v) => <span className="font-medium">{v.name}</span> },
            { key: "email", header: "Email", cell: (v) => v.email ?? "—" },
            { key: "phone", header: "Phone", cell: (v) => v.phone ?? "—" },
          ]}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="v-name">Name</Label>
              <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-email">Email (optional)</Label>
              <Input id="v-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-phone">Phone (optional)</Label>
              <Input id="v-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Saving…" : "Add vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
