"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { can } from "@/lib/permissions/resolver";
import type {
  PermissionAction,
  PermissionOverride,
  PermissionResource,
} from "@/lib/permissions/types";

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

// Pure fetch (no setState) so the mount effect only updates state asynchronously.
async function fetchOverrides(): Promise<OverrideRow[]> {
  const res = await fetch("/api/permissions/overrides");
  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!res.ok || !data?.ok) {
    throw new Error(
      data?.error ??
        (res.status === 401 || res.status === 403
          ? "Parish Admin access required."
          : `Request failed (${res.status}).`),
    );
  }
  return data.overrides as OverrideRow[];
}

export default function PermissionsSettingsPage() {
  const [role, setRole] = useState<string>(CONFIGURABLE_ROLES[0]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

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

  // Event-handler refresh (synchronous setState here is fine — not in an effect).
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setOverrides(await fetchOverrides());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchOverrides().then(
      (rows) => {
        if (!cancelled) {
          setOverrides(rows);
          setBusy(false);
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unexpected error");
          setBusy(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Does an explicit override exist for this role/resource/action?
  function overrideFor(resource: PermissionResource, action: PermissionAction) {
    return overrides.find(
      (o) =>
        o.role.toLowerCase() === role &&
        o.resource.toLowerCase() === resource &&
        o.action.toLowerCase() === action,
    );
  }

  async function toggle(
    resource: PermissionResource,
    action: PermissionAction,
  ) {
    const current = can([role], resource, action, resolverOverrides);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/permissions/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: role.toUpperCase(),
          resource: resource.toUpperCase(),
          action: action.toUpperCase(),
          isAllowed: !current,
        }),
      });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status}).`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          Church Admin Settings — Permissions
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Override the default permissions for each role in your parish (PA-12).
          You cannot grant a capability you do not hold yourself; every change is
          audited.
        </p>
      </header>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="role-select"
            className="text-sm font-medium text-slate-700"
          >
            Role
          </label>
          <select
            id="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {CONFIGURABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
          {busy ? (
            <span className="text-sm text-slate-400">Working…</span>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-4">Resource</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-3 py-2 text-center">
                    {label(a)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((resource) => (
                <tr key={resource} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium text-slate-900">
                    {label(resource)}
                  </td>
                  {ACTIONS.map((action) => {
                    const allowed = can(
                      [role],
                      resource,
                      action,
                      resolverOverrides,
                    );
                    const ov = overrideFor(resource, action);
                    return (
                      <td key={action} className="px-3 py-2 text-center">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggle(resource, action)}
                          title={
                            ov
                              ? `Overridden to ${allowed ? "allow" : "deny"}`
                              : "Default"
                          }
                          className={[
                            "inline-flex h-7 min-w-[64px] items-center justify-center rounded-full px-3 text-xs font-medium transition disabled:opacity-50",
                            allowed
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                            ov ? "ring-2 ring-indigo-300" : "",
                          ].join(" ")}
                        >
                          {allowed ? "Allow" : "Deny"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          A ring marks an explicit override. Click a cell to flip it; clicking
          again toggles the override the other way.
        </p>
      </section>
    </main>
  );
}
