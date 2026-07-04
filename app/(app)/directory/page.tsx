"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { Input } from "@/components/ui/input";
import { apiRequest, isApiClientError } from "@/lib/api-client";

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
  const data = await apiRequest<{ ok: true; members: DirectoryMember[]; }>(
    "/api/parish/directory",
  );
  return data.members;
}

// MM-14: same-parish member directory — basic contact fields only. Pastoral
// dates and private notes live in satellite tables and never reach this surface.
export default function DirectoryPage() {
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");

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
          setError(
            isApiClientError(err)
              ? err.message
              : err instanceof Error
                ? err.message
                : "Unexpected error",
          );
          setBusy(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        (m.email?.toLowerCase().includes(q) ?? false),
    );
  }, [members, query]);

  if (busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Directory" description="Loading parish directory…" />
        <div className="flex-1 p-4 sm:p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Directory" description="Could not load directory." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Parish Member Directory"
        description="Active members of your parish. Contact details only — dates of birth and pastoral notes are never shown here."
      />

      <div className="flex-1 p-4 sm:p-6">
        <div className="mb-4">
          <Input
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members to display.</p>
        ) : (
          <ul
            data-testid="directory-list"
            className="divide-y rounded-md border"
          >
            {filtered.map((m) => (
              <li
                key={m.id}
                data-testid="directory-member"
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <span className="font-medium">
                  {m.firstName} {m.lastName}
                </span>
                <span className="text-sm text-muted-foreground">
                  {m.email ?? "—"}
                  {m.phone ? ` · ${m.phone}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
