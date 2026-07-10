/**
 * Static product UI mockups for the marketing landing page.
 * Built in React (not screenshots) so copy stays accurate and on-brand.
 * All names are fictional demo data — no real parish or member PII.
 */

import {
  BuildingsIcon,
  CalendarBlankIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function MockSidebar({ active }: { active: string }) {
  const items = ["Dashboard", "Directory", "Members", "Events", "Sharing"];
  return (
    <aside className="hidden w-36 shrink-0 border-r border-border bg-sidebar p-2 sm:block">
      <div className="mb-3 flex items-center gap-1.5 px-1.5 py-1">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BuildingsIcon className="size-3.5" weight="fill" />
        </div>
        <span className="truncate text-[10px] font-semibold">Mar Thoma CMS</span>
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "rounded-md px-2 py-1 text-[10px]",
              item === active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground",
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function MockShell({
  active,
  children,
  title,
}: {
  active: string;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-h-[220px] text-left sm:min-h-[260px]">
      <MockSidebar active={active} />
      <div className="min-w-0 flex-1 p-3 sm:p-4">
        <p className="mb-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

/** Hero mock: role dashboard with KPIs. */
export function MockDashboard() {
  const stats = [
    { label: "Active members", value: "842" },
    { label: "Families", value: "291" },
    { label: "Upcoming events", value: "12" },
    { label: "Pending registrations", value: "7" },
  ];
  return (
    <MockShell active="Dashboard" title="Parish administration">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-border bg-card p-2.5 shadow-sm"
          >
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className="text-lg font-semibold tabular-nums tracking-tight">
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-2.5">
        <p className="mb-1.5 text-[10px] font-medium">Needs attention</p>
        <ul className="space-y-1 text-[11px] text-muted-foreground">
          <li className="flex justify-between gap-2">
            <span>Self-registrations awaiting review</span>
            <Badge variant="secondary">7</Badge>
          </li>
          <li className="flex justify-between gap-2">
            <span>Sharing requests open</span>
            <Badge variant="secondary">2</Badge>
          </li>
        </ul>
      </div>
    </MockShell>
  );
}

/** People directory mock. */
export function MockDirectory() {
  const rows = [
    { id: "THOMAS.01", name: "Anna Thomas", role: "Member" },
    { id: "THOMAS.02", name: "David Thomas", role: "Member" },
    { id: "MATHEW.01", name: "Sarah Mathew", role: "Staff" },
    { id: "GEORGE.01", name: "Rev. John George", role: "Clergy" },
  ];
  return (
    <MockShell active="Directory" title="Parish directory">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-7 flex-1 rounded-md border border-border bg-muted/40 px-2 text-[10px] leading-7 text-muted-foreground">
          Search members…
        </div>
        <UsersThreeIcon className="size-4 text-primary" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Member ID</th>
              <th className="px-2 py-1.5 font-medium">Name</th>
              <th className="hidden px-2 py-1.5 font-medium sm:table-cell">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  {r.id}
                </td>
                <td className="px-2 py-1.5 font-medium">{r.name}</td>
                <td className="hidden px-2 py-1.5 sm:table-cell">
                  <Badge variant="outline">{r.role}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MockShell>
  );
}

/** Events / parish operations mock. */
export function MockEvents() {
  const events = [
    {
      title: "Holy Qurbana",
      when: "Sun · 10:00 AM",
      place: "Main sanctuary",
    },
    {
      title: "Youth fellowship",
      when: "Fri · 7:00 PM",
      place: "Parish hall",
    },
    {
      title: "Parish council",
      when: "Tue · 6:30 PM",
      place: "Conference room",
    },
  ];
  return (
    <MockShell active="Events" title="Events & facilities">
      <div className="space-y-2">
        {events.map((e) => (
          <div
            key={e.title}
            className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-2.5"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarBlankIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium">{e.title}</p>
              <p className="text-[10px] text-muted-foreground">{e.when}</p>
              <p className="text-[10px] text-muted-foreground">{e.place}</p>
            </div>
            <Badge variant="secondary" className="ml-auto shrink-0">
              RSVP
            </Badge>
          </div>
        ))}
      </div>
    </MockShell>
  );
}

/** Data sharing governance mock. */
export function MockSharing() {
  return (
    <MockShell active="Sharing" title="Data sharing & sovereignty">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheckIcon className="size-4 text-primary" />
        <p className="text-[11px] font-medium">Parish-controlled grants</p>
      </div>
      <div className="space-y-2">
        <div className="rounded-lg border border-border p-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Diocese aggregate report</p>
            <Badge>Active</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Tier-2 counts only · expires in 90 days
          </p>
        </div>
        <div className="rounded-lg border border-border p-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Secure link · membership list</p>
            <Badge variant="outline">Link</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Max 25 views · anonymized projection
          </p>
        </div>
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2.5">
          <p className="text-[10px] text-muted-foreground">
            Emergency access · view-only · max 7 days · fully audited
          </p>
        </div>
      </div>
    </MockShell>
  );
}
