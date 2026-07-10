import Link from "next/link";
import { CakeIcon, HeartIcon } from "@phosphor-icons/react/dist/ssr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/patterns/states";
import type { DashboardDto } from "@/lib/dashboard/types";

function formatShort(isoDate: string) {
  try {
    const d = new Date(isoDate + (isoDate.length === 10 ? "T12:00:00Z" : ""));
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return isoDate;
  }
}

export function PastoralDatesPanel({ dashboard }: { dashboard: DashboardDto }) {
  if (
    dashboard.birthdaysThisWeek === undefined &&
    dashboard.anniversariesThisWeek === undefined
  ) {
    return null;
  }

  const birthdays = dashboard.birthdaysThisWeek ?? [];
  const anniversaries = dashboard.anniversariesThisWeek ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CakeIcon className="size-5 text-primary" />
            <CardTitle className="text-base">Birthdays this week</CardTitle>
          </div>
          <CardDescription>Next 7 days (UTC)</CardDescription>
        </CardHeader>
        <CardContent>
          {birthdays.length === 0 ? (
            <EmptyState
              title="No birthdays this week"
              description="Pastoral dates with a date of birth will appear here."
            />
          ) : (
            <ul className="divide-y">
              {birthdays.map((row) => (
                <li key={row.memberId} className="flex items-center justify-between py-2 text-sm">
                  <Link
                    href={`/members/${row.memberId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {formatShort(row.occurrenceDate)}
                    {row.turnsAge != null ? ` · turns ${row.turnsAge}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HeartIcon className="size-5 text-primary" />
            <CardTitle className="text-base">Anniversaries this week</CardTitle>
          </div>
          <CardDescription>Family anniversary dates · next 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          {anniversaries.length === 0 ? (
            <EmptyState
              title="No anniversaries this week"
              description="Family pastoral anniversary dates will appear here."
            />
          ) : (
            <ul className="divide-y">
              {anniversaries.map((row) => (
                <li
                  key={row.familyId}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <Link
                    href={`/families/${row.familyId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.familyName} family
                  </Link>
                  <span className="text-muted-foreground">
                    {formatShort(row.occurrenceDate)}
                    {row.years != null ? ` · ${row.years} yrs` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
