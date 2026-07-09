"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { useSession } from "@/hooks/use-session";

type EventRow = {
  id: string;
  name: string;
  description: string | null;
  eventType: string;
  startAt: string;
  endAt: string;
  maxCapacity: number | null;
  isPublic: boolean;
  recurrenceRule: string | null;
};

type Attendance = {
  id: string;
  memberId: string;
  rsvpStatus: string;
  attended: boolean;
  member: { id: string; firstName: string; lastName: string };
};

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { claims, isLoading: sessionLoading } = useSession();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [rsvpBusy, setRsvpBusy] = useState(false);

  const canManageAttendance =
    claims?.app_metadata.roles.some((role) =>
      ["parish_admin", "parish_staff"].includes(role),
    ) ?? false;
  const canRsvp =
    claims?.app_metadata.roles.some((role) =>
      ["member", "parish_admin", "parish_staff"].includes(role),
    ) ?? false;

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const eventsRes = await apiRequest<{ ok: true; events: EventRow[] }>(
        "/api/events",
      );
      const found = eventsRes.events.find((e) => e.id === eventId) ?? null;
      if (!found) {
        setError("Event not found.");
        setEvent(null);
        setBusy(false);
        return;
      }
      setEvent(found);

      if (canManageAttendance) {
        const attRes = await apiRequest<{ ok: true; attendance: Attendance[] }>(
          `/api/events/${eventId}/attendance`,
        );
        setAttendance(attRes.attendance);
      }
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load event",
      );
    } finally {
      setBusy(false);
    }
  }, [eventId, canManageAttendance]);

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [load, sessionLoading]);

  async function submitRsvp(rsvpStatus: string) {
    setRsvpBusy(true);
    try {
      await apiRequest(`/api/events/${eventId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ rsvpStatus }),
      });
      toast.success(`RSVP recorded: ${rsvpStatus}`);
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "RSVP failed",
      );
    } finally {
      setRsvpBusy(false);
    }
  }

  async function toggleAttended(memberId: string, attended: boolean) {
    try {
      await apiRequest(`/api/events/${eventId}/attendance`, {
        method: "PATCH",
        body: JSON.stringify({ memberId, attended }),
      });
      toast.success(attended ? "Marked attended" : "Marked not attended");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Update failed",
      );
    }
  }

  if (sessionLoading || busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Event" description="Loading…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Event" description="Could not load." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error ?? "Not found"} />
        </div>
      </div>
    );
  }

  const yesCount = attendance.filter((a) => a.rsvpStatus === "YES").length;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={event.name}
        description={`${event.eventType.replaceAll("_", " ")} · ${new Date(
          event.startAt,
        ).toLocaleString()}`}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {event.description ? <p>{event.description}</p> : null}
            <p>
              <span className="text-muted-foreground">Ends: </span>
              {new Date(event.endAt).toLocaleString()}
            </p>
            <p>
              <span className="text-muted-foreground">Capacity: </span>
              {event.maxCapacity != null
                ? `${yesCount} / ${event.maxCapacity} YES RSVPs`
                : "Unlimited"}
            </p>
            {event.recurrenceRule ? (
              <p>
                <span className="text-muted-foreground">Recurrence: </span>
                {event.recurrenceRule}
              </p>
            ) : null}
            <div className="flex gap-2">
              {event.isPublic ? <Badge variant="secondary">Public</Badge> : null}
            </div>
          </CardContent>
        </Card>

        {canRsvp ? (
          <Card data-testid="event-rsvp">
            <CardHeader>
              <CardTitle className="text-base">Your RSVP</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(["YES", "NO", "MAYBE"] as const).map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant={status === "YES" ? "default" : "outline"}
                  disabled={rsvpBusy}
                  onClick={() => void submitRsvp(status)}
                >
                  {status}
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {canManageAttendance ? (
          <Card data-testid="event-attendance">
            <CardHeader>
              <CardTitle className="text-base">Attendance roster</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                rows={attendance}
                columns={[
                  {
                    key: "name",
                    header: "Member",
                    cell: (row) =>
                      `${row.member.lastName}, ${row.member.firstName}`,
                  },
                  {
                    key: "rsvp",
                    header: "RSVP",
                    cell: (row) => (
                      <Badge variant="secondary">{row.rsvpStatus}</Badge>
                    ),
                  },
                  {
                    key: "attended",
                    header: "Attended",
                    cell: (row) => (
                      <Select
                        value={row.attended ? "yes" : "no"}
                        onValueChange={(v) =>
                          void toggleAttended(row.memberId, v === "yes")
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    ),
                  },
                ]}
                getRowKey={(row) => row.id}
                empty={
                  <EmptyState
                    title="No RSVPs yet"
                    description="Attendance appears as members respond."
                  />
                }
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
