"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { can } from "@/lib/permissions/resolver";
import type {
  PermissionAction,
  PermissionOverride,
  PermissionResource,
} from "@/lib/permissions/types";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Roles a Parish Admin may configure (PA-12). Excludes admin/diocese roles,
// which sit at or above the configuring authority.
const CONFIGURABLE_ROLES = [
  "parish_staff",
  "clergy",
  "pastoral_data_accessor",
  "ministry_leader",
  "organization_leader",
  "member",
] as const;

const RESOURCES: PermissionResource[] = [
  "member_profile",
  "member_private_note",
  "member_pastoral_data",
  "parish_directory",
  "member_export",
  "parish_officer",
];

const ACTIONS: PermissionAction[] = ["read", "write", "delete", "export"];

type OverrideRow = {
  role: string;
  resource: string;
  action: string;
  isAllowed: boolean;
};

const label = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function fetchOverrides(): Promise<OverrideRow[]> {
  const data = await apiRequest<{ ok: true; overrides: OverrideRow[]; }>(
    "/api/permissions/overrides",
  );
  return data.overrides;
}

export default function PermissionsSettingsPage() {
  const { claims, isLoading: sessionLoading } = useSession();
  const [role, setRole] = useState<string>(CONFIGURABLE_ROLES[0]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const actorRoles = claims?.app_metadata.roles ?? [];

  const resolverOverrides: PermissionOverride[] = useMemo(
    () =>
      overrides.map((o) => ({
        role: o.role.toLowerCase(),
        resource: o.resource.toLowerCase() as PermissionResource,
        action: o.action.toLowerCase() as PermissionAction,
        isAllowed: o.isAllowed,
      })),
    [overrides],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const rows = await fetchOverrides();
      setOverrides(rows);
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unexpected error",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    fetchOverrides()
      .then((rows) => {
        if (!cancelled) {
          setOverrides(rows);
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
                : "Unexpected error",
          );
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLoading]);

  function overrideFor(resource: PermissionResource, action: PermissionAction) {
    return overrides.find(
      (o) =>
        o.role.toLowerCase() === role &&
        o.resource.toLowerCase() === resource &&
        o.action.toLowerCase() === action,
    );
  }

  // Escalation guard: the actor must themselves hold the capability they are
  // trying to grant. This mirrors the server-side resolver truth table.
  function canActorGrant(
    resource: PermissionResource,
    action: PermissionAction,
  ) {
    return can(actorRoles, resource, action, resolverOverrides);
  }

  async function toggle(
    resource: PermissionResource,
    action: PermissionAction,
  ) {
    const current = can([role], resource, action, resolverOverrides);
    const desired = !current;

    if (desired && !canActorGrant(resource, action)) {
      toast.error(
        `You cannot grant ${action} on ${label(resource)} because you do not hold that capability yourself.`,
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest<{ ok: true; }>("/api/permissions/overrides", {
        method: "PUT",
        body: JSON.stringify({
          role: role.toUpperCase(),
          resource: resource.toUpperCase(),
          action: action.toUpperCase(),
          isAllowed: desired,
        }),
      });
      toast.success("Permission updated");
      await refresh();
    } catch (err) {
      const message = isApiClientError(err)
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unexpected error";
      setError(message);
      toast.error(message);
      setBusy(false);
    }
  }

  if (sessionLoading || busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader
          title="Permissions"
          description="Loading permission matrix…"
        />
        <div className="flex-1 p-4 sm:p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader
          title="Permissions"
          description="Could not load permissions."
        />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error} retry={refresh} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Permissions"
        description="Override default permissions for each role in your parish. You cannot grant a capability you do not hold yourself."
      />

      <div className="flex-1 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label
            htmlFor="role-select"
            className="text-sm font-medium text-muted-foreground"
          >
            Role
          </label>
          <select
            id="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {CONFIGURABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
          {busy ? (
            <span className="text-sm text-muted-foreground">Working…</span>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="py-2 pr-4 pl-4">Resource</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-3 py-2 text-center capitalize">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((resource) => (
                <tr key={resource} className="border-b last:border-b-0">
                  <td className="py-3 pr-4 pl-4 font-medium">
                    {label(resource)}
                  </td>
                  {ACTIONS.map((action) => {
                    const explicit = overrideFor(resource, action);
                    const allowed = can(
                      [role],
                      resource,
                      action,
                      resolverOverrides,
                    );
                    const canGrant = canActorGrant(resource, action);
                    return (
                      <td key={action} className="px-3 py-2 text-center">
                        <Button
                          type="button"
                          variant={allowed ? "default" : "outline"}
                          size="sm"
                          disabled={!canGrant}
                          onClick={() => toggle(resource, action)}
                        >
                          {allowed ? "Yes" : "No"}
                          {explicit ? (
                            <Badge
                              variant="secondary"
                              className="ml-2 text-[10px]"
                            >
                              override
                            </Badge>
                          ) : null}
                        </Button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
