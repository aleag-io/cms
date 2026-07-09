import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { getSessionUser, claimsFromUser } from "@/lib/auth";
import { navSectionsFromClaims, portalFromClaims } from "@/lib/nav/menu";
import {
  isDioceseScopedRole,
  resolveWorkingParish,
} from "@/lib/context/working-parish";
import { prisma } from "@/lib/prisma";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const claims = await claimsFromUser(user);
  const sections = navSectionsFromClaims(claims);
  const portal = portalFromClaims(claims);

  const working = isDioceseScopedRole(user.role)
    ? await resolveWorkingParish(user)
    : null;

  let parishName: string | null = working?.name ?? null;
  if (!parishName && user.parishId && !isDioceseScopedRole(user.role)) {
    const home = await prisma.parish.findFirst({
      where: { id: user.parishId },
      select: { name: true },
    });
    parishName = home?.name ?? null;
  }

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        parishId: claims.app_metadata.parish_id,
      }}
      sections={sections}
      context={{
        portal,
        canSwitchParish: isDioceseScopedRole(user.role),
        parishName,
        workingParishId: working?.id ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
