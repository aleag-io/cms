import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DemographicsChart } from "@/components/app/dashboard/demographics-chart";
import type { DashboardDto } from "@/lib/dashboard/types";

const STATUS_ORDER = [
  "ACTIVE",
  "PENDING",
  "INACTIVE",
  "MOVED",
  "DECEASED",
] as const;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  INACTIVE: "Inactive",
  MOVED: "Moved",
  DECEASED: "Deceased",
};

export function DemographicsPanel({ dashboard }: { dashboard: DashboardDto }) {
  const { byStatus, ageGenderBands, genderTotals } = dashboard.demographics;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0) || 1;
  const showChart =
    ageGenderBands != null &&
    genderTotals != null &&
    ageGenderBands.length > 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Demographics</CardTitle>
        <CardDescription>
          {showChart
            ? "Age bands by gender (active members with a date of birth)"
            : "Membership status breakdown"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {showChart ? (
          <DemographicsChart bands={ageGenderBands} totals={genderTotals} />
        ) : null}

        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            Membership status
          </p>
          <ul className="space-y-2">
            {STATUS_ORDER.map((key) => {
              const count = byStatus[key] ?? 0;
              const pct = Math.round((count / total) * 100);
              return (
                <li key={key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{STATUS_LABEL[key] ?? key}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
