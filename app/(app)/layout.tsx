import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { getSessionUser, claimsFromUser } from "@/lib/auth";
import { navSectionsFromClaims, portalFromClaims } from "@/lib/nav/menu";
import {
  isDioceseScopedRole,
  memberWorkingParishChoices,
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

  const dioceseScoped = isDioceseScopedRole(user.role);
  const working = await resolveWorkingParish(user);

  let parishName: string | null = working?.name ?? null;
  if (!parishName && user.parishId && !dioceseScoped) {
    const home = await prisma.parish.findFirst({
      where: { id: user.parishId },
      select: { name: true },
    });
    parishName = home?.name ?? null;
  }

  // Multi-parish members (MM-17) can switch working parish among their own
  // memberships; diocese-scoped roles load the parish list client-side.
  let switchableParishes: { id: string; name: string; isPrimary: boolean }[] = [];
  if (!dioceseScoped) {
    const member = await prisma.member.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (member) {
      switchableParishes = await memberWorkingParishChoices(member.id);
    }
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
        canSwitchParish: dioceseScoped || switchableParishes.length > 1,
        parishName,
        workingParishId: working?.id ?? null,
        homeParishId: dioceseScoped ? null : user.parishId,
        switchableParishes,
      }}
    >
      {children}
    </AppShell>
  );
}
