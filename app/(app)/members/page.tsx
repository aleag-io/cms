"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DownloadIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

type MemberListItem = {
    id: string;
    memberIdentifier: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    status: string;
    family?: { familyName: string; familyNumber: string; } | null;
};

async function fetchMembers(): Promise<MemberListItem[]> {
    const response = await apiRequest<{ ok: true; members: MemberListItem[]; }>(
        "/api/members",
    );
    return response.members;
}

export default function MembersPage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const [members, setMembers] = useState<MemberListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);

    const canManage =
        claims?.app_metadata.roles.some((role) =>
            ["parish_admin", "parish_staff"].includes(role),
        ) ?? false;

    async function exportCsv() {
        try {
            const response = await fetch("/api/members/export", {
                headers: { accept: "text/csv" },
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]
                ?? "members-export.csv";
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success("Export downloaded");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Export failed");
        }
    }

    useEffect(() => {
        if (sessionLoading) return;
        let cancelled = false;
        fetchMembers().then(
            (rows) => {
                if (!cancelled) {
                    setMembers(rows);
                    setBusy(false);
                }
            },
            (err: unknown) => {
                if (!cancelled) {
                    setError(
                        isApiClientError(err)
                            ? err.message
                            : err instanceof Error
                                ? err.message
                                : "Unable to load members",
                    );
                    setBusy(false);
                }
            },
        );
        return () => {
            cancelled = true;
        };
    }, [sessionLoading]);

    if (sessionLoading || busy) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Members" description="Loading member records…" />
                <div className="flex-1 p-4 sm:p-6">
                    <PageSkeleton />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Members" description="Could not load members." />
                <div className="flex-1 p-4 sm:p-6">
                    <ErrorState title="Load failed" description={error} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="Members"
                description="Parish member records. Sensitive fields are projected by the API based on your role."
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={exportCsv}>
                            <DownloadIcon className="mr-2 size-4" />
                            Export
                        </Button>
                        {canManage ? (
                            <Button asChild>
                                <Link href="/members/new">
                                    <PlusIcon className="mr-2 size-4" />
                                    Add member
                                </Link>
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <div className="flex-1 p-4 sm:p-6">
                <DataTable
                    rows={members}
                    columns={[
                        {
                            key: "memberIdentifier",
                            header: "ID",
                            cell: (row) => (
                                <Link
                                    href={`/members/${row.id}`}
                                    className="font-medium text-primary hover:underline"
                                >
                                    {row.memberIdentifier}
                                </Link>
                            ),
                        },
                        { key: "firstName", header: "First name", cell: (row) => row.firstName },
                        { key: "lastName", header: "Last name", cell: (row) => row.lastName },
                        {
                            key: "family",
                            header: "Family",
                            cell: (row) =>
                                row.family
                                    ? `${row.family.familyName} (${row.family.familyNumber})`
                                    : "—",
                        },
                        { key: "email", header: "Email", cell: (row) => row.email ?? "—" },
                        { key: "phone", header: "Phone", cell: (row) => row.phone ?? "—" },
                        {
                            key: "status",
                            header: "Status",
                            cell: (row) => (
                                <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.status === "ACTIVE"
                                            ? "bg-green-100 text-green-800"
                                            : "bg-amber-100 text-amber-800"
                                        }`}
                                >
                                    {row.status}
                                </span>
                            ),
                        },
                    ]}
                    getRowKey={(row) => row.id}
                    empty={
                        <EmptyState
                            title="No members found"
                            description="Members will appear once they are added or self-registered and approved."
                        />
                    }
                />
            </div>
        </div>
    );
}
