import { getSessionUser, claimsFromUser } from "@/lib/auth";
import { portalFromClaims, visibleNavItems } from "@/lib/nav/menu";
import { loadDashboard } from "@/lib/dashboard/load-dashboard";
import { DashboardView } from "@/components/app/dashboard/dashboard-view";

const roleLanding: Record<string, string> = {
  GLOBAL_ADMIN: "Diocese administration",
  DIOCESE_ADMIN: "Diocese administration",
  DIOCESE_STAFF: "Diocese operations",
  DIOCESE_REPORT_VIEWER: "Diocese reporting",
  PARISH_ADMIN: "Parish administration",
  PARISH_STAFF: "Parish operations",
  PARISH_DATA_SHARING_MANAGER: "Data sharing",
  CLERGY: "Pastoral care",
  MINISTRY_LEADER: "Ministry leadership",
  ORGANIZATION_LEADER: "Organization leadership",
  PASTORAL_DATA_ACCESSOR: "Pastoral records",
  MEMBER: "Member portal",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const claims = await claimsFromUser(user);
  const portal = portalFromClaims(claims);
  const navItems = visibleNavItems(claims.app_metadata.roles, { portal }).filter(
    (item) => item.href !== "/",
  );

  const landing =
    portal === "parish" &&
    ["GLOBAL_ADMIN", "DIOCESE_ADMIN", "DIOCESE_STAFF", "DIOCESE_REPORT_VIEWER"].includes(
      user.role,
    )
      ? "Parish workspace"
      : (roleLanding[user.role] ?? "Dashboard");

  const description =
    portal === "diocese"
      ? "Diocese portal — structural and aggregate views."
      : "Parish portal — people, operations, and administration.";

  const dashboard = await loadDashboard(user, claims);

  return (
    <DashboardView
      dashboard={dashboard}
      title={landing}
      description={description}
      portal={portal}
      navItems={navItems}
    />
  );
}
