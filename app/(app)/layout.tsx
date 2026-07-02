import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { getSessionUser, claimsFromUser } from "@/lib/auth";
import { navSectionsFromClaims } from "@/lib/nav/menu";

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

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        parishId: user.parishId,
      }}
      sections={sections}
    >
      {children}
    </AppShell>
  );
}
