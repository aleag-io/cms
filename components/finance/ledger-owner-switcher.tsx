"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BuildingsIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { apiRequest } from "@/lib/api-client";

type Organization = {
  id: string;
  name: string;
  hasOwnLedger: boolean;
};

type OwnerOption = {
  value: string;
  label: string;
};

export type FinanceLedgerOwnerState = {
  owner: string;
  isReady: boolean;
  isForbidden: boolean;
  canWrite: boolean;
  canManageGiving: boolean;
  options: OwnerOption[];
  onOwnerChange: (owner: string) => void;
};

const PARISH_WRITERS = new Set(["parish_admin", "parish_staff"]);

/**
 * Resolve the visible ledger owner from the URL and the RLS-backed organization
 * list. The URL remains the source of truth; this hook only mirrors what the API
 * is expected to authorize so disallowed owner IDs degrade to ForbiddenState.
 */
export function useFinanceLedgerOwner(): FinanceLedgerOwnerState {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOwner = searchParams.get("owner")?.trim().toLowerCase() ?? "";
  const { claims, isLoading: sessionLoading } = useSession();

  const roles = useMemo(
    () => new Set((claims?.app_metadata.roles ?? []).map((role) => role.toLowerCase())),
    [claims],
  );
  const parishId = claims?.app_metadata.parish_id ?? null;
  const leaderIds = useMemo(
    () => claims?.app_metadata.org_leader_ids ?? [],
    [claims],
  );
  const canListOrganizations = Boolean(
    parishId &&
      [...roles].some((role) =>
        ["parish_admin", "parish_staff", "organization_leader"].includes(role),
      ),
  );

  const organizationsQuery = useQuery({
    queryKey: ["finance", "ledger-organizations", parishId],
    enabled: canListOrganizations,
    queryFn: () =>
      apiRequest<{ ok: true; organizations: Organization[] }>("/api/organizations"),
  });

  const options = useMemo<OwnerOption[]>(() => {
    const result: OwnerOption[] = [];
    const isParishOperator = [...roles].some((role) => PARISH_WRITERS.has(role));
    const isParishAdmin = roles.has("parish_admin");
    const isOrgLeader = roles.has("organization_leader");

    if (parishId && isParishOperator) {
      result.push({ value: "parish", label: "Parish general ledger" });
    }

    const organizations = organizationsQuery.data?.organizations ?? [];
    for (const organization of organizations) {
      if (!organization.hasOwnLedger) continue;
      if (isOrgLeader && !isParishAdmin && !leaderIds.includes(organization.id)) {
        continue;
      }
      if (!isParishAdmin && !isOrgLeader) continue;
      result.push({
        value: `org:${organization.id}`,
        label: organization.name,
      });
    }

    return result;
  }, [leaderIds, organizationsQuery.data, parishId, roles]);

  const isOrganizationDependent =
    roles.has("organization_leader") &&
    !roles.has("parish_admin") &&
    !roles.has("parish_staff");
  const owner =
    requestedOwner ||
    (parishId && [...roles].some((role) => PARISH_WRITERS.has(role))
      ? "parish"
      : isOrganizationDependent
        ? (options[0]?.value ?? "")
        : "");

  const isReady =
    !sessionLoading &&
    (!canListOrganizations || !organizationsQuery.isLoading);

  useEffect(() => {
    if (!isReady || requestedOwner || !owner) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("owner", owner);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [isReady, owner, pathname, requestedOwner, router, searchParams]);

  const currentOrgId = owner.startsWith("org:") ? owner.slice(4) : null;
  const isGrantedParish = owner.startsWith("parish:") && !parishId;
  const isKnownOption = options.some((option) => option.value === owner);
  const isForbidden = Boolean(
    isReady &&
      (!owner ||
        (!isKnownOption &&
          !isGrantedParish &&
          !(owner === "parish" && parishId))),
  );

  const canWrite =
    !isForbidden &&
    (owner === "parish"
      ? [...roles].some((role) => PARISH_WRITERS.has(role))
      : currentOrgId
        ? leaderIds.includes(currentOrgId)
        : false);
  const canManageGiving = [...roles].some((role) =>
    ["parish_admin", "parish_staff"].includes(role),
  );

  function onOwnerChange(nextOwner: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("owner", nextOwner);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return {
    owner,
    isReady,
    isForbidden,
    canWrite,
    canManageGiving,
    options,
    onOwnerChange,
  };
}

export function LedgerOwnerSwitcher({
  state,
}: {
  state: FinanceLedgerOwnerState;
}) {
  if (!state.isReady) {
    return <Badge variant="outline">Loading ledger…</Badge>;
  }

  if (state.owner.startsWith("parish:") && state.options.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline">Granted parish ledger</Badge>
        <Badge variant="secondary">Read only</Badge>
      </div>
    );
  }

  if (state.options.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="h-7 gap-1.5 px-2.5">
          <BuildingsIcon className="size-3.5" />
          {state.options[0]?.label ?? "Ledger unavailable"}
        </Badge>
        {!state.canWrite && state.owner ? (
          <Badge variant="secondary">Read only</Badge>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={state.owner} onValueChange={state.onOwnerChange}>
        <SelectTrigger aria-label="Ledger owner" className="max-w-64">
          <BuildingsIcon className="size-3.5 text-muted-foreground" />
          <SelectValue placeholder="Select ledger" />
        </SelectTrigger>
        <SelectContent align="end">
          {state.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!state.canWrite ? <Badge variant="secondary">Read only</Badge> : null}
    </div>
  );
}
