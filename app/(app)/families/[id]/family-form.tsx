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

const familySchema = z.object({
    familyName: z.string().min(1, "Family name is required"),
    primaryContactEmail: z.string().email().optional().or(z.literal("")),
    primaryContactPhone: z.string().optional(),
    address: z.string().optional(),
});

type FamilyFormData = z.infer<typeof familySchema>;

type FamilyDetail = {
    id: string;
    familyName: string;
    familyNumber: string;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;
    address: string | null;
};

export function FamilyForm({
    family,
    onSaved,
}: {
    family: FamilyDetail;
    onSaved: (family: FamilyDetail) => void;
}) {
    const [saving, setSaving] = useState(false);
    const {
        register,
        handleSubmit,
        formState: { errors },
        setError,
    } = useForm<FamilyFormData>({
        resolver: zodResolver(familySchema),
        defaultValues: {
            familyName: family.familyName,
            primaryContactEmail: family.primaryContactEmail ?? "",
            primaryContactPhone: family.primaryContactPhone ?? "",
            address: family.address ?? "",
        },
    });

    async function onSubmit(data: FamilyFormData) {
        setSaving(true);
        try {
            const response = await apiRequest<{ ok: true; family: FamilyDetail; }>(
                `/api/families/${family.id}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        ...data,
                        primaryContactEmail: data.primaryContactEmail || null,
                        primaryContactPhone: data.primaryContactPhone || null,
                        address: data.address || null,
                    }),
                },
            );
            toast.success("Family updated");
            onSaved(response.family);
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
                        <Label htmlFor="familyName">Family name</Label>
                        <Input id="familyName" {...register("familyName")} />
                        {errors.familyName ? (
                            <p className="text-xs text-destructive">
                                {errors.familyName.message}
                            </p>
                        ) : null}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="primaryContactEmail">Email</Label>
                        <Input
                            id="primaryContactEmail"
                            type="email"
                            {...register("primaryContactEmail")}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="primaryContactPhone">Phone</Label>
                        <Input
                            id="primaryContactPhone"
                            {...register("primaryContactPhone")}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="address">Address</Label>
                        <Input id="address" {...register("address")} />
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
