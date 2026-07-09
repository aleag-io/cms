"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RequestStatusBadge } from "@/components/sharing/status-badge";
import type { ParishOption, SharingRequest } from "@/components/sharing/types";

export function RequestsPanel({
  requests,
  parishes,
  canCreate,
  canReview,
  parishNameById,
  onChanged,
}: {
  requests: SharingRequest[];
  parishes: ParishOption[];
  canCreate: boolean;
  canReview: boolean;
  parishNameById: Map<string, string>;
  onChanged: () => Promise<void>;
}) {
  const [parishId, setParishId] = useState("");
  const [dataCategory, setDataCategory] = useState<string>(DATA_CATEGORIES[0]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("ALL");

  const filtered =
    filter === "ALL"
      ? requests
      : requests.filter((r) => r.status === filter);

  async function createRequest() {
    if (!parishId || !reason.trim()) {
      toast.error("Parish and reason are required");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/sharing/requests", {
        method: "POST",
        body: JSON.stringify({ parishId, dataCategory, reason: reason.trim() }),
      });
      toast.success("Sharing request submitted");
      setReason("");
      await onChanged();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to create request",
      );
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, decision: "APPROVE" | "REJECT") {
    setBusy(true);
    try {
      await apiRequest(`/api/sharing/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      toast.success(decision === "APPROVE" ? "Request approved" : "Request rejected");
      await onChanged();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to review request",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Request parish data</CardTitle>
            <CardDescription>
              Diocese staff request access to a data category. The parish reviews and
              may issue a grant on approval. Requests expire after 14 days if unanswered.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="req-parish">Parish</Label>
              <Select value={parishId} onValueChange={setParishId}>
                <SelectTrigger id="req-parish">
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
              <Label htmlFor="req-category">Data category</Label>
              <Select value={dataCategory} onValueChange={setDataCategory}>
                <SelectTrigger id="req-category">
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
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="req-reason">Reason</Label>
              <Textarea
                id="req-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this data needed?"
                rows={3}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="button" disabled={busy} onClick={() => void createRequest()}>
                Submit request
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Request history</CardTitle>
            <CardDescription>
              {canReview
                ? "Approve or reject pending requests for your parish."
                : "Track status of diocese-to-parish data requests."}
            </CardDescription>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              title="No sharing requests"
              description="Requests will appear here once the diocese opens a data category request."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parish</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  {canReview ? <TableHead className="w-[1%]">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {parishNameById.get(row.parishId) ?? row.parishId.slice(0, 8)}
                    </TableCell>
                    <TableCell>{labelDataCategory(row.dataCategory)}</TableCell>
                    <TableCell>
                      <RequestStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate" title={row.reason}>
                      {row.reason}
                    </TableCell>
                    <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(row.expiresAt)}</TableCell>
                    {canReview ? (
                      <TableCell>
                        {row.status === "PENDING" ? (
                          <div className="flex gap-2">
                            <ConfirmDialog
                              trigger={
                                <Button type="button" size="sm" disabled={busy}>
                                  Approve
                                </Button>
                              }
                              title="Approve sharing request?"
                              description={`This creates an active grant for ${labelDataCategory(row.dataCategory)} to the diocese.`}
                              confirmLabel="Approve"
                              onConfirm={() => {
                                void review(row.id, "APPROVE");
                              }}
                            />
                            <ConfirmDialog
                              trigger={
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                >
                                  Reject
                                </Button>
                              }
                              title="Reject sharing request?"
                              description="The diocese will not receive a grant for this category."
                              confirmLabel="Reject"
                              destructive
                              onConfirm={() => {
                                void review(row.id, "REJECT");
                              }}
                            />
                          </div>
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
