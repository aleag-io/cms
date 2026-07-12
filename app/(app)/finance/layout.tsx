"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageSkeleton } from "@/components/patterns/states";
import { useSession } from "@/hooks/use-session";

const FINANCE_ROLES = new Set([
  "global_admin",
  "diocese_admin",
  "diocese_staff",
  "parish_admin",
  "parish_staff",
  "organization_leader",
]);

/**
 * Finance route projection; APIs and forced RLS remain authoritative.
 * Diocese-scoped users manage the diocese's OWN standalone ledger here (via the
 * ledger-owner switcher defaulting to the diocese ledger) — this is not a
 * roll-up of member parishes. Cross-parish aggregate reporting lives separately
 * on /diocese/finance for reporting roles.
 */
export default function FinanceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { claims, isLoading } = useSession();
  const roles = claims?.app_metadata.roles.map((role) => role.toLowerCase()) ?? [];
  const allowed = Boolean(roles.some((role) => FINANCE_ROLES.has(role)));

  useEffect(() => {
    if (!isLoading && claims && !allowed) {
      router.replace("/app");
    }
  }, [allowed, claims, isLoading, router]);

  if (isLoading) return <PageSkeleton rows={7} />;
  if (!allowed) return null;
  return children;
}
