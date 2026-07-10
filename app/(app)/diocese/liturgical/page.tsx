"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import type { ObservanceType } from "@prisma/client";

type Observance = {
  id: string;
  title: string;
  observanceType: ObservanceType;
  month: number | null;
  day: number | null;
  occursOn: string | null;
  lectionaryRef: string | null;
  isPublished: boolean;
  parishId: string | null;
};

const TYPES: ObservanceType[] = [
  "FEAST",
  "HOLY_DAY",
  "SEASON_START",
  "SEASON_END",
  "DIOCESAN_EVENT",
  "OTHER",
];

export default function DioceseLiturgicalPage() {
  const [rows, setRows] = useState<Observance[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [observanceType, setObservanceType] = useState<ObservanceType>("FEAST");
  const [month, setMonth] = useState("1");
  const [day, setDay] = useState("1");
  const [lectionaryRef, setLectionaryRef] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<{ ok: true; observances: Observance[] }>(
        "/api/liturgical?scope=diocese&includeUnpublished=1",
      );
      setRows(res.observances);
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load calendar",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function create() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/api/liturgical", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          observanceType,
          month: Number(month) || null,
          day: Number(day) || null,
          lectionaryRef: lectionaryRef || null,
          isPublished: true,
        }),
      });
      toast.success("Observance published");
      setTitle("");
      setLectionaryRef("");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to create",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiRequest(`/api/liturgical/${id}`, { method: "DELETE" });
      toast.success("Removed");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to delete",
      );
    }
  }

  async function togglePublish(row: Observance) {
    try {
      await apiRequest(`/api/liturgical/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublished: !row.isPublished }),
      });
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to update",
      );
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Liturgical calendar"
        description="Publish diocese feast days and holy days. Parishes see published entries on Events."
      />
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Denaha (Epiphany)"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="observanceType">Type</Label>
            <Select
              value={observanceType}
              onValueChange={(v) => setObservanceType(v as ObservanceType)}
            >
              <SelectTrigger id="observanceType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="day">Day</Label>
              <Input
                id="day"
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="lectionary">Lectionary ref</Label>
            <Input
              id="lectionary"
              value={lectionaryRef}
              onChange={(e) => setLectionaryRef(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={saving}
              onClick={() => void create()}
            >
              {saving ? "Saving…" : "Publish observance"}
            </Button>
          </div>
        </div>

        {busy ? (
          <PageSkeleton />
        ) : error ? (
          <ErrorState title="Load failed" description={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No observances yet"
            description="Add the first feast or holy day for the diocese."
          />
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="liturgical-list">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.title}</span>
                    <Badge variant="outline">
                      {r.observanceType.replace(/_/g, " ")}
                    </Badge>
                    {r.isPublished ? (
                      <Badge>Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {r.month && r.day
                      ? `Annual · ${r.month}/${r.day}`
                      : r.occursOn
                        ? r.occursOn.slice(0, 10)
                        : "No date"}
                    {r.lectionaryRef ? ` · ${r.lectionaryRef}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void togglePublish(r)}
                  >
                    {r.isPublished ? "Unpublish" : "Publish"}
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        Delete
                      </Button>
                    }
                    title="Delete observance?"
                    description="Parishes will no longer see this entry."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => {
                      void remove(r.id);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
