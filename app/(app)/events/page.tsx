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

type EventRow = {
  id: string;
  name: string;
  eventType: string;
  startAt: string;
  endAt: string;
  maxCapacity: number | null;
  isPublic: boolean;
  recurrenceRule: string | null;
};

type LiturgicalRow = {
  id: string;
  title: string;
  observanceType: string;
  month: number | null;
  day: number | null;
  occursOn: string | null;
  parishId: string | null;
};

export default function EventsPage() {
  const { claims, isLoading: sessionLoading } = useSession();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [liturgical, setLiturgical] = useState<LiturgicalRow[]>([]);
  const [showLiturgical, setShowLiturgical] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const canManage =
    claims?.app_metadata.roles.some((role) =>
      ["parish_admin", "parish_staff"].includes(role),
    ) ?? false;

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    Promise.all([
      apiRequest<{ ok: true; events: EventRow[] }>("/api/events"),
      apiRequest<{ ok: true; observances: LiturgicalRow[] }>(
        "/api/liturgical?scope=all",
      ).catch(() => ({ ok: true as const, observances: [] as LiturgicalRow[] })),
    ])
      .then(([eventsRes, litRes]) => {
        if (!cancelled) {
          setEvents(eventsRes.events);
          setLiturgical(litRes.observances);
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
                : "Unable to load events",
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
        <PageHeader title="Events" description="Loading…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Events" description="Could not load." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Events"
        description="Parish calendar, RSVP capacity, and attendance."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/events/new">
                <PlusIcon className="mr-2 size-4" />
                Add event
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6" data-testid="events-calendar">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Parish events</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showLiturgical}
              onChange={(e) => setShowLiturgical(e.target.checked)}
              className="size-4 rounded border"
            />
            Show liturgical layer
          </label>
        </div>
        {showLiturgical && liturgical.length > 0 ? (
          <div
            className="rounded-lg border border-dashed p-4"
            data-testid="liturgical-overlay"
          >
            <h3 className="mb-2 text-sm font-medium">Liturgical calendar</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {liturgical.map((o) => (
                <li
                  key={o.id}
                  className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{o.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {o.parishId ? "Parish" : "Diocese"}
                    {o.month && o.day
                      ? ` · ${o.month}/${o.day}`
                      : o.occursOn
                        ? ` · ${o.occursOn.slice(0, 10)}`
                        : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DataTable
          rows={events}
          columns={[
            {
              key: "name",
              header: "Event",
              cell: (row) => (
                <Link
                  href={`/events/${row.id}`}
                  className="font-medium text-primary hover:underline"
                  data-testid="event-row"
                >
                  {row.name}
                </Link>
              ),
            },
            {
              key: "when",
              header: "When",
              cell: (row) =>
                new Date(row.startAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
            },
            {
              key: "type",
              header: "Type",
              cell: (row) => row.eventType.replaceAll("_", " "),
            },
            {
              key: "capacity",
              header: "Capacity",
              cell: (row) => row.maxCapacity ?? "—",
            },
            {
              key: "flags",
              header: "",
              cell: (row) => (
                <div className="flex gap-1">
                  {row.isPublic ? (
                    <Badge variant="secondary">Public</Badge>
                  ) : null}
                  {row.recurrenceRule ? (
                    <Badge variant="outline">Recurring</Badge>
                  ) : null}
                </div>
              ),
            },
          ]}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              title="No events"
              description="Create an event to open RSVP and attendance."
            />
          }
        />
      </div>
    </div>
  );
}
