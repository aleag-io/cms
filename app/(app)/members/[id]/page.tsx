"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/patterns/page-header";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import { MemberBasicForm } from "./member-basic-form";
import { MemberPastoralForm } from "./member-pastoral-form";
import { MemberPrivateNoteForm } from "./member-private-note-form";
import { MemberRelationships } from "./member-relationships";
import { MemberParishes } from "./member-parishes";

type Family = { familyName: string; familyNumber: string; } | null;

type PastoralData = {
    dateOfBirth: string | null;
    baptismDate: string | null;
    chrismationDate: string | null;
} | null;

type MemberDetail = {
    id: string;
    memberIdentifier: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    status: string;
    family: Family;
    workNotes?: string | null;
    educationLevel?: string | null;
    skillsInterests?: string[];
    privateNote?: { note: string; } | null;
    pastoralData?: PastoralData;
};

async function fetchMember(id: string): Promise<MemberDetail> {
    const response = await apiRequest<{ ok: true; member: MemberDetail; }>(
        `/api/members/${id}`,
    );
    return response.member;
}

export default function MemberDetailPage() {
    const params = useParams<{ id: string; }>();
    const router = useRouter();
    const { claims, isLoading: sessionLoading } = useSession();
    const [member, setMember] = useState<MemberDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [editingBasic, setEditingBasic] = useState(false);
    const [acting, setActing] = useState(false);

    const roles = claims?.app_metadata.roles ?? [];
    const isClergy = roles.includes("clergy");
    const canManage = roles.some((role) =>
        ["parish_admin", "parish_staff", "diocese_admin"].includes(role),
    );
    const canDeactivate = roles.some((role) =>
        ["parish_admin", "diocese_admin"].includes(role),
    );
    const canSeePastoral =
        isClergy ||
        roles.some((role) =>
            ["parish_admin", "pastoral_data_accessor"].includes(role),
        );

    async function deactivateMember() {
        if (!member) return;
        setActing(true);
        try {
            const response = await apiRequest<{ ok: true; member: MemberDetail; }>(
                `/api/members/${member.id}`,
                { method: "DELETE" },
            );
            setMember(response.member);
            toast.success("Member deactivated");
            router.push("/members");
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

    useEffect(() => {
        if (sessionLoading) return;
        let cancelled = false;
        fetchMember(params.id)
            .then((data) => {
                if (!cancelled) {
                    setMember(data);
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
                                : "Unable to load member",
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
                <PageHeader title="Member" description="Loading member profile…" />
                <div className="flex-1 p-4 sm:p-6">
                    <PageSkeleton rows={8} />
                </div>
            </div>
        );
    }

    if (error || !member) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Member" description="Could not load member." />
                <div className="flex-1 p-4 sm:p-6">
                    <ErrorState title="Load failed" description={error ?? "Not found"} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title={`${member.firstName} ${member.lastName}`}
                description={`${member.memberIdentifier} · ${member.status}`}
                actions={
                    canManage || canDeactivate ? (
                        <div className="flex flex-wrap gap-2">
                            {canManage ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingBasic((current) => !current)}
                                >
                                    <PencilSimpleIcon className="mr-2 size-4" />
                                    {editingBasic ? "Cancel" : "Edit"}
                                </Button>
                            ) : null}
                            {canDeactivate && member.status !== "INACTIVE" ? (
                                <ConfirmDialog
                                    trigger={
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            disabled={acting}
                                        >
                                            <TrashIcon className="mr-2 size-4" />
                                            Deactivate
                                        </Button>
                                    }
                                    title="Deactivate member?"
                                    description={`${member.firstName} ${member.lastName} will be set to Inactive. The record and audit history are retained.`}
                                    confirmLabel="Deactivate"
                                    destructive
                                    onConfirm={() => {
                                        void deactivateMember();
                                    }}
                                />
                            ) : null}
                        </div>
                    ) : null
                }
            />

            <div className="flex-1 p-4 sm:p-6">
                <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="mb-4">
                        <TabsTrigger value="basic">Basic</TabsTrigger>
                        {canSeePastoral ? (
                            <TabsTrigger value="pastoral">Pastoral</TabsTrigger>
                        ) : null}
                        {isClergy ? (
                            <TabsTrigger value="private-note">Private note</TabsTrigger>
                        ) : null}
                        <TabsTrigger value="relationships">Relationships</TabsTrigger>
                        <TabsTrigger value="parishes">Parishes</TabsTrigger>
                    </TabsList>

                    <TabsContent value="basic">
                        {editingBasic ? (
                            <MemberBasicForm
                                member={member}
                                onSaved={(updated) => {
                                    setMember(updated);
                                    setEditingBasic(false);
                                }}
                            />
                        ) : (
                            <BasicReadOnly member={member} />
                        )}
                    </TabsContent>

                    {canSeePastoral ? (
                        <TabsContent value="pastoral">
                            <MemberPastoralForm
                                memberId={member.id}
                                initial={member.pastoralData ?? null}
                                canEdit={canSeePastoral}
                            />
                        </TabsContent>
                    ) : null}

                    {isClergy ? (
                        <TabsContent value="private-note">
                            <MemberPrivateNoteForm
                                memberId={member.id}
                                initial={member.privateNote?.note ?? ""}
                            />
                        </TabsContent>
                    ) : null}

                    <TabsContent value="relationships">
                        <MemberRelationships memberId={member.id} />
                    </TabsContent>

                    <TabsContent value="parishes">
                        <MemberParishes memberId={member.id} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

function BasicReadOnly({ member }: { member: MemberDetail; }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Contact information</CardTitle>
                <CardDescription>Basic member details.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="First name" value={member.firstName} />
                <ReadOnlyField label="Last name" value={member.lastName} />
                <ReadOnlyField label="Email" value={member.email ?? "—"} />
                <ReadOnlyField label="Phone" value={member.phone ?? "—"} />
                <ReadOnlyField
                    label="Family"
                    value={
                        member.family
                            ? `${member.family.familyName} (${member.family.familyNumber})`
                            : "—"
                    }
                />
                <ReadOnlyField
                    label="Status"
                    value={
                        <Badge
                            variant={member.status === "ACTIVE" ? "default" : "secondary"}
                        >
                            {member.status}
                        </Badge>
                    }
                />
                {"workNotes" in member ? (
                    <ReadOnlyField
                        label="Work notes"
                        value={member.workNotes ?? "—"}
                        className="sm:col-span-2"
                    />
                ) : null}
                {"educationLevel" in member ? (
                    <ReadOnlyField
                        label="Education"
                        value={member.educationLevel ?? "—"}
                    />
                ) : null}
                {"skillsInterests" in member ? (
                    <ReadOnlyField
                        label="Skills & interests"
                        value={member.skillsInterests?.join(", ") ?? "—"}
                        className="sm:col-span-2"
                    />
                ) : null}
            </CardContent>
        </Card>
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
