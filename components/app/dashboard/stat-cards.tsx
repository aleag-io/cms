import Link from "next/link";
import {
  UsersThreeIcon,
  HouseIcon,
  UserPlusIcon,
  WarningCircleIcon,
  BuildingsIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardDto } from "@/lib/dashboard/types";

export function StatCards({ dashboard }: { dashboard: DashboardDto }) {
  const { stats, mode } = dashboard;

  const tiles = [
    mode === "diocese" && stats.parishCount != null
      ? {
          title: "Parishes",
          value: stats.parishCount,
          hint: "Active parishes",
          icon: <BuildingsIcon className="size-5" />,
          href: "/parishes",
        }
      : null,
    {
      title: "Active members",
      value: stats.membersActive,
      hint: `${stats.membersTotal} total records`,
      icon: <UsersThreeIcon className="size-5" />,
      href: mode === "diocese" ? "/diocese/aggregate" : "/members",
    },
    {
      title: "Active families",
      value: stats.familiesActive,
      hint: `${stats.familiesTotal} total households`,
      icon: <HouseIcon className="size-5" />,
      href: mode === "diocese" ? "/diocese/aggregate" : "/families",
    },
    {
      title: "New (30 days)",
      value: stats.newMembersLast30Days,
      hint: "Recently added members",
      icon: <UserPlusIcon className="size-5" />,
      href: mode === "member" ? undefined : "/members",
    },
    {
      title: "Needs attention",
      value: stats.pendingWorkItemCount,
      hint:
        stats.pendingRegistrations > 0
          ? `${stats.pendingRegistrations} pending registration(s)`
          : "Actionable work items",
      icon: <WarningCircleIcon className="size-5" />,
      href: stats.pendingRegistrations > 0 ? "/registrations" : undefined,
      emphasize: stats.pendingWorkItemCount > 0,
    },
  ].filter(Boolean) as Array<{
    title: string;
    value: number;
    hint: string;
    icon: React.ReactNode;
    href?: string;
    emphasize?: boolean;
  }>;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const body = (
          <Card
            className={
              tile.emphasize
                ? "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20"
                : undefined
            }
          >
            <CardHeader className="gap-2">
              <div className="flex items-center justify-between">
                <CardDescription>{tile.title}</CardDescription>
                <span className="text-muted-foreground">{tile.icon}</span>
              </div>
              <CardTitle className="text-3xl tabular-nums">{tile.value}</CardTitle>
              <p className="text-xs text-muted-foreground">{tile.hint}</p>
            </CardHeader>
          </Card>
        );
        if (!tile.href) return <div key={tile.title}>{body}</div>;
        return (
          <Link
            key={tile.title}
            href={tile.href}
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}
