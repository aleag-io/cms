"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { useSession } from "@/hooks/use-session";

type Facility = {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
};

type Booking = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  facilityId: string;
  facility: { id: string; name: string };
};

export default function FacilitiesPage() {
  const { claims, isLoading: sessionLoading } = useSession();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [facilityName, setFacilityName] = useState("");
  const [facilityCapacity, setFacilityCapacity] = useState("");
  const [facilityLocation, setFacilityLocation] = useState("");

  const [bookingFacilityId, setBookingFacilityId] = useState("");
  const [bookingTitle, setBookingTitle] = useState("");
  const [bookingStart, setBookingStart] = useState("");
  const [bookingEnd, setBookingEnd] = useState("");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");

  const canManage =
    claims?.app_metadata.roles.some((role) =>
      ["parish_admin", "parish_staff"].includes(role),
    ) ?? false;

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [facRes, bookRes] = await Promise.all([
        apiRequest<{ ok: true; facilities: Facility[] }>("/api/facilities"),
        apiRequest<{ ok: true; bookings: Booking[] }>(
          "/api/facilities/bookings",
        ),
      ]);
      setFacilities(facRes.facilities);
      setBookings(bookRes.bookings);
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load facilities",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [load, sessionLoading]);

  async function createFacility() {
    if (!facilityName.trim()) return;
    try {
      await apiRequest("/api/facilities", {
        method: "POST",
        body: JSON.stringify({
          name: facilityName,
          capacity: facilityCapacity ? Number(facilityCapacity) : null,
          location: facilityLocation || null,
        }),
      });
      toast.success("Facility created");
      setFacilityName("");
      setFacilityCapacity("");
      setFacilityLocation("");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Create failed",
      );
    }
  }

  async function createBooking() {
    if (
      !bookingFacilityId ||
      !bookingTitle.trim() ||
      !bookingStart ||
      !bookingEnd
    )
      return;
    try {
      await apiRequest("/api/facilities/bookings", {
        method: "POST",
        body: JSON.stringify({
          facilityId: bookingFacilityId,
          title: bookingTitle,
          startAt: new Date(bookingStart).toISOString(),
          endAt: new Date(bookingEnd).toISOString(),
        }),
      });
      toast.success("Booking created");
      setBookingTitle("");
      setBookingStart("");
      setBookingEnd("");
      await load();
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        setConflictMessage(
          err.message || "Facility is already booked for that time",
        );
        setConflictOpen(true);
        return;
      }
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Booking failed",
      );
    }
  }

  if (sessionLoading || busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Facilities" description="Loading…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Facilities" description="Could not load." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Facilities"
        description="Rooms and resources with double-booking prevention (DB EXCLUDE)."
      />
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add facility</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="facility-name">Name</Label>
                <Input
                  id="facility-name"
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facility-capacity">Capacity</Label>
                <Input
                  id="facility-capacity"
                  type="number"
                  value={facilityCapacity}
                  onChange={(e) => setFacilityCapacity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facility-location">Location</Label>
                <Input
                  id="facility-location"
                  value={facilityLocation}
                  onChange={(e) => setFacilityLocation(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => void createFacility()}
                disabled={!facilityName.trim()}
              >
                Create
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facilities</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={facilities}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  cell: (row) => (
                    <span data-testid="facility-row">{row.name}</span>
                  ),
                },
                {
                  key: "capacity",
                  header: "Capacity",
                  cell: (row) => row.capacity ?? "—",
                },
                {
                  key: "location",
                  header: "Location",
                  cell: (row) => row.location ?? "—",
                },
              ]}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="No facilities"
                  description="Add a facility to start booking."
                />
              }
            />
          </CardContent>
        </Card>

        {canManage ? (
          <Card data-testid="booking-form">
            <CardHeader>
              <CardTitle className="text-base">Book facility</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="booking-facility">Facility</Label>
                <Select
                  value={bookingFacilityId}
                  onValueChange={setBookingFacilityId}
                >
                  <SelectTrigger id="booking-facility">
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-title">Title</Label>
                <Input
                  id="booking-title"
                  value={bookingTitle}
                  onChange={(e) => setBookingTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-start">Starts</Label>
                <Input
                  id="booking-start"
                  type="datetime-local"
                  value={bookingStart}
                  onChange={(e) => setBookingStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-end">Ends</Label>
                <Input
                  id="booking-end"
                  type="datetime-local"
                  value={bookingEnd}
                  onChange={(e) => setBookingEnd(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => void createBooking()}
                disabled={
                  !bookingFacilityId ||
                  !bookingTitle.trim() ||
                  !bookingStart ||
                  !bookingEnd
                }
              >
                Book
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card data-testid="booking-calendar">
          <CardHeader>
            <CardTitle className="text-base">Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={bookings}
              columns={[
                {
                  key: "facility",
                  header: "Facility",
                  cell: (row) => row.facility.name,
                },
                {
                  key: "title",
                  header: "Title",
                  cell: (row) => row.title,
                },
                {
                  key: "when",
                  header: "When",
                  cell: (row) =>
                    `${new Date(row.startAt).toLocaleString()} – ${new Date(
                      row.endAt,
                    ).toLocaleTimeString()}`,
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (row) => row.status,
                },
              ]}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="No bookings"
                  description="Bookings appear once created."
                />
              }
            />
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <AlertDialogContent data-testid="booking-conflict-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Booking conflict</AlertDialogTitle>
            <AlertDialogDescription>{conflictMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
