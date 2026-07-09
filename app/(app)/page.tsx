import Link from "next/link";
import {
  BuildingsIcon,
  CalendarBlankIcon,
  ShareNetworkIcon,
  IdentificationCardIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/patterns/page-header";
import { getSessionUser, claimsFromUser } from "@/lib/auth";
import { portalFromClaims, visibleNavItems } from "@/lib/nav/menu";

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

  const cards = [
    {
      title: "People",
      description: "Directory, members, and family records.",
      icon: <UsersThreeIcon className="size-5" />,
      href: navItems.find((item) => item.href === "/directory")?.href,
      show: portal === "parish",
    },
    {
      title: "Administration",
      description: "Permissions and audit surfaces for authorized roles.",
      icon: <IdentificationCardIcon className="size-5" />,
      href:
        navItems.find((item) => item.href.startsWith("/settings"))?.href ??
        navItems.find((item) => item.href === "/audit")?.href,
      show: true,
    },
    {
      title: "Diocese",
      description: "Parish portfolio and aggregate count views.",
      icon: <BuildingsIcon className="size-5" />,
      href:
        navItems.find((item) => item.href === "/diocese/aggregate")?.href ??
        navItems.find((item) => item.href === "/parishes")?.href,
      // Never show diocese chrome on the parish portal (shell plan §7).
      show: portal === "diocese",
    },
    {
      title: "Parish operations",
      description: "Programs, organizations, events, facilities, and messages.",
      icon: <CalendarBlankIcon className="size-5" />,
      href:
        navItems.find((item) => item.href === "/programs")?.href ??
        navItems.find((item) => item.href === "/events")?.href ??
        navItems.find((item) => item.href === "/organizations")?.href,
      show: portal === "parish",
    },
    {
      title: "Sharing",
      description: "Governed data sharing and request workflows.",
      icon: <ShareNetworkIcon className="size-5" />,
      href: navItems.find((item) => item.href === "/sharing")?.href,
      show: true,
    },
  ].filter((card) => card.show);

  return (
    <>
      <PageHeader
        title={landing}
        description={
          portal === "diocese"
            ? "Diocese portal — structural and aggregate views only."
            : "Parish portal — people, operations, and administration."
        }
      />
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        {cards.map((card) => (
          <DashboardCard
            key={card.title}
            title={card.title}
            description={card.description}
            icon={card.icon}
            href={card.href}
          />
        ))}
      </div>
    </>
  );
}

function DashboardCard({
  title,
  description,
  icon,
  href,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
}) {
  // Hide cards with no destination instead of "Not available" diocese stubs.
  if (!href) return null;

  const content = (
    <Card className="h-full gap-3 transition hover:border-primary/40 hover:shadow-md">
      <CardHeader>
        <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          {icon}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <p className="mt-auto px-4 text-xs font-medium text-primary">Open →</p>
    </Card>
  );

  return (
    <Link
      href={href}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </Link>
  );
}
