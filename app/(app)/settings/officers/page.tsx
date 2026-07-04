"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";

const officerSchema = z.object({
    memberId: z.string().min(1, "Select a member"),
    title: z.string().min(1, "Title is required"),
    officerType: z.string().min(1, "Select a type"),
    termStart: z.string().optional(),
    termEnd: z.string().optional(),
});

type OfficerForm = z.infer<typeof officerSchema>;

type Officer = {
    id: string;
    title: string;
    officerType: string;
    termStart: string;
    termEnd: string | null;
    isActive: boolean;
    member: {
        id: string;
        firstName: string;
        lastName: string;
        memberIdentifier: string;
    };
};

const OFFICER_TYPES = ["CLERGY", "WARDEN", "TRUSTEE", "SECRETARY", "OTHER"];

export default function OfficersPage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const [officers, setOfficers] = useState<Officer[]>([]);
    const [members, setMembers] = useState<
        { id: string; firstName: string; lastName: string; memberIdentifier: string; }[]
    >([]);
    const [loading, setLoading] = useState(true);

    const canManage =
        claims?.app_metadata.roles.includes("parish_admin") ?? false;

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        formState: { errors, isSubmitting },
        setError,
    } = useForm<OfficerForm>({
        resolver: zodResolver(officerSchema),
        defaultValues: {
            memberId: "",
            title: "",
            officerType: "",
            termStart: format(new Date(), "yyyy-MM-dd"),
            termEnd: "",
        },
    });

    async function load() {
        try {
            const [officersResponse, membersResponse] = await Promise.all([
                apiRequest<{ ok: true; officers: Officer[]; }>("/api/parish-officers"),
                apiRequest<{ ok: true; members: { id: string; firstName: string; lastName: string; memberIdentifier: string; }[]; }>(
                    "/api/members",
                ),
            ]);
            setOfficers(officersResponse.officers);
            setMembers(membersResponse.members);
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Unable to load officers",
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (sessionLoading) return;
        // Data fetching on mount is the standard pattern for this client page;
        // the rule discourages synchronous setState in effects, but load() is async.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [sessionLoading]);

    async function onSubmit(data: OfficerForm) {
        try {
            await apiRequest<{ ok: true; officer: Officer; }>("/api/parish-officers", {
                method: "POST",
                body: JSON.stringify({
                    ...data,
                    termStart: data.termStart || format(new Date(), "yyyy-MM-dd"),
                    termEnd: data.termEnd || null,
                }),
            });
            toast.success("Officer assigned");
            reset();
            await load();
        } catch (err) {
            const message = isApiClientError(err)
                ? err.message
                : err instanceof Error
                    ? err.message
                    : "Assignment failed";
            setError("root", { message });
            toast.error(message);
        }
    }

    async function remove(officerId: string) {
        try {
            await apiRequest<{ ok: true; }>(`/api/parish-officers/${officerId}`, {
                method: "PATCH",
                body: JSON.stringify({ isActive: false }),
            });
            toast.success("Officer removed");
            await load();
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Remove failed",
            );
        }
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="Parish officers"
                description="Officers, board, and clergy derivation."
            />
            <div className="flex-1 space-y-6 p-4 sm:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Current officers</CardTitle>
                        <CardDescription>
                            Marking an officer as <strong>Clergy</strong> grants the private-note
                            and pastoral-data capabilities for this parish.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <p className="text-sm text-muted-foreground">Loading…</p>
                        ) : officers.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No officers assigned yet.
                            </p>
                        ) : (
                            <ul className="divide-y">
                                {officers.map((officer) => (
                                    <li
                                        key={officer.id}
                                        className="flex items-center justify-between py-3"
                                    >
                                        <div>
                                            <p className="text-sm font-medium">
                                                {officer.member.firstName} {officer.member.lastName} (
                                                {officer.member.memberIdentifier})
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {officer.title} · {officer.officerType}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge
                                                variant={officer.isActive ? "default" : "secondary"}
                                            >
                                                {officer.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                            {canManage && officer.isActive ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => remove(officer.id)}
                                                >
                                                    <TrashIcon className="size-4" />
                                                </Button>
                                            ) : null}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                {canManage ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Assign officer</CardTitle>
                        </CardHeader>
                        <form onSubmit={handleSubmit(onSubmit)}>
                            <CardContent className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="memberId">Member</Label>
                                    <Select
                                        onValueChange={(value) =>
                                            setValue("memberId", value, { shouldValidate: true })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select member" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {members.map((member) => (
                                                <SelectItem key={member.id} value={member.id}>
                                                    {member.firstName} {member.lastName} (
                                                    {member.memberIdentifier})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <input type="hidden" {...register("memberId")} />
                                    {errors.memberId ? (
                                        <p className="text-xs text-destructive">
                                            {errors.memberId.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="title">Title</Label>
                                    <Input id="title" {...register("title")} />
                                    {errors.title ? (
                                        <p className="text-xs text-destructive">
                                            {errors.title.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="officerType">Officer type</Label>
                                    <Select
                                        onValueChange={(value) =>
                                            setValue("officerType", value, { shouldValidate: true })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OFFICER_TYPES.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {type}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <input type="hidden" {...register("officerType")} />
                                    {errors.officerType ? (
                                        <p className="text-xs text-destructive">
                                            {errors.officerType.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="termStart">Term start</Label>
                                    <Input id="termStart" type="date" {...register("termStart")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="termEnd">Term end</Label>
                                    <Input id="termEnd" type="date" {...register("termEnd")} />
                                </div>
                                {errors.root ? (
                                    <p className="text-xs text-destructive sm:col-span-2">
                                        {errors.root.message}
                                    </p>
                                ) : null}
                            </CardContent>
                            <CardContent>
                                <Button type="submit" disabled={isSubmitting}>
                                    <PlusIcon className="mr-2 size-4" />
                                    Assign officer
                                </Button>
                            </CardContent>
                        </form>
                    </Card>
                ) : null}
            </div>
        </div>
    );
}
