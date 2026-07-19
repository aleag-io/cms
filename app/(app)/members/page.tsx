"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DownloadIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { SelectionToolbar } from "@/components/patterns/selection-toolbar";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
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

async function deactivateMember(id: string): Promise<MemberListItem> {
    const response = await apiRequest<{ ok: true; member: MemberListItem; }>(
        `/api/members/${id}`,
        { method: "DELETE" },
    );
    return response.member;
}

export default function MembersPage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const [members, setMembers] = useState<MemberListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [acting, setActing] = useState(false);

    const roles = claims?.app_metadata.roles ?? [];
    const canManage = roles.some((role) =>
        ["parish_admin", "parish_staff", "diocese_admin"].includes(role),
    );
    // Matches DELETE /api/members/[id] — parish_staff can create/edit, not deactivate.
    const canDeactivate = roles.some((role) =>
        ["parish_admin", "diocese_admin"].includes(role),
    );

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

    function markInactive(id: string) {
        // DELETE returns the raw Member row without list joins (e.g. family).
        // Only flip status so list projections stay intact.
        setMembers((current) =>
            current.map((row) =>
                row.id === id ? { ...row, status: "INACTIVE" } : row,
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
            await deactivateMember(id);
            markInactive(id);
            toast.success("Member deactivated");
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Unable to deactivate member",
            );
        } finally {
            setActing(false);
        }
    }

    async function deactivateSelected() {
        const ids = [...selectedKeys].filter((id) => {
            const row = members.find((m) => m.id === id);
            return row && row.status !== "INACTIVE";
        });
        if (ids.length === 0) return;

        setActing(true);
        let ok = 0;
        let failed = 0;
        for (const id of ids) {
            try {
                await deactivateMember(id);
                markInactive(id);
                ok += 1;
            } catch {
                failed += 1;
            }
        }
        setSelectedKeys(new Set());
        setActing(false);
        if (ok > 0) toast.success(`Deactivated ${ok} member${ok === 1 ? "" : "s"}`);
        if (failed > 0) toast.error(`${failed} could not be deactivated`);
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
                description="Parish member records. Sensitive fields are projected by the API based on your role. Deactivate removes people from active rolls; history is retained."
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={exportCsv}>
                            <DownloadIcon className="mr-2 size-4" />
                            Export
                        </Button>
                        {canManage ? (
                            <Button asChild variant="outline">
                                <Link href="/members/import">Import CSV</Link>
                            </Button>
                        ) : null}
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
                            title={`Deactivate ${selectedKeys.size} member${selectedKeys.size === 1 ? "" : "s"}?`}
                            description="Selected members are set to Inactive. Records and history are kept; they no longer appear as active parish members."
                            confirmLabel="Deactivate"
                            destructive
                            onConfirm={() => {
                                void deactivateSelected();
                            }}
                        />
                    </SelectionToolbar>
                ) : null}

                <DataTable
                    rows={members}
                    selection={
                        canDeactivate
                            ? {
                                selectedKeys,
                                onChange: setSelectedKeys,
                                isRowSelectable: (row) => row.status !== "INACTIVE",
                                getRowLabel: (row) =>
                                    `${row.firstName} ${row.lastName} (${row.memberIdentifier})`,
                            }
                            : undefined
                    }
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
                        ...(canDeactivate
                            ? [
                                {
                                    key: "actions",
                                    header: "Actions",
                                    className: "w-[1%] whitespace-nowrap",
                                    cell: (row: MemberListItem) =>
                                        row.status === "INACTIVE" ? (
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
                                                title="Deactivate member?"
                                                description={`${row.firstName} ${row.lastName} will be set to Inactive. The record and audit history are retained.`}
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
                            title="No members found"
                            description="Members will appear once they are added or self-registered and approved."
                        />
                    }
                />
            </div>
        </div>
    );
}
