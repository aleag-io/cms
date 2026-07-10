import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardDto } from "@/lib/dashboard/types";

export function MemberLinksPanel({ dashboard }: { dashboard: DashboardDto }) {
  if (dashboard.mode !== "member" || !dashboard.memberLinks?.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {dashboard.memberLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full transition hover:border-primary/40 hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base">{link.title}</CardTitle>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
            <p className="mt-auto px-4 pb-4 text-xs font-medium text-primary">
              Open →
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
