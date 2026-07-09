"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import {
  SACRAMENT_LABELS,
  SACRAMENT_TYPES,
  sacramentLabel,
} from "@/lib/sacramental/constants";
import type { SacramentType } from "@prisma/client";

type Row = {
  id: string;
  sacramentType: SacramentType;
  occurredOn: string;
  officiantName: string | null;
  isActive: boolean;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    memberIdentifier: string;
  };
};

export default function SacramentalRegisterPage() {
  const [records, setRecords] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  async function load(search: string, sacramentType: string) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (sacramentType !== "all") params.set("type", sacramentType);
      const res = await apiRequest<{ ok: true; records: Row[] }>(
        `/api/sacramental-records?${params.toString()}`,
      );
      setRecords(res.records);
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load register",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load("", "all");
    });
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Sacramental register"
        description="Search parish sacramental records. Access is role-restricted."
      />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q, type);
          }}
        >
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium" htmlFor="q">
              Search
            </label>
            <Input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, member ID, officiant, register book…"
            />
          </div>
          <div className="w-full space-y-1 sm:w-56">
            <label className="text-sm font-medium">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {SACRAMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {SACRAMENT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit">Search</Button>
        </form>

        {busy ? (
          <PageSkeleton />
        ) : error ? (
          <ErrorState title="Load failed" description={error} />
        ) : records.length === 0 ? (
          <EmptyState
            title="No records"
            description="Try a different search or add records from a member profile."
          />
        ) : (
          <DataTable
            rows={records}
            getRowKey={(r) => r.id}
            columns={[
              {
                key: "member",
                header: "Member",
                cell: (r) => (
                  <Link
                    href={`/members/${r.member.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {r.member.firstName} {r.member.lastName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.member.memberIdentifier}
                    </span>
                  </Link>
                ),
              },
              {
                key: "type",
                header: "Sacrament",
                cell: (r) => sacramentLabel(r.sacramentType),
              },
              {
                key: "date",
                header: "Date",
                cell: (r) => format(parseISO(r.occurredOn), "dd MMM yyyy"),
              },
              {
                key: "officiant",
                header: "Officiant",
                cell: (r) => r.officiantName ?? "—",
              },
              {
                key: "status",
                header: "Status",
                cell: (r) =>
                  r.isActive ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
