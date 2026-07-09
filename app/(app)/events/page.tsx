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

export default function EventsPage() {
  const { claims, isLoading: sessionLoading } = useSession();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const canManage =
    claims?.app_metadata.roles.some((role) =>
      ["parish_admin", "parish_staff"].includes(role),
    ) ?? false;

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    apiRequest<{ ok: true; events: EventRow[] }>("/api/events")
      .then((res) => {
        if (!cancelled) {
          setEvents(res.events);
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
      <div className="flex-1 p-4 sm:p-6" data-testid="events-calendar">
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
