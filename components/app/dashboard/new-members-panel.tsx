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
import type { DashboardDto } from "@/lib/dashboard/types";

export function NewMembersPanel({ dashboard }: { dashboard: DashboardDto }) {
  if (dashboard.mode === "member") return null;

  const rows = dashboard.newMembers;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">New members</CardTitle>
        <CardDescription>Added in the last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No recent members"
            description="New member records from the past month will show here."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/members/${m.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {m.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.memberIdentifier}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{m.status}</Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
