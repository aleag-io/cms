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
import {
  membershipModeDisplay,
  organizationTypeLabel,
} from "@/lib/organizations/display";

type Organization = {
  id: string;
  name: string;
  organizationType: string;
  membershipMode: string;
  isActive: boolean;
};

export default function OrganizationsPage() {
  const { claims, isLoading: sessionLoading } = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const canManage =
    claims?.app_metadata.roles.some((role) =>
      ["parish_admin", "parish_staff"].includes(role),
    ) ?? false;

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    apiRequest<{ ok: true; organizations: Organization[] }>("/api/organizations")
      .then((res) => {
        if (!cancelled) {
          setOrganizations(res.organizations);
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
                : "Unable to load organizations",
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
        <PageHeader title="Organizations" description="Loading…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Organizations" description="Could not load." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Organizations"
        description="Typed parish organizations with open or exclusive membership."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/organizations/new">
                <PlusIcon className="mr-2 size-4" />
                Add organization
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex-1 p-4 sm:p-6">
        <DataTable
          rows={organizations}
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (row) => (
                <Link
                  href={`/organizations/${row.id}`}
                  className="font-medium text-primary hover:underline"
                  data-testid="organization-row"
                >
                  {row.name}
                </Link>
              ),
            },
            {
              key: "type",
              header: "Type",
              cell: (row) => organizationTypeLabel(row.organizationType),
            },
            {
              key: "mode",
              header: "Membership",
              cell: (row) => {
                const mode = membershipModeDisplay(
                  row.organizationType,
                  row.membershipMode,
                );
                return (
                  <span>
                    {mode.label}
                    {mode.isDefault ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (default)
                      </span>
                    ) : null}
                  </span>
                );
              },
            },
            {
              key: "status",
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
              title="No organizations"
              description="Organizations will appear once created."
            />
          }
        />
      </div>
    </div>
  );
}
