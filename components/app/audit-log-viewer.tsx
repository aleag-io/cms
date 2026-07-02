"use client";

import { useEffect, useState } from "react";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api-client";

type AuditEntryRecord = {
  id: string;
  timestamp: string;
  actorLabel: string;
  action: string;
  entityType: string;
  outcome: "SUCCESS" | "DENIED" | "FAILED";
  metadata: unknown;
};

type AuditResponse = {
  ok: true;
  auditEntries: AuditEntryRecord[];
  pagination: {
    page: number;
    limit: number;
    nextPage: number | null;
  };
};

export function AuditLogViewer() {
  const [entries, setEntries] = useState<AuditEntryRecord[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(page: number, append: boolean) {
    try {
      const response = await apiRequest<AuditResponse>(
        `/api/audit?page=${page}&limit=25`,
      );
      setEntries((current) =>
        append ? [...current, ...response.auditEntries] : response.auditEntries,
      );
      setNextPage(response.pagination.nextPage);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load audit log",
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load(1, false);
  }, []);

  if (loading) {
    return <PageSkeleton rows={8} />;
  }

  if (error) {
    return (
      <ErrorState
        title="Audit log unavailable"
        description={error}
        retry={() => {
          setLoading(true);
          void load(1, false);
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Activity</CardTitle>
        <CardDescription>
          Read-only audit view for diocese- and parish-scope administrative actions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{new Date(entry.timestamp).toLocaleString()}</TableCell>
                <TableCell>{entry.actorLabel}</TableCell>
                <TableCell>{entry.action}</TableCell>
                <TableCell>{entry.entityType}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      entry.outcome === "SUCCESS"
                        ? "secondary"
                        : entry.outcome === "DENIED"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {entry.outcome}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[24rem] whitespace-normal break-words text-[0.6875rem] text-muted-foreground">
                  {entry.metadata ? JSON.stringify(entry.metadata) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {nextPage ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                void load(nextPage, true);
              }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}