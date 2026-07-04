"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";

const relationshipSchema = z.object({
    relatedMemberId: z.string().min(1, "Select a member"),
    relationshipType: z.string().min(1, "Select a relationship"),
    notes: z.string().optional(),
});

type RelationshipForm = z.infer<typeof relationshipSchema>;

type Relationship = {
    id: string;
    relationshipType: string;
    notes: string | null;
    relatedMember: {
        id: string;
        firstName: string;
        lastName: string;
        memberIdentifier: string;
    };
};

const RELATIONSHIP_TYPES = [
    "SPOUSE",
    "PARENT",
    "CHILD",
    "SIBLING",
    "GRANDPARENT",
    "GRANDCHILD",
    "OTHER",
];

export function MemberRelationships({ memberId }: { memberId: string; }) {
    const { claims } = useSession();
    const [relationships, setRelationships] = useState<Relationship[]>([]);
    const [members, setMembers] = useState<
        { id: string; firstName: string; lastName: string; memberIdentifier: string; }[]
    >([]);
    const [loading, setLoading] = useState(true);
    const canManage = (claims?.app_metadata.roles ?? []).some((role) =>
        ["parish_admin", "parish_staff"].includes(role),
    );

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        formState: { errors, isSubmitting },
        setError,
    } = useForm<RelationshipForm>({
        resolver: zodResolver(relationshipSchema),
        defaultValues: { relationshipType: "", relatedMemberId: "", notes: "" },
    });

    async function load() {
        try {
            const [relResponse, membersResponse] = await Promise.all([
                apiRequest<{ ok: true; relationships: Relationship[]; }>(
                    `/api/members/${memberId}/relationships`,
                ),
                apiRequest<{ ok: true; members: { id: string; firstName: string; lastName: string; memberIdentifier: string; }[]; }>(
                    "/api/members",
                ),
            ]);
            setRelationships(relResponse.relationships);
            setMembers(
                membersResponse.members.filter((member) => member.id !== memberId),
            );
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Unable to load relationships",
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberId]);

    async function onSubmit(data: RelationshipForm) {
        try {
            await apiRequest<{ ok: true; relationship: Relationship; }>(
                `/api/members/${memberId}/relationships`,
                {
                    method: "POST",
                    body: JSON.stringify(data),
                },
            );
            toast.success("Relationship added");
            reset();
            await load();
        } catch (err) {
            const message = isApiClientError(err)
                ? err.message
                : err instanceof Error
                    ? err.message
                    : "Add failed";
            setError("root", { message });
            toast.error(message);
        }
    }

    async function remove(relationshipId: string) {
        try {
            await apiRequest<{ ok: true; }>(
                `/api/members/${memberId}/relationships/${relationshipId}`,
                { method: "DELETE" },
            );
            toast.success("Relationship removed");
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
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Extended family relationships</CardTitle>
                    <CardDescription>
                        Links between members across family records.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : relationships.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No relationships recorded.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {relationships.map((relationship) => (
                                <li
                                    key={relationship.id}
                                    className="flex items-center justify-between py-3"
                                >
                                    <div>
                                        <p className="text-sm font-medium">
                                            {relationship.relationshipType}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {relationship.relatedMember.firstName}{" "}
                                            {relationship.relatedMember.lastName} (
                                            {relationship.relatedMember.memberIdentifier})
                                        </p>
                                        {relationship.notes ? (
                                            <p className="text-xs text-muted-foreground">
                                                {relationship.notes}
                                            </p>
                                        ) : null}
                                    </div>
                                    {canManage ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => remove(relationship.id)}
                                        >
                                            <TrashIcon className="size-4" />
                                        </Button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {canManage ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Add relationship</CardTitle>
                    </CardHeader>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <CardContent className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="relatedMemberId">Related member</Label>
                                <Select
                                    onValueChange={(value) =>
                                        setValue("relatedMemberId", value, { shouldValidate: true })
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
                                <input type="hidden" {...register("relatedMemberId")} />
                                {errors.relatedMemberId ? (
                                    <p className="text-xs text-destructive">
                                        {errors.relatedMemberId.message}
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="relationshipType">Relationship</Label>
                                <Select
                                    onValueChange={(value) =>
                                        setValue("relationshipType", value, {
                                            shouldValidate: true,
                                        })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {RELATIONSHIP_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {type}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <input type="hidden" {...register("relationshipType")} />
                                {errors.relationshipType ? (
                                    <p className="text-xs text-destructive">
                                        {errors.relationshipType.message}
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Input id="notes" {...register("notes")} />
                            </div>
                            {errors.root ? (
                                <p className="text-xs text-destructive sm:col-span-3">
                                    {errors.root.message}
                                </p>
                            ) : null}
                        </CardContent>
                        <CardContent>
                            <Button type="submit" disabled={isSubmitting}>
                                <PlusIcon className="mr-2 size-4" />
                                Add relationship
                            </Button>
                        </CardContent>
                    </form>
                </Card>
            ) : null}
        </div>
    );
}
