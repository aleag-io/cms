"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";

const pastoralSchema = z.object({
    dateOfBirth: z.string().optional().or(z.literal("")),
    baptismDate: z.string().optional().or(z.literal("")),
    chrismationDate: z.string().optional().or(z.literal("")),
});

type PastoralForm = z.infer<typeof pastoralSchema>;

type PastoralData = {
    dateOfBirth: string | null;
    baptismDate: string | null;
    chrismationDate: string | null;
};

export function MemberPastoralForm({
    memberId,
    initial,
    canEdit,
}: {
    memberId: string;
    initial: PastoralData | null;
    canEdit: boolean;
}) {
    const [saving, setSaving] = useState(false);
    const {
        register,
        handleSubmit,
        formState: { errors },
        setError,
    } = useForm<PastoralForm>({
        resolver: zodResolver(pastoralSchema),
        defaultValues: {
            dateOfBirth: initial?.dateOfBirth
                ? format(parseISO(initial.dateOfBirth), "yyyy-MM-dd")
                : "",
            baptismDate: initial?.baptismDate
                ? format(parseISO(initial.baptismDate), "yyyy-MM-dd")
                : "",
            chrismationDate: initial?.chrismationDate
                ? format(parseISO(initial.chrismationDate), "yyyy-MM-dd")
                : "",
        },
    });

    async function onSubmit(data: PastoralForm) {
        setSaving(true);
        try {
            await apiRequest<{ ok: true; pastoralData: PastoralData; }>(
                `/api/members/${memberId}/pastoral-data`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        dateOfBirth: data.dateOfBirth || null,
                        baptismDate: data.baptismDate || null,
                        chrismationDate: data.chrismationDate || null,
                    }),
                },
            );
            toast.success("Pastoral data updated");
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
            <CardHeader>
                <CardTitle>Pastoral dates</CardTitle>
                <CardDescription>
                    Sacramental and biographical dates. Visible only to clergy and
                    pastoral administrators.
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="dateOfBirth">Date of birth</Label>
                        <Input
                            id="dateOfBirth"
                            type="date"
                            {...register("dateOfBirth")}
                            disabled={!canEdit}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="baptismDate">Baptism date</Label>
                        <Input
                            id="baptismDate"
                            type="date"
                            {...register("baptismDate")}
                            disabled={!canEdit}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="chrismationDate">Chrismation date</Label>
                        <Input
                            id="chrismationDate"
                            type="date"
                            {...register("chrismationDate")}
                            disabled={!canEdit}
                        />
                    </div>
                    {errors.root ? (
                        <p className="text-xs text-destructive sm:col-span-3">
                            {errors.root.message}
                        </p>
                    ) : null}
                </CardContent>
                {canEdit ? (
                    <CardFooter>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving…" : "Save pastoral data"}
                        </Button>
                    </CardFooter>
                ) : null}
            </form>
        </Card>
    );
}
