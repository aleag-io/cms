"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { SelectionToolbar } from "@/components/patterns/selection-toolbar";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

type FamilyListItem = {
    id: string;
    familyName: string;
    familyNumber: string;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;
    address: string | null;
    isActive?: boolean;
};

async function fetchFamilies(): Promise<FamilyListItem[]> {
    const response = await apiRequest<{ ok: true; families: FamilyListItem[]; }>(
        "/api/families",
    );
    return response.families;
}

async function deactivateFamily(id: string): Promise<FamilyListItem> {
    const response = await apiRequest<{ ok: true; family: FamilyListItem; }>(
        `/api/families/${id}`,
        { method: "DELETE" },
    );
    return response.family;
}

function isActiveFamily(row: FamilyListItem): boolean {
    return row.isActive !== false;
}

export default function FamiliesPage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const [families, setFamilies] = useState<FamilyListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [acting, setActing] = useState(false);

    const roles = claims?.app_metadata.roles ?? [];
    const canManage = roles.some((role) =>
        ["parish_admin", "parish_staff", "diocese_admin"].includes(role),
    );
    const canDeactivate = roles.some((role) =>
        ["parish_admin", "diocese_admin"].includes(role),
    );

    function markInactive(id: string) {
        setFamilies((current) =>
            current.map((row) =>
                row.id === id ? { ...row, isActive: false } : row,
            ),
        );
        setSelectedKeys((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
        });
    }

    async function deactivateOne(id: string) {
        setActing(true);
        try {
            await deactivateFamily(id);
            markInactive(id);
            toast.success("Family deactivated");
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Unable to deactivate family",
            );
        } finally {
            setActing(false);
        }
    }

    async function deactivateSelected() {
        const ids = [...selectedKeys].filter((id) => {
            const row = families.find((f) => f.id === id);
            return row && isActiveFamily(row);
        });
        if (ids.length === 0) return;

        setActing(true);
        let ok = 0;
        let failed = 0;
        for (const id of ids) {
            try {
                await deactivateFamily(id);
                markInactive(id);
                ok += 1;
            } catch {
                failed += 1;
            }
        }
        setSelectedKeys(new Set());
        setActing(false);
        if (ok > 0) toast.success(`Deactivated ${ok} famil${ok === 1 ? "y" : "ies"}`);
        if (failed > 0) toast.error(`${failed} could not be deactivated`);
    }

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
                description="Parish family records and identifiers. Deactivate keeps history and marks the family inactive."
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
                {canDeactivate ? (
                    <SelectionToolbar
                        count={selectedKeys.size}
                        onClear={() => setSelectedKeys(new Set())}
                    >
                        <ConfirmDialog
                            trigger={
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={acting || selectedKeys.size === 0}
                                >
                                    <TrashIcon className="mr-2 size-4" />
                                    Deactivate selected
                                </Button>
                            }
                            title={`Deactivate ${selectedKeys.size} famil${selectedKeys.size === 1 ? "y" : "ies"}?`}
                            description="Selected families are marked inactive. Member history stays linked; the family is no longer treated as active."
                            confirmLabel="Deactivate"
                            destructive
                            onConfirm={() => {
                                void deactivateSelected();
                            }}
                        />
                    </SelectionToolbar>
                ) : null}

                <DataTable
                    rows={families}
                    selection={
                        canDeactivate
                            ? {
                                selectedKeys,
                                onChange: setSelectedKeys,
                                isRowSelectable: isActiveFamily,
                                getRowLabel: (row) =>
                                    `${row.familyName} (${row.familyNumber})`,
                            }
                            : undefined
                    }
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
                        {
                            key: "status",
                            header: "Status",
                            cell: (row) => (
                                <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${isActiveFamily(row)
                                        ? "bg-green-100 text-green-800"
                                        : "bg-amber-100 text-amber-800"
                                        }`}
                                >
                                    {isActiveFamily(row) ? "ACTIVE" : "INACTIVE"}
                                </span>
                            ),
                        },
                        ...(canDeactivate
                            ? [
                                {
                                    key: "actions",
                                    header: "Actions",
                                    className: "w-[1%] whitespace-nowrap",
                                    cell: (row: FamilyListItem) =>
                                        !isActiveFamily(row) ? (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        ) : (
                                            <ConfirmDialog
                                                trigger={
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={acting}
                                                        className="text-destructive hover:text-destructive"
                                                    >
                                                        Deactivate
                                                    </Button>
                                                }
                                                title="Deactivate family?"
                                                description={`${row.familyName} (${row.familyNumber}) will be marked inactive. History is retained.`}
                                                confirmLabel="Deactivate"
                                                destructive
                                                onConfirm={() => {
                                                    void deactivateOne(row.id);
                                                }}
                                            />
                                        ),
                                },
                            ]
                            : []),
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
