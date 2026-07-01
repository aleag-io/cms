"use client";

import { useEffect, useState } from "react";

type DirectoryMember = {
  id: string;
  memberIdentifier: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
};

async function fetchDirectory(): Promise<DirectoryMember[]> {
  const res = await fetch("/api/parish/directory");
  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!res.ok || !data?.ok) {
    throw new Error(
      data?.error ??
        (res.status === 401 || res.status === 403
          ? "Sign in to view your parish directory."
          : `Request failed (${res.status}).`),
    );
  }
  return data.members as DirectoryMember[];
}

// MM-14: same-parish member directory — basic contact fields only. Pastoral
// dates and private notes live in satellite tables and never reach this surface.
export default function DirectoryPage() {
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDirectory().then(
      (rows) => {
        if (!cancelled) {
          setMembers(rows);
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          Parish Member Directory
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Active members of your parish. Contact details only — dates of birth
          and pastoral notes are never shown here.
        </p>
      </header>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        {busy ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-500">No members to display.</p>
        ) : (
          <ul data-testid="directory-list" className="divide-y divide-slate-100">
            {members.map((m) => (
              <li
                key={m.id}
                data-testid="directory-member"
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <span className="font-medium text-slate-900">
                  {m.firstName} {m.lastName}
                </span>
                <span className="text-sm text-slate-600">
                  {m.email ?? "—"}
                  {m.phone ? ` · ${m.phone}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
