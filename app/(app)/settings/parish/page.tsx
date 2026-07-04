"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";

const parishSchema = z.object({
    name: z.string().min(1, "Parish name is required"),
    address: z.string().optional(),
    familyNumberPrefix: z.string().min(1, "Prefix is required"),
    familyNumberWidth: z.coerce.number().min(1).max(10),
    familyNumberStart: z.coerce.number().min(0),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _parishSchema = parishSchema;

type ParishForm = z.infer<typeof parishSchema>;

type ParishDetail = {
    id: string;
    name: string;
    address: string | null;
    familyNumberPrefix: string;
    familyNumberWidth: number;
    familyNumberStart: number;
};

async function fetchParish(id: string): Promise<ParishDetail> {
    const response = await apiRequest<{ ok: true; parish: ParishDetail; }>(
        `/api/parishes/${id}`,
    );
    return response.parish;
}

export default function ParishSettingsPage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const parishId = claims?.app_metadata.parish_id;
    const [parish, setParish] = useState<ParishDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);

    const canManage =
        claims?.app_metadata.roles.some((role) =>
            ["parish_admin"].includes(role),
        ) ?? false;

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
        setError: setFormError,
    } = useForm<ParishForm>();

    useEffect(() => {
        if (sessionLoading) return;
        if (!parishId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setError("No parish context");
            setBusy(false);
            return;
        }
        fetchParish(parishId)
            .then((data) => {
                setParish(data);
                reset({
                    name: data.name,
                    address: data.address ?? "",
                    familyNumberPrefix: data.familyNumberPrefix,
                    familyNumberWidth: data.familyNumberWidth,
                    familyNumberStart: data.familyNumberStart,
                });
                setBusy(false);
            })
            .catch((err: unknown) => {
                setError(
                    isApiClientError(err)
                        ? err.message
                        : err instanceof Error
                            ? err.message
                            : "Unable to load parish",
                );
                setBusy(false);
            });
    }, [parishId, sessionLoading, reset]);

    async function onSubmit(data: ParishForm) {
        if (!parishId) return;
        try {
            const response = await apiRequest<{ ok: true; parish: ParishDetail; }>(
                `/api/parishes/${parishId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        name: data.name,
                        address: data.address || null,
                        familyNumberPrefix: data.familyNumberPrefix,
                        familyNumberWidth: data.familyNumberWidth,
                        familyNumberStart: data.familyNumberStart,
                    }),
                },
            );
            setParish(response.parish);
            toast.success("Parish settings updated");
        } catch (err) {
            const message = isApiClientError(err)
                ? err.message
                : err instanceof Error
                    ? err.message
                    : "Update failed";
            setFormError("root", { message });
            toast.error(message);
        }
    }

    if (sessionLoading || busy) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Parish settings" description="Loading…" />
                <div className="flex-1 p-4 sm:p-6">
                    <PageSkeleton />
                </div>
            </div>
        );
    }

    if (error || !parish) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="Parish settings" description="Error" />
                <div className="flex-1 p-4 sm:p-6">
                    <ErrorState title="Load failed" description={error ?? "Not found"} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="Parish settings"
                description="Profile and member identifier scheme."
            />
            <div className="flex-1 p-4 sm:p-6">
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle>Parish profile</CardTitle>
                        <CardDescription>
                            Changes to the identifier scheme apply to future families only.
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">Parish name</Label>
                                <Input
                                    id="name"
                                    {...register("name")}
                                    disabled={!canManage}
                                />
                                {errors.name ? (
                                    <p className="text-xs text-destructive">
                                        {errors.name.message}
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">Address</Label>
                                <Input
                                    id="address"
                                    {...register("address")}
                                    disabled={!canManage}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="familyNumberPrefix">Family ID prefix</Label>
                                <Input
                                    id="familyNumberPrefix"
                                    {...register("familyNumberPrefix")}
                                    disabled={!canManage}
                                />
                                {errors.familyNumberPrefix ? (
                                    <p className="text-xs text-destructive">
                                        {errors.familyNumberPrefix.message}
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="familyNumberWidth">Number width</Label>
                                <Input
                                    id="familyNumberWidth"
                                    type="number"
                                    {...register("familyNumberWidth")}
                                    disabled={!canManage}
                                />
                                {errors.familyNumberWidth ? (
                                    <p className="text-xs text-destructive">
                                        {errors.familyNumberWidth.message}
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="familyNumberStart">Start at</Label>
                                <Input
                                    id="familyNumberStart"
                                    type="number"
                                    {...register("familyNumberStart")}
                                    disabled={!canManage}
                                />
                                {errors.familyNumberStart ? (
                                    <p className="text-xs text-destructive">
                                        {errors.familyNumberStart.message}
                                    </p>
                                ) : null}
                            </div>
                            {errors.root ? (
                                <p className="text-xs text-destructive sm:col-span-2">
                                    {errors.root.message}
                                </p>
                            ) : null}
                        </CardContent>
                        {canManage ? (
                            <CardFooter>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Saving…" : "Save settings"}
                                </Button>
                            </CardFooter>
                        ) : null}
                    </form>
                </Card>
            </div>
        </div>
    );
}
