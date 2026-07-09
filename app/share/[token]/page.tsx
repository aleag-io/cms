"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BuildingsIcon } from "@phosphor-icons/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MemberRow = {
  memberIdentifier?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
};

type Payload =
  | { type: "member_list"; members: MemberRow[] }
  | { type: "member"; member: MemberRow }
  | { type: string; [key: string]: unknown };

function isMemberList(
  p: Payload,
): p is { type: "member_list"; members: MemberRow[] } {
  return p.type === "member_list" && Array.isArray((p as { members?: unknown }).members);
}

function isMember(
  p: Payload,
): p is { type: "member"; member: MemberRow } {
  return p.type === "member" && typeof (p as { member?: unknown }).member === "object";
}

export default function SecureLinkViewerPage() {
  const params = useParams<{ token: string }>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = params.token;

    queueMicrotask(() => {
      if (cancelled) return;
      if (!token) {
        setError("Missing share token");
        setBusy(false);
        return;
      }

      fetch(`/api/shares/link/${encodeURIComponent(token)}`)
        .then(async (res) => {
          const data = (await res.json().catch(() => null)) as
            | { ok?: boolean; payload?: Payload; error?: string }
            | null;
          if (!res.ok) {
            throw new Error(data?.error ?? "Share is no longer accessible");
          }
          if (!cancelled) {
            setPayload(data?.payload ?? null);
            setBusy(false);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(
              err instanceof Error
                ? err.message
                : "Share is no longer accessible",
            );
            setBusy(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [params.token]);

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-4">
          <BuildingsIcon className="size-5 text-primary" />
          <span className="font-semibold">Shared parish data</span>
          <Badge variant="outline" className="ml-2">
            Secure link
          </Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Loading shared content…
          </div>
        ) : error ? (
          <Card>
            <CardHeader>
              <CardTitle>Unavailable</CardTitle>
              <CardDescription>
                This secure link is expired, exhausted, revoked, or invalid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="mt-4 text-sm">
                <Link href="/login" className="text-primary underline">
                  Sign in
                </Link>{" "}
                if you have an account.
              </p>
            </CardContent>
          </Card>
        ) : payload && isMemberList(payload) ? (
          <Card>
            <CardHeader>
              <CardTitle>Member directory</CardTitle>
              <CardDescription>
                Read-only shared projection. Sensitive fields may be anonymized.
              </CardDescription>
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
                  {payload.members.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>{m.memberIdentifier ?? "—"}</TableCell>
                      <TableCell>
                        {[m.firstName, m.lastName].filter(Boolean).join(" ") ||
                          "—"}
                      </TableCell>
                      <TableCell>{m.email ?? "—"}</TableCell>
                      <TableCell>{m.phone ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : payload && isMember(payload) ? (
          <Card>
            <CardHeader>
              <CardTitle>Member profile</CardTitle>
              <CardDescription>Read-only shared projection.</CardDescription>
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
          <Card>
            <CardHeader>
              <CardTitle>Shared resource</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
