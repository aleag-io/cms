"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, isApiClientError } from "@/lib/api-client";

type ViewPayload = {
  type?: string;
  members?: Array<{
    memberIdentifier?: string;
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
  }>;
  member?: {
    memberIdentifier?: string;
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
  };
};

export default function AuthenticatedShareViewPage() {
  const params = useParams<{ id: string }>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ViewPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ ok: true; payload: ViewPayload }>(`/api/shares/${params.id}/view`)
      .then((res) => {
        if (!cancelled) {
          setPayload(res.payload);
          setBusy(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            isApiClientError(err)
              ? err.message
              : err instanceof Error
                ? err.message
                : "Unable to open share",
          );
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Shared content" description="Loading…" />
        <div className="flex-1 p-4 sm:p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Shared content" description="Unavailable" />
        <div className="flex-1 space-y-4 p-4 sm:p-6">
          <ErrorState
            title="Share not accessible"
            description={error ?? "Not found"}
          />
          <Button asChild variant="outline">
            <Link href="/sharing">Back to sharing</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Shared content"
        description="Read-only view authorized by a contextual share."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/sharing">Sharing console</Link>
          </Button>
        }
      />
      <div className="flex-1 p-4 sm:p-6">
        {payload.type === "member_list" ? (
          <Card>
            <CardHeader>
              <CardTitle>Member directory</CardTitle>
              <CardDescription>Anonymized or projected fields only.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payload.members ?? []).map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>{m.memberIdentifier ?? "—"}</TableCell>
                      <TableCell>
                        {[m.firstName, m.lastName].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell>{m.email ?? "—"}</TableCell>
                      <TableCell>{m.phone ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : payload.type === "member" && payload.member ? (
          <Card>
            <CardHeader>
              <CardTitle>Member</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">ID</span>
                <p className="font-medium">
                  {payload.member.memberIdentifier ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Name</span>
                <p className="font-medium">
                  {[payload.member.firstName, payload.member.lastName]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Email</span>
                <p className="font-medium">{payload.member.email ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <p className="font-medium">{payload.member.phone ?? "—"}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
