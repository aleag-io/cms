"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";

const noteSchema = z.object({
    note: z.string().min(1, "Note is required"),
});

type NoteForm = z.infer<typeof noteSchema>;

export function MemberPrivateNoteForm({
    memberId,
    initial,
}: {
    memberId: string;
    initial: string;
}) {
    const [saving, setSaving] = useState(false);
    const {
        register,
        handleSubmit,
        formState: { errors },
        setError,
    } = useForm<NoteForm>({
        resolver: zodResolver(noteSchema),
        defaultValues: { note: initial },
    });

    async function onSubmit(data: NoteForm) {
        setSaving(true);
        try {
            await apiRequest<{ ok: true; privateNote: string; }>(
                `/api/members/${memberId}/private-note`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ note: data.note }),
                },
            );
            toast.success("Private note saved");
        } catch (err) {
            const message = isApiClientError(err)
                ? err.message
                : err instanceof Error
                    ? err.message
                    : "Save failed";
            setError("root", { message });
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Clergy private note</CardTitle>
                <CardDescription>
                    Visible only to clergy. Every read and write is audited.
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="privateNote">Note</Label>
                        <Textarea
                            id="privateNote"
                            rows={6}
                            {...register("note")}
                            placeholder="Enter pastoral observations…"
                        />
                        {errors.note ? (
                            <p className="text-xs text-destructive">
                                {errors.note.message}
                            </p>
                        ) : null}
                    </div>
                    {errors.root ? (
                        <p className="text-xs text-destructive">{errors.root.message}</p>
                    ) : null}
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={saving}>
                        {saving ? "Saving…" : "Save private note"}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
