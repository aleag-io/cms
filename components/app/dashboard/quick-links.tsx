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
import type { PortalMode } from "@/lib/context/working-parish";

type NavItem = { href: string; title?: string };

export function QuickLinks({
  portal,
  navItems,
}: {
  portal: PortalMode;
  navItems: NavItem[];
}) {
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
  ].filter((card) => card.show && card.href);

  if (cards.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Quick links</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href!}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full gap-3 transition hover:border-primary/40 hover:shadow-md">
              <CardHeader>
                <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  {card.icon}
                </div>
                <CardTitle className="text-base">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <p className="mt-auto px-4 pb-4 text-xs font-medium text-primary">
                Open →
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
