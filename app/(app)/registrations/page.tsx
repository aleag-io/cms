"use client";

import { useEffect, useState } from "react";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";

type Registration = {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    familyName: string | null;
    notes: string | null;
    submittedAt: string;
    approvalStatus: string;
};

async function fetchRegistrations(): Promise<Registration[]> {
    const response = await apiRequest<{ ok: true; registrations: Registration[]; }>(
        "/api/registrations",
    );
    return response.registrations;
}

export default function RegistrationsPage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);

    const canManage =
        claims?.app_metadata.roles.some((role) =>
            ["parish_admin", "parish_staff"].includes(role),
        ) ?? false;

    async function load() {
        try {
            const rows = await fetchRegistrations();
            setRegistrations(rows);
        } catch (err) {
            setError(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Unable to load registrations",
            );
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (sessionLoading) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [sessionLoading]);

    async function review(id: string, approved: boolean) {
        try {
            await apiRequest<{ ok: true; }>(`/api/registrations/${id}/approve`, {
                method: "POST",
                body: JSON.stringify({ decision: approved ? "APPROVE" : "REJECT" }),
            });
            toast.success(approved ? "Registration approved" : "Registration rejected");
            await load();
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Review failed",
            );
        }
    }

    if (sessionLoading || busy) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Registrations" description="Loading queue…" />
                <div className="flex-1 p-4 sm:p-6">
                    <PageSkeleton />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Registrations" description="Could not load queue." />
                <div className="flex-1 p-4 sm:p-6">
                    <ErrorState title="Load failed" description={error} retry={load} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="Self-registration queue"
                description="Review pending member registrations. Approved members become visible in the directory."
            />
            <div className="flex-1 p-4 sm:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending registrations</CardTitle>
                        <CardDescription>
                            {registrations.length === 0
                                ? "No pending registrations."
                                : `${registrations.length} pending`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {registrations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                New self-registrations will appear here for review.
                            </p>
                        ) : (
                            <ul className="divide-y">
                                {registrations.map((registration) => (
                                    <li
                                        key={registration.id}
                                        className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div>
                                            <p className="text-sm font-medium">
                                                {registration.firstName} {registration.lastName}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {registration.email ?? "—"}
                                                {registration.phone ? ` · ${registration.phone}` : ""}
                                            </p>
                                            {registration.familyName ? (
                                                <p className="text-xs text-muted-foreground">
                                                    Family: {registration.familyName}
                                                </p>
                                            ) : null}
                                            {registration.notes ? (
                                                <p className="text-xs text-muted-foreground">
                                                    {registration.notes}
                                                </p>
                                            ) : null}
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Submitted{" "}
                                                {new Date(registration.submittedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                        {canManage ? (
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => review(registration.id, true)}
                                                >
                                                    <CheckIcon className="mr-1 size-4" />
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => review(registration.id, false)}
                                                >
                                                    <XIcon className="mr-1 size-4" />
                                                    Reject
                                                </Button>
                                            </div>
                                        ) : (
                                            <Badge variant="secondary">Pending</Badge>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
