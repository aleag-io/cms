import { PageHeader } from "@/components/patterns/page-header";
import { StatCards } from "@/components/app/dashboard/stat-cards";
import { DemographicsPanel } from "@/components/app/dashboard/demographics-panel";
import { PastoralDatesPanel } from "@/components/app/dashboard/pastoral-dates-panel";
import { NewMembersPanel } from "@/components/app/dashboard/new-members-panel";
import { WorkItemsPanel } from "@/components/app/dashboard/work-items-panel";
import { MemberLinksPanel } from "@/components/app/dashboard/member-links-panel";
import { QuickLinks } from "@/components/app/dashboard/quick-links";
import type { DashboardDto } from "@/lib/dashboard/types";
import type { PortalMode } from "@/lib/context/working-parish";

export function DashboardView({
  dashboard,
  title,
  description,
  portal,
  navItems,
}: {
  dashboard: DashboardDto;
  title: string;
  description: string;
  portal: PortalMode;
  navItems: { href: string }[];
}) {
  const scopeLabel =
    dashboard.scope.parishName ??
    (dashboard.mode === "diocese" ? "Diocese-wide" : null);

  return (
    <>
      <PageHeader
        title={title}
        description={
          scopeLabel ? `${description} · ${scopeLabel}` : description
        }
      />
      <div className="space-y-6 p-4 sm:p-6">
        {dashboard.mode === "member" ? (
          <MemberLinksPanel dashboard={dashboard} />
        ) : (
          <>
            <StatCards dashboard={dashboard} />
            {/* Full-width demographics chart (age × gender stacked bars) */}
            <DemographicsPanel dashboard={dashboard} />
            <div className="grid gap-4 lg:grid-cols-2">
              <WorkItemsPanel dashboard={dashboard} />
              <NewMembersPanel dashboard={dashboard} />
            </div>
            <PastoralDatesPanel dashboard={dashboard} />
            {dashboard.upcomingEvents && dashboard.upcomingEvents.length > 0 ? (
              <UpcomingEventsList events={dashboard.upcomingEvents} />
            ) : null}
          </>
        )}
        <QuickLinks portal={portal} navItems={navItems} />
      </div>
    </>
  );
}

function UpcomingEventsList({
  events,
}: {
  events: NonNullable<DashboardDto["upcomingEvents"]>;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-base font-semibold">Upcoming events</h3>
      <ul className="divide-y text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex justify-between gap-2 py-2">
            <a href={`/events/${e.id}`} className="font-medium text-primary hover:underline">
              {e.name}
            </a>
            <span className="shrink-0 text-muted-foreground">
              {new Date(e.startAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
