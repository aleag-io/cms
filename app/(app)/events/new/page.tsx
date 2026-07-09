"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/patterns/page-header";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";

const EVENT_TYPES = ["SERVICE", "MEETING", "SOCIAL", "OUTREACH", "OTHER"] as const;

type Facility = { id: string; name: string };

export default function NewEventPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<string>("OTHER");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ ok: true; facilities: Facility[] }>("/api/facilities")
      .then((res) => setFacilities(res.facilities))
      .catch(() => {
        /* optional */
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<{ ok: true; event: { id: string } }>(
        "/api/events",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            description: description || null,
            eventType,
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(endAt).toISOString(),
            maxCapacity: maxCapacity ? Number(maxCapacity) : null,
            recurrenceRule: recurrenceRule.trim() || null,
            facilityId: facilityId || null,
            isPublic,
          }),
        },
      );
      toast.success("Event created");
      router.push(`/events/${res.event.id}`);
    } catch (err) {
      const message = isApiClientError(err)
        ? err.message
        : err instanceof Error
          ? err.message
          : "Create failed";
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Add event"
        description="Schedule an event with optional capacity and recurrence."
      />
      <div className="flex-1 p-4 sm:p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Event details</CardTitle>
          </CardHeader>
          <form onSubmit={onSubmit}>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventType">Type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger id="eventType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxCapacity">Max capacity</Label>
                <Input
                  id="maxCapacity"
                  type="number"
                  min={1}
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startAt">Starts</Label>
                <Input
                  id="startAt"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endAt">Ends</Label>
                <Input
                  id="endAt"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="facilityId">Facility (optional)</Label>
                <Select
                  value={facilityId || "none"}
                  onValueChange={(v) => setFacilityId(v === "none" ? "" : v)}
                >
                  <SelectTrigger id="facilityId">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {facilities.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="recurrenceRule">Recurrence rule (optional)</Label>
                <Input
                  id="recurrenceRule"
                  value={recurrenceRule}
                  onChange={(e) => setRecurrenceRule(e.target.value)}
                  placeholder="e.g. FREQ=WEEKLY;BYDAY=SU"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  id="isPublic"
                  checked={isPublic}
                  onCheckedChange={(v) => setIsPublic(v === true)}
                />
                <Label htmlFor="isPublic">Public event</Label>
              </div>
              {error ? (
                <p className="text-sm text-destructive sm:col-span-2" role="alert">
                  {error}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="gap-2">
              <Button
                type="submit"
                disabled={submitting || !name.trim() || !startAt || !endAt}
              >
                {submitting ? "Creating…" : "Create event"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
