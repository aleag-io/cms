"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { DataTable } from "@/components/patterns/data-table";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
import { FamilyForm } from "./family-form";

type MemberListItem = {
    id: string;
    memberIdentifier: string;
    firstName: string;
    lastName: string;
    email: string | null;
    status: string;
};

type FamilyDetail = {
    id: string;
    familyName: string;
    familyNumber: string;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;
    address: string | null;
    members?: MemberListItem[];
};

async function fetchFamily(id: string): Promise<FamilyDetail> {
    const response = await apiRequest<{ ok: true; family: FamilyDetail; }>(
        `/api/families/${id}`,
    );
    return response.family;
}

export default function FamilyDetailPage() {
    const params = useParams<{ id: string; }>();
    const { claims, isLoading: sessionLoading } = useSession();
    const [family, setFamily] = useState<FamilyDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [editing, setEditing] = useState(false);

    const canManage =
        claims?.app_metadata.roles.some((role) =>
            ["parish_admin", "parish_staff"].includes(role),
        ) ?? false;

    useEffect(() => {
        if (sessionLoading) return;
        let cancelled = false;
        fetchFamily(params.id)
            .then((data) => {
                if (!cancelled) {
                    setFamily(data);
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
                                : "Unable to load family",
                    );
                    setBusy(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [params.id, sessionLoading]);

    if (sessionLoading || busy) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Family" description="Loading family details…" />
                <div className="flex-1 p-4 sm:p-6">
                    <PageSkeleton rows={6} />
                </div>
            </div>
        );
    }

    if (error || !family) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Family" description="Could not load family." />
                <div className="flex-1 p-4 sm:p-6">
                    <ErrorState title="Load failed" description={error ?? "Not found"} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title={family.familyName}
                description={`Family ${family.familyNumber}`}
                actions={
                    canManage ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing((current) => !current)}
                        >
                            <PencilSimpleIcon className="mr-2 size-4" />
                            {editing ? "Cancel" : "Edit"}
                        </Button>
                    ) : null
                }
            />

            <div className="flex-1 space-y-6 p-4 sm:p-6">
                {editing ? (
                    <FamilyForm
                        family={family}
                        onSaved={(updated) => {
                            setFamily(updated);
                            setEditing(false);
                        }}
                    />
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Family information</CardTitle>
                            <CardDescription>Contact and address details.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <ReadOnlyField label="Family name" value={family.familyName} />
                            <ReadOnlyField label="Family number" value={family.familyNumber} />
                            <ReadOnlyField
                                label="Email"
                                value={family.primaryContactEmail ?? "—"}
                            />
                            <ReadOnlyField
                                label="Phone"
                                value={family.primaryContactPhone ?? "—"}
                            />
                            <ReadOnlyField
                                label="Address"
                                value={family.address ?? "—"}
                                className="sm:col-span-2"
                            />
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Members</CardTitle>
                        <CardDescription>
                            Members assigned to this family record.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DataTable
                            rows={family.members ?? []}
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
                                { key: "email", header: "Email", cell: (row) => row.email ?? "—" },
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
                                    title="No members"
                                    description="This family has no members yet."
                                />
                            }
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function ReadOnlyField({
    label,
    value,
    className,
}: {
    label: string;
    value: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={className}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div className="mt-1 text-sm">{value}</div>
        </div>
    );
}
