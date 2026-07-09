"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/patterns/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { ApiClientError, apiRequest, isApiClientError } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
import { RequestsPanel } from "@/components/sharing/requests-panel";
import { GrantsPanel } from "@/components/sharing/grants-panel";
import { EmergencyPanel } from "@/components/sharing/emergency-panel";
import { ContextualPanel } from "@/components/sharing/contextual-panel";
import type {
  ContextualShare,
  EmergencyGrant,
  ParishOption,
  SharingGrant,
  SharingRequest,
} from "@/components/sharing/types";

function isHardFailure(err: unknown): boolean {
  if (!isApiClientError(err)) return true;
  return err.status === 401 || err.status === 403 || err.status >= 500;
}

export default function SharingPage() {
  const { claims, isLoading: sessionLoading } = useSession();
  const [tab, setTab] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [requests, setRequests] = useState<SharingRequest[]>([]);
  const [grants, setGrants] = useState<SharingGrant[]>([]);
  const [emergency, setEmergency] = useState<EmergencyGrant[]>([]);
  const [shares, setShares] = useState<ContextualShare[]>([]);
  const [parishes, setParishes] = useState<ParishOption[]>([]);

  const roles = claims?.app_metadata.roles ?? [];
  const dioceseId = claims?.app_metadata.diocese_id ?? null;
  const parishId = claims?.app_metadata.parish_id ?? null;

  const canCreateRequest = roles.some((r) =>
    ["diocese_admin", "diocese_staff"].includes(r),
  );
  const canReviewRequest =
    Boolean(parishId) &&
    roles.some((r) =>
      ["parish_admin", "parish_data_sharing_manager"].includes(r),
    );
  const canManageGrants = canReviewRequest;
  const canViewGrants = roles.some((r) =>
    [
      "parish_admin",
      "parish_data_sharing_manager",
      "diocese_admin",
      "diocese_staff",
      "diocese_report_viewer",
    ].includes(r),
  );
  const canInvokeEmergency = roles.includes("diocese_admin");
  const canViewEmergency = roles.some((r) =>
    [
      "diocese_admin",
      "diocese_staff",
      "parish_admin",
      "parish_data_sharing_manager",
    ].includes(r),
  );
  const canCreateShares =
    Boolean(parishId) &&
    roles.some((r) =>
      [
        "parish_admin",
        "parish_staff",
        "parish_data_sharing_manager",
        "clergy",
        "organization_leader",
        "ministry_leader",
      ].includes(r),
    );
  const canListRequests = canCreateRequest || canReviewRequest || canViewGrants;

  const parishNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parishes) map.set(p.id, p.name);
    // Parish-scoped actors never hit /api/parishes (diocese-only).
    if (parishId && !map.has(parishId)) {
      map.set(parishId, "This parish");
    }
    return map;
  }, [parishes, parishId]);

  const load = useCallback(async () => {
    setError(null);
    const hardErrors: string[] = [];

    async function safeLoad<T>(
      label: string,
      fn: () => Promise<T>,
      onOk: (value: T) => void,
      onSoftEmpty: () => void,
    ) {
      try {
        onOk(await fn());
      } catch (err) {
        if (isHardFailure(err)) {
          hardErrors.push(
            err instanceof ApiClientError
              ? `${label}: ${err.message}`
              : err instanceof Error
                ? `${label}: ${err.message}`
                : `${label}: failed`,
          );
        }
        onSoftEmpty();
      }
    }

    try {
      const tasks: Promise<void>[] = [];

      if (canListRequests) {
        tasks.push(
          safeLoad(
            "Requests",
            () =>
              apiRequest<{ ok: true; requests: SharingRequest[] }>(
                "/api/sharing/requests",
              ),
            (r) => setRequests(r.requests),
            () => setRequests([]),
          ),
        );
      }

      if (canViewGrants) {
        tasks.push(
          safeLoad(
            "Grants",
            () =>
              apiRequest<{ ok: true; grants: SharingGrant[] }>(
                "/api/sharing/grants",
              ),
            (r) => setGrants(r.grants),
            () => setGrants([]),
          ),
        );
      }

      if (canViewEmergency) {
        tasks.push(
          safeLoad(
            "Emergency",
            () =>
              apiRequest<{ ok: true; grants: EmergencyGrant[] }>(
                "/api/sharing/emergency",
              ),
            (r) => setEmergency(r.grants),
            () => setEmergency([]),
          ),
        );
      }

      if (canCreateShares) {
        tasks.push(
          safeLoad(
            "Shares",
            () =>
              apiRequest<{ ok: true; shares: ContextualShare[] }>("/api/shares"),
            (r) => setShares(r.shares),
            () => setShares([]),
          ),
        );
      }

      if (canCreateRequest || canInvokeEmergency) {
        tasks.push(
          safeLoad(
            "Parishes",
            () =>
              apiRequest<{ ok: true; parishes: ParishOption[] }>(
                "/api/parishes",
              ),
            (r) => setParishes(r.parishes),
            () => setParishes([]),
          ),
        );
      }

      await Promise.all(tasks);
      if (hardErrors.length > 0) {
        setError(hardErrors.join(" · "));
      }
    } finally {
      setBusy(false);
    }
  }, [
    canCreateRequest,
    canCreateShares,
    canInvokeEmergency,
    canListRequests,
    canViewEmergency,
    canViewGrants,
  ]);

  useEffect(() => {
    if (sessionLoading) return;
    queueMicrotask(() => {
      void load();
    });
  }, [sessionLoading, load]);

  // Pick a default tab once roles are known.
  useEffect(() => {
    if (sessionLoading || tab) return;
    const defaultTab = canListRequests
      ? "requests"
      : canViewGrants
        ? "grants"
        : canViewEmergency
          ? "emergency"
          : canCreateShares
            ? "contextual"
            : "";
    if (defaultTab) {
      queueMicrotask(() => setTab(defaultTab));
    }
  }, [
    sessionLoading,
    tab,
    canListRequests,
    canViewGrants,
    canViewEmergency,
    canCreateShares,
  ]);

  if (sessionLoading || busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader
          title="Data sharing"
          description="Loading sharing governance…"
        />
        <div className="flex-1 p-4 sm:p-6">
          <PageSkeleton rows={8} />
        </div>
      </div>
    );
  }

  if (error && requests.length === 0 && grants.length === 0) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Data sharing" description="Could not load console." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Data sharing"
        description="Governed requests, grants, emergency access, and contextual shares. Revocation is immediate and audited. Secure-link tokens are never stored in plaintext."
      />

      <div className="flex-1 p-4 sm:p-6">
        {error ? (
          <p className="mb-4 text-sm text-destructive" role="alert">
            Partial load issues: {error}
          </p>
        ) : null}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 flex h-auto flex-wrap">
            {canListRequests ? (
              <TabsTrigger value="requests">Requests</TabsTrigger>
            ) : null}
            {canViewGrants ? (
              <TabsTrigger value="grants">Grants</TabsTrigger>
            ) : null}
            {canViewEmergency ? (
              <TabsTrigger value="emergency">Emergency</TabsTrigger>
            ) : null}
            {canCreateShares ? (
              <TabsTrigger value="contextual">Contextual shares</TabsTrigger>
            ) : null}
          </TabsList>

          {canListRequests ? (
            <TabsContent value="requests">
              <RequestsPanel
                requests={requests}
                parishes={parishes}
                canCreate={canCreateRequest}
                canReview={canReviewRequest}
                parishNameById={parishNameById}
                onChanged={load}
              />
            </TabsContent>
          ) : null}

          {canViewGrants ? (
            <TabsContent value="grants">
              <GrantsPanel
                grants={grants}
                canManage={canManageGrants}
                dioceseId={dioceseId}
                parishNameById={parishNameById}
                onChanged={load}
              />
            </TabsContent>
          ) : null}

          {canViewEmergency ? (
            <TabsContent value="emergency">
              <EmergencyPanel
                grants={emergency}
                parishes={parishes}
                canInvoke={canInvokeEmergency}
                canRevoke={canInvokeEmergency}
                parishNameById={parishNameById}
                onChanged={load}
              />
            </TabsContent>
          ) : null}

          {canCreateShares ? (
            <TabsContent value="contextual">
              <ContextualPanel
                shares={shares}
                canCreate={canCreateShares}
                onChanged={load}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}
