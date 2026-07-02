"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-client";

type DioceseRecord = {
    id: string;
    name: string;
    createdAt: string | Date;
};

export function DioceseSettingsManager({
    initialDiocese,
    stats,
    canEdit,
}: {
    initialDiocese: DioceseRecord;
    stats: { parishes: number; activeParishes: number; };
    canEdit: boolean;
}) {
    const [diocese, setDiocese] = useState(initialDiocese);
    const [name, setName] = useState(initialDiocese.name);
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            const response = await apiRequest<{ ok: true; diocese: DioceseRecord; }>(
                `/api/dioceses/${diocese.id}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ name }),
                },
            );
            setDiocese(response.diocese);
            setName(response.diocese.name);
            toast.success("Diocese settings updated");
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Unable to update diocese",
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <Card>
                <CardHeader>
                    <CardTitle>Diocese Profile</CardTitle>
                    <CardDescription>
                        Structural settings only. Diocese reporting and parish access remain
                        governed by separate RLS and sharing rules.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="diocese-name">Diocese name</Label>
                        <Input
                            id="diocese-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            disabled={!canEdit || saving}
                        />
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                        <p>Diocese ID: {diocese.id}</p>
                        <p>
                            Provisioned on {new Date(diocese.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                    {canEdit ? (
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                disabled={saving || !name.trim() || name.trim() === diocese.name}
                                onClick={save}
                            >
                                {saving ? "Saving…" : "Save settings"}
                            </Button>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Diocese Staff have read-only access to this surface.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Footprint</CardTitle>
                    <CardDescription>Structural diocese scope.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <p className="text-2xl font-semibold">{stats.parishes}</p>
                        <p className="text-xs text-muted-foreground">Parishes in diocese</p>
                    </div>
                    <div>
                        <p className="text-2xl font-semibold">{stats.activeParishes}</p>
                        <p className="text-xs text-muted-foreground">Active parishes</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}