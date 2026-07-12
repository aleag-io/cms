"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

/** Finance route projection; APIs and forced RLS remain authoritative. */
export default function FinanceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { claims, isLoading } = useSession();
  const roles = claims?.app_metadata.roles.map((role) => role.toLowerCase()) ?? [];
  const allowed = Boolean(
    roles.some((role) => FINANCE_ROLES.has(role)),
  );
  const isDiocesePortal = Boolean(
    claims &&
      !claims.app_metadata.parish_id &&
      roles.some((role) =>
        ["global_admin", "diocese_admin", "diocese_staff"].includes(role),
      ),
  );
  const hasGrantedParishOwner = searchParams.get("owner")?.startsWith("parish:") ?? false;

  useEffect(() => {
    if (!isLoading && claims && !allowed) {
      router.replace("/app");
    } else if (!isLoading && allowed && isDiocesePortal && !hasGrantedParishOwner) {
      router.replace("/diocese/finance");
    }
  }, [
    allowed,
    claims,
    hasGrantedParishOwner,
    isDiocesePortal,
    isLoading,
    router,
  ]);

  if (isLoading) return <PageSkeleton rows={7} />;
  if (!allowed || (isDiocesePortal && !hasGrantedParishOwner)) return null;
  return children;
}
