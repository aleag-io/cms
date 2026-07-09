"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/patterns/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
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

export default function SharingPage() {
  const { claims, isLoading: sessionLoading } = useSession();
  const [tab, setTab] = useState("requests");
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
  // Review/grant manage need a parish scope (home parish or diocese work-context).
  // Diocese admin work-context elevates to parish_admin in claims for UX.
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

  const parishNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parishes) map.set(p.id, p.name);
    return map;
  }, [parishes]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const tasks: Promise<void>[] = [];

      tasks.push(
        apiRequest<{ ok: true; requests: SharingRequest[] }>("/api/sharing/requests")
          .then((r) => {
            setRequests(r.requests);
          })
          .catch(() => {
            setRequests([]);
          }),
      );

      if (canViewGrants) {
        tasks.push(
          apiRequest<{ ok: true; grants: SharingGrant[] }>("/api/sharing/grants")
            .then((r) => {
              setGrants(r.grants);
            })
            .catch(() => {
              setGrants([]);
            }),
        );
      }

      if (canViewEmergency) {
        tasks.push(
          apiRequest<{ ok: true; grants: EmergencyGrant[] }>(
            "/api/sharing/emergency",
          )
            .then((r) => {
              setEmergency(r.grants);
            })
            .catch(() => {
              setEmergency([]);
            }),
        );
      }

      if (canCreateShares) {
        tasks.push(
          apiRequest<{ ok: true; shares: ContextualShare[] }>("/api/shares")
            .then((r) => {
              setShares(r.shares);
            })
            .catch(() => {
              setShares([]);
            }),
        );
      }

      // Diocese actors need the parish list for request/emergency forms.
      if (canCreateRequest || canInvokeEmergency) {
        tasks.push(
          apiRequest<{ ok: true; parishes: ParishOption[] }>("/api/parishes")
            .then((r) => {
              setParishes(r.parishes);
            })
            .catch(() => {
              setParishes([]);
            }),
        );
      }

      await Promise.all(tasks);
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load sharing console",
      );
    } finally {
      setBusy(false);
    }
  }, [
    canCreateRequest,
    canCreateShares,
    canInvokeEmergency,
    canViewEmergency,
    canViewGrants,
  ]);

  useEffect(() => {
    if (sessionLoading) return;
    // Defer so setState is not synchronous inside the effect body (eslint).
    queueMicrotask(() => {
      void load();
    });
  }, [sessionLoading, load]);

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

  if (error) {
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
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 flex h-auto flex-wrap">
            <TabsTrigger value="requests">Requests</TabsTrigger>
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
