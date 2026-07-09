import { Badge } from "@/components/ui/badge";
import { isExpired } from "@/lib/sharing/constants";

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
}: {
  isActive: boolean;
  expiresAt?: string | null;
}) {
  if (!isActive) return <Badge variant="destructive">Revoked</Badge>;
  if (isExpired(expiresAt)) return <Badge variant="destructive">Expired</Badge>;
  return <Badge variant="default">Active</Badge>;
}
