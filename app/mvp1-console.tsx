"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  parishId: string | null;
};

type Family = {
  id: string;
  familyNumber: string;
  familyName: string;
};

type Member = {
  id: string;
  memberIdentifier: string;
  firstName: string;
  lastName: string;
  status: string;
  family: Family | null;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  action: string;
  actorLabel: string;
  outcome: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  // The body may not be JSON (e.g. an auth redirect to /login HTML, or an
  // unhandled 500 error page). Read text first so we can surface a real
  // message instead of an opaque "Unexpected end of JSON input".
  const raw = await response.text();
  let data: (T & { ok?: boolean; error?: string }) | null = null;
  try {
    data = raw ? (JSON.parse(raw) as T & { ok?: boolean; error?: string }) : null;
  } catch {
    data = null;
  }

  if (data === null) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Your session has expired — please sign in again."
        : `Request failed (${response.status} ${response.statusText}).`,
    );
  }

  if (!response.ok || ("ok" in data && data.ok === false)) {
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }

  return data;
}

export function Mvp1Console() {
  const router = useRouter();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  const [newFamily, setNewFamily] = useState({
    familyNumber: "",
    familyName: "",
  });
  const [newMember, setNewMember] = useState({
    familyId: "",
    firstName: "",
    lastName: "",
  });

  const canManage = useMemo(
    () =>
      sessionUser !== null &&
      ["DIOCESE_ADMIN", "PARISH_ADMIN", "PARISH_STAFF"].includes(
        sessionUser.role,
      ),
    [sessionUser],
  );

  async function refreshAll() {
    const session = await api<{ user: SessionUser | null }>("/api/session");
    setSessionUser(session.user);

    if (session.user) {
      const [familyData, memberData, auditData] = await Promise.all([
        api<{ families: Family[] }>("/api/families"),
        api<{ members: Member[] }>("/api/members"),
        api<{ auditEntries: AuditEntry[] }>("/api/audit"),
      ]);
      setFamilies(familyData.families);
      setMembers(memberData.members);
      setAuditEntries(auditData.auditEntries);
    }
  }

  async function withBusy(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refreshAll();
      } catch {
        if (!cancelled) setSessionUser(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onBootstrap() {
    void withBusy(async () => {
      await api("/api/bootstrap", { method: "POST" });
      await refreshAll();
    });
  }

  function onLogout() {
    void withBusy(async () => {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push("/login");
    });
  }

  function onCreateFamily(event: FormEvent) {
    event.preventDefault();
    void withBusy(async () => {
      await api("/api/families", {
        method: "POST",
        body: JSON.stringify(newFamily),
      });
      setNewFamily({ familyNumber: "", familyName: "" });
      await refreshAll();
    });
  }

  function onCreateMember(event: FormEvent) {
    event.preventDefault();
    void withBusy(async () => {
      await api("/api/members", {
        method: "POST",
        body: JSON.stringify({
          ...newMember,
          familyId: newMember.familyId || undefined,
        }),
      });
      setNewMember({ familyId: "", firstName: "", lastName: "" });
      await refreshAll();
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          CMS MVP1 Console
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Foundation + tenancy + identity + core membership + audit.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Session & Setup
          </h2>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {sessionUser ? (
              <p>
                Signed in as <strong>{sessionUser.displayName}</strong> (
                {sessionUser.role})
              </p>
            ) : (
              <p className="text-amber-700">
                Authenticated but no tenant found — bootstrap the demo tenant
                below.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBootstrap}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Bootstrap Demo Tenant
            </button>
            <button
              type="button"
              onClick={onLogout}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Sign out
            </button>
            {sessionUser?.role === "PARISH_ADMIN" ? (
              <a
                href="/settings/permissions"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Permissions Settings
              </a>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            MVP1 Scope Status
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>✓ Supabase Auth (email + password)</li>
            <li>✓ Tenant bootstrap + parish onboarding API</li>
            <li>✓ Role-aware access checks</li>
            <li>✓ Parish-scoped family and member CRUD</li>
            <li>✓ Per-action audit logging</li>
          </ul>
          {error ? (
            <p className="mt-4 text-sm text-red-700">{error}</p>
          ) : null}
        </article>
      </section>

      {sessionUser ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Families</h2>

            {canManage ? (
              <form
                onSubmit={onCreateFamily}
                className="mt-4 grid gap-2 sm:grid-cols-3"
              >
                <input
                  value={newFamily.familyNumber}
                  onChange={(event) =>
                    setNewFamily((c) => ({
                      ...c,
                      familyNumber: event.target.value,
                    }))
                  }
                  placeholder="Family Number"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  value={newFamily.familyName}
                  onChange={(event) =>
                    setNewFamily((c) => ({
                      ...c,
                      familyName: event.target.value,
                    }))
                  }
                  placeholder="Family Name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  Add Family
                </button>
              </form>
            ) : null}

            <div className="mt-4 space-y-2">
              {families.map((family) => (
                <div
                  key={family.id}
                  className="rounded-lg border border-slate-200 p-3 text-sm"
                >
                  <p className="font-medium text-slate-900">
                    {family.familyNumber} - {family.familyName}
                  </p>
                </div>
              ))}
              {families.length === 0 ? (
                <p className="text-sm text-slate-500">No families yet.</p>
              ) : null}
            </div>
          </article>

          <article className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Members</h2>

            {canManage ? (
              <form
                onSubmit={onCreateMember}
                className="mt-4 grid gap-2 sm:grid-cols-2"
              >
                <select
                  aria-label="Member family"
                  value={newMember.familyId}
                  onChange={(event) =>
                    setNewMember((c) => ({
                      ...c,
                      familyId: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">No Family</option>
                  {families.map((family) => (
                    <option key={family.id} value={family.id}>
                      {family.familyNumber} - {family.familyName}
                    </option>
                  ))}
                </select>
                <input
                  value={newMember.firstName}
                  onChange={(event) =>
                    setNewMember((c) => ({
                      ...c,
                      firstName: event.target.value,
                    }))
                  }
                  placeholder="First Name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  value={newMember.lastName}
                  onChange={(event) =>
                    setNewMember((c) => ({
                      ...c,
                      lastName: event.target.value,
                    }))
                  }
                  placeholder="Last Name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  Add Member
                </button>
              </form>
            ) : null}

            <div className="mt-4 space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-lg border border-slate-200 p-3 text-sm"
                >
                  <p className="font-medium text-slate-900">
                    {member.memberIdentifier} - {member.firstName}{" "}
                    {member.lastName}
                  </p>
                  <p className="text-slate-600">
                    {member.status}
                    {member.family ? `, ${member.family.familyName}` : ""}
                  </p>
                </div>
              ))}
              {members.length === 0 ? (
                <p className="text-sm text-slate-500">No members yet.</p>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {sessionUser ? (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Audit Trail</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">Time</th>
                  <th className="py-2">Actor</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-600">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2">{entry.actorLabel}</td>
                    <td className="py-2">{entry.action}</td>
                    <td className="py-2">{entry.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditEntries.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No audit entries yet.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
