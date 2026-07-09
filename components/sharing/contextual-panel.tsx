"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  SHARE_RESOURCE_TYPES,
  formatDateTime,
  shareLifecycleStatus,
} from "@/lib/sharing/constants";
import { ActiveBadge } from "@/components/sharing/status-badge";
import type { ContextualShare } from "@/components/sharing/types";

const ROLE_OPTIONS = [
  "PARISH_ADMIN",
  "PARISH_STAFF",
  "CLERGY",
  "MEMBER",
  "MINISTRY_LEADER",
  "ORGANIZATION_LEADER",
] as const;

export function ContextualPanel({
  shares,
  canCreate,
  onChanged,
}: {
  shares: ContextualShare[];
  canCreate: boolean;
  onChanged: () => Promise<void>;
}) {
  const [resourceType, setResourceType] = useState("member_list");
  const [resourceId, setResourceId] = useState("");
  const [shareMode, setShareMode] = useState("SECURE_LINK");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [recipientRole, setRecipientRole] = useState<string>("PARISH_STAFF");
  const [isAnonymized, setIsAnonymized] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [maxViews, setMaxViews] = useState("5");
  const [busy, setBusy] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);

  async function createShare() {
    setBusy(true);
    setLastToken(null);
    try {
      const body: Record<string, unknown> = {
        resourceType,
        resourceId:
          resourceType === "member" && resourceId.trim()
            ? resourceId.trim()
            : null,
        shareMode,
        isAnonymized,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      if (shareMode === "USER_SHARE") body.recipientUserId = recipientUserId.trim();
      if (shareMode === "ROLE_SHARE") body.recipientRole = recipientRole;
      if (shareMode === "SECURE_LINK" && maxViews) {
        body.maxViews = Number(maxViews) || null;
      }

      const res = await apiRequest<{
        ok: true;
        share: ContextualShare;
        secureLinkToken: string | null;
      }>("/api/shares", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (res.secureLinkToken) {
        setLastToken(res.secureLinkToken);
        toast.success("Secure link created — copy the token now; it is shown once");
      } else {
        toast.success("Share created");
      }
      await onChanged();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to create share",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await apiRequest(`/api/shares/${id}`, { method: "DELETE" });
      toast.success("Share revoked");
      await onChanged();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to revoke share",
      );
    } finally {
      setBusy(false);
    }
  }

  function copyToken() {
    if (!lastToken) return;
    void navigator.clipboard.writeText(
      `${window.location.origin}/share/${lastToken}`,
    );
    toast.success("Secure link URL copied");
  }

  return (
    <div className="space-y-6">
      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create contextual share</CardTitle>
            <CardDescription>
              Share a resource with a user, a role, or via a secure link. Prefer
              anonymized projection for external or wide distribution. Secure-link
              tokens are shown once and never stored in plaintext.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="share-resource">Resource</Label>
              <Select value={resourceType} onValueChange={setResourceType}>
                <SelectTrigger id="share-resource">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHARE_RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {resourceType === "member" ? (
              <div className="space-y-2">
                <Label htmlFor="share-member-id">Member id</Label>
                <Input
                  id="share-member-id"
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  placeholder="UUID of the member"
                />
              </div>
            ) : (
              <div />
            )}
            <div className="space-y-2">
              <Label htmlFor="share-mode">Share mode</Label>
              <Select value={shareMode} onValueChange={setShareMode}>
                <SelectTrigger id="share-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SECURE_LINK">Secure link</SelectItem>
                  <SelectItem value="USER_SHARE">User</SelectItem>
                  <SelectItem value="ROLE_SHARE">Role</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {shareMode === "USER_SHARE" ? (
              <div className="space-y-2">
                <Label htmlFor="share-user">Recipient user id</Label>
                <Input
                  id="share-user"
                  value={recipientUserId}
                  onChange={(e) => setRecipientUserId(e.target.value)}
                  placeholder="AppUser UUID"
                />
              </div>
            ) : null}
            {shareMode === "ROLE_SHARE" ? (
              <div className="space-y-2">
                <Label htmlFor="share-role">Recipient role</Label>
                <Select value={recipientRole} onValueChange={setRecipientRole}>
                  <SelectTrigger id="share-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {shareMode === "SECURE_LINK" ? (
              <div className="space-y-2">
                <Label htmlFor="share-max-views">Max views</Label>
                <Input
                  id="share-max-views"
                  type="number"
                  min={1}
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="share-expires">Expires (optional)</Label>
              <Input
                id="share-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <Switch
                id="share-anon"
                checked={isAnonymized}
                onCheckedChange={setIsAnonymized}
              />
              <Label htmlFor="share-anon">
                Anonymize projection (strip direct identifiers)
              </Label>
            </div>
            <div className="md:col-span-2">
              <Button type="button" disabled={busy} onClick={() => void createShare()}>
                Create share
              </Button>
            </div>
            {lastToken ? (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 md:col-span-2 dark:border-amber-900 dark:bg-amber-950/40">
                <p className="text-sm font-medium">
                  One-time secure link (copy now — it will not be shown again)
                </p>
                <code className="block break-all text-xs">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/share/${lastToken}`
                    : `/share/${lastToken}`}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={copyToken}>
                  Copy URL
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your shares</CardTitle>
          <CardDescription>
            Manage and revoke contextual shares. Token hashes are never shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shares.length === 0 ? (
            <EmptyState
              title="No contextual shares"
              description="Create a share above to distribute a directory slice or member profile."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mode</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Anon</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[1%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shares.map((s) => {
                  const lifecycle = shareLifecycleStatus(s);
                  const isLive = lifecycle === "active";
                  return (
                  <TableRow key={s.id}>
                    <TableCell>{s.shareMode}</TableCell>
                    <TableCell>
                      {s.resourceType}
                      {s.resourceId ? ` · ${s.resourceId.slice(0, 8)}…` : ""}
                    </TableCell>
                    <TableCell>
                      <ActiveBadge
                        isActive={s.isActive}
                        expiresAt={s.expiresAt}
                        maxViews={s.maxViews}
                        viewCount={s.viewCount}
                      />
                    </TableCell>
                    <TableCell>
                      {s.viewCount}
                      {s.maxViews != null ? ` / ${s.maxViews}` : ""}
                    </TableCell>
                    <TableCell>{s.isAnonymized ? "Yes" : "No"}</TableCell>
                    <TableCell>{formatDateTime(s.expiresAt)}</TableCell>
                    <TableCell>{formatDateTime(s.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {(s.shareMode === "USER_SHARE" ||
                          s.shareMode === "ROLE_SHARE") &&
                        isLive ? (
                          <Button type="button" size="sm" variant="outline" asChild>
                            <Link href={`/shares/${s.id}`}>Open</Link>
                          </Button>
                        ) : null}
                        {s.isActive ? (
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
                            title="Revoke share?"
                            description="Recipients and secure links stop working immediately."
                            confirmLabel="Revoke"
                            destructive
                            onConfirm={() => {
                              void revoke(s.id);
                            }}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
