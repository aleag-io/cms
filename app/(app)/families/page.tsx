"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { useSession } from "@/hooks/use-session";

type FamilyListItem = {
    id: string;
    familyName: string;
    familyNumber: string;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;
    address: string | null;
};

async function fetchFamilies(): Promise<FamilyListItem[]> {
    const response = await apiRequest<{ ok: true; families: FamilyListItem[]; }>(
        "/api/families",
    );
    return response.families;
}

export default function FamiliesPage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const [families, setFamilies] = useState<FamilyListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);

    const canManage =
        claims?.app_metadata.roles.some((role) =>
            ["parish_admin", "parish_staff"].includes(role),
        ) ?? false;

    useEffect(() => {
        if (sessionLoading) return;
        let cancelled = false;
        fetchFamilies().then(
            (rows) => {
                if (!cancelled) {
                    setFamilies(rows);
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
                                : "Unable to load families",
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
                <PageHeader title="Families" description="Loading family records…" />
                <div className="flex-1 p-4 sm:p-6">
                    <PageSkeleton />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Families" description="Could not load families." />
                <div className="flex-1 p-4 sm:p-6">
                    <ErrorState title="Load failed" description={error} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="Families"
                description="Parish family records and identifiers."
                actions={
                    canManage ? (
                        <Button asChild>
                            <Link href="/families/new">
                                <PlusIcon className="mr-2 size-4" />
                                Add family
                            </Link>
                        </Button>
                    ) : null
                }
            />

            <div className="flex-1 p-4 sm:p-6">
                <DataTable
                    rows={families}
                    columns={[
                        {
                            key: "familyNumber",
                            header: "Family number",
                            cell: (row) => (
                                <Link
                                    href={`/families/${row.id}`}
                                    className="font-medium text-primary hover:underline"
                                >
                                    {row.familyNumber}
                                </Link>
                            ),
                        },
                        { key: "familyName", header: "Family name", cell: (row) => row.familyName },
                        { key: "primaryContactEmail", header: "Email", cell: (row) => row.primaryContactEmail ?? "—" },
                        { key: "primaryContactPhone", header: "Phone", cell: (row) => row.primaryContactPhone ?? "—" },
                        { key: "address", header: "Address", cell: (row) => row.address ?? "—" },
                    ]}
                    getRowKey={(row) => row.id}
                    empty={
                        <EmptyState
                            title="No families found"
                            description="Families will appear once they are added."
                        />
                    }
                />
            </div>
        </div>
    );
}
