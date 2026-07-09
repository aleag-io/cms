"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { EmptyState } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/sharing/constants";
import { ActiveBadge } from "@/components/sharing/status-badge";
import type { EmergencyGrant, ParishOption } from "@/components/sharing/types";

export function EmergencyPanel({
  grants,
  parishes,
  canInvoke,
  canRevoke,
  parishNameById,
  onChanged,
}: {
  grants: EmergencyGrant[];
  parishes: ParishOption[];
  canInvoke: boolean;
  canRevoke: boolean;
  parishNameById: Map<string, string>;
  onChanged: () => Promise<void>;
}) {
  const [parishId, setParishId] = useState("");
  const [justification, setJustification] = useState("");
  const [durationDays, setDurationDays] = useState("3");
  const [busy, setBusy] = useState(false);

  async function invoke() {
    if (!parishId || !justification.trim()) {
      toast.error("Parish and justification are required");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/sharing/emergency", {
        method: "POST",
        body: JSON.stringify({
          parishId,
          justification: justification.trim(),
          durationDays: Number(durationDays) || 3,
        }),
      });
      toast.success("Emergency access granted (view-only, time-boxed)");
      setJustification("");
      await onChanged();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to invoke emergency access",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await apiRequest(`/api/sharing/emergency/${id}`, { method: "DELETE" });
      toast.success("Emergency access revoked");
      await onChanged();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to revoke emergency access",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canInvoke ? (
        <Card>
          <CardHeader>
            <CardTitle>Invoke emergency access</CardTitle>
            <CardDescription>
              Time-boxed (max 7 days), view-only access for crisis situations. Fully audited.
              Prefer normal requests/grants whenever possible.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="em-parish">Parish</Label>
              <Select value={parishId} onValueChange={setParishId}>
                <SelectTrigger id="em-parish">
                  <SelectValue placeholder="Select parish" />
                </SelectTrigger>
                <SelectContent>
                  {parishes
                    .filter((p) => p.isActive !== false)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="em-days">Duration (days, max 7)</Label>
              <Input
                id="em-days"
                type="number"
                min={1}
                max={7}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="em-justification">Justification</Label>
              <Textarea
                id="em-justification"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                placeholder="Document the emergency reason"
              />
            </div>
            <div>
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="destructive" disabled={busy}>
                    Invoke emergency access
                  </Button>
                }
                title="Invoke emergency access?"
                description="This grants temporary view-only access and is permanently audited."
                confirmLabel="Invoke"
                destructive
                onConfirm={() => {
                  void invoke();
                }}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Emergency access log</CardTitle>
          <CardDescription>
            Active and historical emergency grants for your scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <EmptyState
              title="No emergency grants"
              description="Emergency access grants will list here when invoked."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parish</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Justification</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead>Expires</TableHead>
                  {canRevoke ? <TableHead className="w-[1%]">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      {parishNameById.get(g.parishId) ?? g.parishId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <ActiveBadge isActive={g.isActive} expiresAt={g.expiresAt} />
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate" title={g.justification}>
                      {g.justification}
                    </TableCell>
                    <TableCell>{formatDateTime(g.grantedAt)}</TableCell>
                    <TableCell>{formatDateTime(g.expiresAt)}</TableCell>
                    {canRevoke ? (
                      <TableCell>
                        {g.isActive ? (
                          <ConfirmDialog
                            trigger={
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                              >
                                Revoke
                              </Button>
                            }
                            title="Revoke emergency access?"
                            description="Ends the emergency window immediately."
                            confirmLabel="Revoke"
                            destructive
                            onConfirm={() => {
                              void revoke(g.id);
                            }}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
