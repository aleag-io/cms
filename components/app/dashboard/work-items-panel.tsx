import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/patterns/states";
import type { DashboardDto, WorkItemSeverity } from "@/lib/dashboard/types";

function severityVariant(
  severity: WorkItemSeverity,
): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "urgent") return "destructive";
  if (severity === "warning") return "default";
  return "secondary";
}

export function WorkItemsPanel({ dashboard }: { dashboard: DashboardDto }) {
  if (dashboard.mode === "member") return null;

  // Show items with count > 0 first; always show actionable list
  const items = [...dashboard.workItems].sort((a, b) => {
    const sev = { urgent: 0, warning: 1, info: 2 } as const;
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
    return b.count - a.count;
  });

  const actionable = items.filter((i) => i.count > 0 && i.severity !== "info");
  const display = actionable.length > 0 ? items.filter((i) => i.count > 0) : items;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Needs attention</CardTitle>
        <CardDescription>
          Queues and follow-ups for your role
        </CardDescription>
      </CardHeader>
      <CardContent>
        {display.every((i) => i.count === 0) ? (
          <EmptyState
            title="All clear"
            description="No pending registrations, sharing requests, or failed messages."
          />
        ) : (
          <ul className="space-y-3">
            {display.map((item) => (
              <li key={item.key} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={item.href}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.title}
                    </Link>
                    {item.preview && item.preview.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.preview.map((p) => p.label).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={severityVariant(item.severity)}>
                    {item.count}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
