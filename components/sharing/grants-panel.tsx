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
import {
  DATA_CATEGORIES,
  formatDateTime,
  labelDataCategory,
} from "@/lib/sharing/constants";
import { ActiveBadge } from "@/components/sharing/status-badge";
import type { SharingGrant } from "@/components/sharing/types";

export function GrantsPanel({
  grants,
  canManage,
  dioceseId,
  parishNameById,
  onChanged,
}: {
  grants: SharingGrant[];
  canManage: boolean;
  dioceseId: string | null;
  parishNameById: Map<string, string>;
  onChanged: () => Promise<void>;
}) {
  const [dataCategory, setDataCategory] = useState<string>(DATA_CATEGORIES[0]);
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function createGrant() {
    if (!dioceseId) {
      toast.error("Diocese context required");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/sharing/grants", {
        method: "POST",
        body: JSON.stringify({
          dataCategory,
          granteeType: "DIOCESE",
          granteeId: dioceseId,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          notes: notes.trim() || null,
        }),
      });
      toast.success("Grant created");
      setNotes("");
      setExpiresAt("");
      await onChanged();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to create grant",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await apiRequest(`/api/sharing/grants/${id}`, { method: "DELETE" });
      toast.success("Grant revoked");
      await onChanged();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to revoke grant",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Issue grant</CardTitle>
            <CardDescription>
              Directly grant the diocese access to a data category (without a prior request).
              Revocation is immediate and audited.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="grant-category">Data category</Label>
              <Select value={dataCategory} onValueChange={setDataCategory}>
                <SelectTrigger id="grant-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {labelDataCategory(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-expires">Expires (optional)</Label>
              <Input
                id="grant-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="grant-notes">Notes</Label>
              <Textarea
                id="grant-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Button type="button" disabled={busy} onClick={() => void createGrant()}>
                Create grant
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Active & historical grants</CardTitle>
          <CardDescription>
            Grants control which data categories the diocese can read under RLS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <EmptyState
              title="No grants"
              description="Grants appear after a request is approved or a parish issues one directly."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parish</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Notes</TableHead>
                  {canManage ? <TableHead className="w-[1%]">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      {parishNameById.get(g.parishId) ?? g.parishId.slice(0, 8)}
                    </TableCell>
                    <TableCell>{labelDataCategory(g.dataCategory)}</TableCell>
                    <TableCell>
                      <ActiveBadge isActive={g.isActive} expiresAt={g.expiresAt} />
                    </TableCell>
                    <TableCell>{formatDateTime(g.grantedAt)}</TableCell>
                    <TableCell>{formatDateTime(g.expiresAt)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {g.notes ?? "—"}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        {g.isActive ? (
                          <ConfirmDialog
                            trigger={
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={busy}
                              >
                                Revoke
                              </Button>
                            }
                            title="Revoke grant?"
                            description="The diocese loses access to this category immediately on the next request."
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
