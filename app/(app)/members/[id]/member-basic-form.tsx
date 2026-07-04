"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";

const basicSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    workNotes: z.string().optional(),
});

type BasicForm = z.infer<typeof basicSchema>;

type MemberDetail = {
    id: string;
    memberIdentifier: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    status: string;
    family: { familyName: string; familyNumber: string; } | null;
    workNotes?: string | null;
};

export function MemberBasicForm({
    member,
    onSaved,
}: {
    member: MemberDetail;
    onSaved: (member: MemberDetail) => void;
}) {
    const [saving, setSaving] = useState(false);
    const {
        register,
        handleSubmit,
        formState: { errors },
        setError,
    } = useForm<BasicForm>({
        resolver: zodResolver(basicSchema),
        defaultValues: {
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email ?? "",
            phone: member.phone ?? "",
            workNotes: member.workNotes ?? "",
        },
    });

    async function onSubmit(data: BasicForm) {
        setSaving(true);
        try {
            const response = await apiRequest<{ ok: true; member: MemberDetail; }>(
                `/api/members/${member.id}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        ...data,
                        email: data.email || null,
                        workNotes: data.workNotes || null,
                    }),
                },
            );
            toast.success("Member updated");
            onSaved(response.member);
        } catch (err) {
            const message = isApiClientError(err)
                ? err.message
                : err instanceof Error
                    ? err.message
                    : "Update failed";
            setError("root", { message });
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <form onSubmit={handleSubmit(onSubmit)}>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="firstName">First name</Label>
                        <Input id="firstName" {...register("firstName")} />
                        {errors.firstName ? (
                            <p className="text-xs text-destructive">
                                {errors.firstName.message}
                            </p>
                        ) : null}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="lastName">Last name</Label>
                        <Input id="lastName" {...register("lastName")} />
                        {errors.lastName ? (
                            <p className="text-xs text-destructive">
                                {errors.lastName.message}
                            </p>
                        ) : null}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" {...register("email")} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input id="phone" {...register("phone")} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="workNotes">Work notes</Label>
                        <Input id="workNotes" {...register("workNotes")} />
                    </div>
                    {errors.root ? (
                        <p className="text-xs text-destructive sm:col-span-2">
                            {errors.root.message}
                        </p>
                    ) : null}
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={saving}>
                        {saving ? "Saving…" : "Save changes"}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
