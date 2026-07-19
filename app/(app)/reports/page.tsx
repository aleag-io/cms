"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/patterns/page-header";
import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from "@/components/patterns/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api-client";

type ReportSummary = {
  id: string;
  title: string;
  description: string;
  category: "people" | "operations" | "finance";
  needsLedgerOwner: boolean;
};

const CATEGORY_LABELS: Record<ReportSummary["category"], string> = {
  people: "People & membership",
  operations: "Parish operations",
  finance: "Finance & giving",
};

export default function ReportsHubPage() {
  const query = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () =>
      apiRequest<{ ok: true; scope: string; reports: ReportSummary[] }>(
        "/api/reports",
      ),
  });

  if (query.isLoading) return <PageSkeleton rows={4} />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load reports"
        description="The report catalog failed to load."
        retry={() => void query.refetch()}
      />
    );
  }

  const reports = query.data?.reports ?? [];
  const categories = (
    ["people", "operations", "finance"] as const
  ).filter((category) => reports.some((r) => r.category === category));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Standard reports for your role. Every report can be exported to CSV or PDF; exports carry the same field-level protections as the screens."
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No reports available"
          description="Your role does not have access to any reports."
        />
      ) : (
        categories.map((category) => (
          <section key={category} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {CATEGORY_LABELS[category]}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reports
                .filter((report) => report.category === category)
                .map((report) => (
                  <Link
                    key={report.id}
                    href={`/reports/${report.id}`}
                    className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Card className="h-full transition-colors hover:border-primary">
                      <CardHeader>
                        <CardTitle className="text-base">{report.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {report.description}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
