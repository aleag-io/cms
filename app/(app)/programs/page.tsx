"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { useSession } from "@/hooks/use-session";

type Program = {
  id: string;
  name: string;
  programType: string;
  description: string | null;
  isActive: boolean;
};

export default function ProgramsPage() {
  const { claims, isLoading: sessionLoading } = useSession();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const canManage =
    claims?.app_metadata.roles.some((role) =>
      ["parish_admin", "parish_staff"].includes(role),
    ) ?? false;

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    apiRequest<{ ok: true; programs: Program[] }>("/api/programs")
      .then((res) => {
        if (!cancelled) {
          setPrograms(res.programs);
          setBusy(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            isApiClientError(err)
              ? err.message
              : err instanceof Error
                ? err.message
                : "Unable to load programs",
          );
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLoading]);

  if (sessionLoading || busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Programs" description="Loading programs…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Programs" description="Could not load programs." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Programs & ministries"
        description="Enrollments, sessions, and attendance. Leaders only see programs they coordinate."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/programs/new">
                <PlusIcon className="mr-2 size-4" />
                Add program
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={programs}
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (row) => (
                <Link
                  href={`/programs/${row.id}`}
                  className="font-medium text-primary hover:underline"
                  data-testid="program-row"
                >
                  {row.name}
                </Link>
              ),
            },
            {
              key: "programType",
              header: "Type",
              cell: (row) => row.programType.replaceAll("_", " "),
            },
            {
              key: "isActive",
              header: "Status",
              cell: (row) => (
                <Badge variant={row.isActive ? "default" : "secondary"}>
                  {row.isActive ? "Active" : "Inactive"}
                </Badge>
              ),
            },
          ]}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              title="No programs yet"
              description="Programs and ministries will appear here once created."
            />
          }
        />
      </div>
    </div>
  );
}
