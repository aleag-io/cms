import { Badge } from "@/components/ui/badge";
import {
  isExpired,
  shareLifecycleStatus,
} from "@/lib/sharing/constants";

export function RequestStatusBadge({ status }: { status: string }) {
  const variant =
    status === "APPROVED"
      ? "default"
      : status === "PENDING"
        ? "secondary"
        : status === "REJECTED" || status === "EXPIRED"
          ? "destructive"
          : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function ActiveBadge({
  isActive,
  expiresAt,
  maxViews,
  viewCount,
}: {
  isActive: boolean;
  expiresAt?: string | null;
  maxViews?: number | null;
  viewCount?: number;
}) {
  if (maxViews != null || viewCount != null) {
    const status = shareLifecycleStatus({
      isActive,
      expiresAt,
      maxViews,
      viewCount,
    });
    if (status === "revoked")
      return <Badge variant="destructive">Revoked</Badge>;
    if (status === "expired")
      return <Badge variant="destructive">Expired</Badge>;
    if (status === "exhausted")
      return <Badge variant="secondary">Exhausted</Badge>;
    return <Badge variant="default">Active</Badge>;
  }

  if (!isActive) return <Badge variant="destructive">Revoked</Badge>;
  if (isExpired(expiresAt)) return <Badge variant="destructive">Expired</Badge>;
  return <Badge variant="default">Active</Badge>;
}
