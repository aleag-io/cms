"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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

type ParishRecord = {
    id: string;
    name: string;
    address: string | null;
    isActive: boolean;
    familyNumberPrefix: string;
    familyNumberWidth: number;
    familyNumberStart: number;
    createdAt: string | Date;
};

type ParishFormState = {
    parishName: string;
    address: string;
    adminEmail: string;
    adminName: string;
    familyNumberPrefix: string;
    familyNumberWidth: string;
    familyNumberStart: string;
};

const EMPTY_CREATE_FORM: ParishFormState = {
    parishName: "",
    address: "",
    adminEmail: "",
    adminName: "",
    familyNumberPrefix: "",
    familyNumberWidth: "4",
    familyNumberStart: "1",
};

function editStateFromParish(parish: ParishRecord): ParishFormState {
    return {
        parishName: parish.name,
        address: parish.address ?? "",
        adminEmail: "",
        adminName: "",
        familyNumberPrefix: parish.familyNumberPrefix,
        familyNumberWidth: String(parish.familyNumberWidth),
        familyNumberStart: String(parish.familyNumberStart),
    };
}

export function ParishManager({
    initialParishes,
    canManage,
}: {
    initialParishes: ParishRecord[];
    canManage: boolean;
}) {
    const [parishes, setParishes] = useState(initialParishes);
    const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<ParishFormState | null>(null);
    const [saving, setSaving] = useState(false);

    function updateCreateForm(field: keyof ParishFormState, value: string) {
        setCreateForm((current) => ({ ...current, [field]: value }));
    }

    function updateEditForm(field: keyof ParishFormState, value: string) {
        setEditForm((current) => (current ? { ...current, [field]: value } : current));
    }

    async function createParish() {
        setSaving(true);
        try {
            const response = await apiRequest<{ ok: true; parish: ParishRecord; }>(
                "/api/parishes",
                {
                    method: "POST",
                    body: JSON.stringify({
                        parishName: createForm.parishName,
                        address: createForm.address || null,
                        adminEmail: createForm.adminEmail,
                        adminName: createForm.adminName,
                        familyNumberPrefix: createForm.familyNumberPrefix,
                        familyNumberWidth: Number(createForm.familyNumberWidth),
                        familyNumberStart: Number(createForm.familyNumberStart),
                    }),
                },
            );
            setParishes((current) =>
                [...current, response.parish].sort((left, right) =>
                    left.name.localeCompare(right.name),
                ),
            );
            setCreateForm(EMPTY_CREATE_FORM);
            toast.success("Parish created");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to create parish");
        } finally {
            setSaving(false);
        }
    }

    async function saveParish(id: string) {
        if (!editForm) return;
        setSaving(true);
        try {
            const response = await apiRequest<{ ok: true; parish: ParishRecord; }>(
                `/api/parishes/${id}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        name: editForm.parishName,
                        address: editForm.address || null,
                        familyNumberPrefix: editForm.familyNumberPrefix,
                        familyNumberWidth: Number(editForm.familyNumberWidth),
                        familyNumberStart: Number(editForm.familyNumberStart),
                    }),
                },
            );
            setParishes((current) =>
                current
                    .map((parish) => (parish.id === id ? response.parish : parish))
                    .sort((left, right) => left.name.localeCompare(right.name)),
            );
            setEditingId(null);
            setEditForm(null);
            toast.success("Parish updated");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update parish");
        } finally {
            setSaving(false);
        }
    }

    async function deactivateParish(id: string) {
        setSaving(true);
        try {
            const response = await apiRequest<{ ok: true; parish: ParishRecord; }>(
                `/api/parishes/${id}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ isActive: false }),
                },
            );
            setParishes((current) =>
                current.map((parish) => (parish.id === id ? response.parish : parish)),
            );
            toast.success("Parish deactivated");
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Unable to deactivate parish",
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            {canManage ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Create Parish</CardTitle>
                        <CardDescription>
                            Provision a parish and its initial Parish Admin in one audited step.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <Field label="Parish name">
                            <Input
                                value={createForm.parishName}
                                onChange={(event) =>
                                    updateCreateForm("parishName", event.target.value)
                                }
                            />
                        </Field>
                        <Field label="Address">
                            <Input
                                value={createForm.address}
                                onChange={(event) => updateCreateForm("address", event.target.value)}
                            />
                        </Field>
                        <Field label="Initial admin email">
                            <Input
                                type="email"
                                value={createForm.adminEmail}
                                onChange={(event) =>
                                    updateCreateForm("adminEmail", event.target.value)
                                }
                            />
                        </Field>
                        <Field label="Initial admin name">
                            <Input
                                value={createForm.adminName}
                                onChange={(event) => updateCreateForm("adminName", event.target.value)}
                            />
                        </Field>
                        <Field label="Family number prefix">
                            <Input
                                value={createForm.familyNumberPrefix}
                                onChange={(event) =>
                                    updateCreateForm("familyNumberPrefix", event.target.value)
                                }
                            />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Family number width">
                                <Input
                                    type="number"
                                    min={1}
                                    value={createForm.familyNumberWidth}
                                    onChange={(event) =>
                                        updateCreateForm("familyNumberWidth", event.target.value)
                                    }
                                />
                            </Field>
                            <Field label="Family number start">
                                <Input
                                    type="number"
                                    min={1}
                                    value={createForm.familyNumberStart}
                                    onChange={(event) =>
                                        updateCreateForm("familyNumberStart", event.target.value)
                                    }
                                />
                            </Field>
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                            <Button
                                type="button"
                                disabled={
                                    saving ||
                                    !createForm.parishName.trim() ||
                                    !createForm.adminEmail.trim() ||
                                    !createForm.adminName.trim()
                                }
                                onClick={createParish}
                            >
                                {saving ? "Creating…" : "Create parish"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
                {parishes.map((parish) => {
                    const isEditing = editingId === parish.id && editForm;
                    return (
                        <Card key={parish.id}>
                            <CardHeader>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <CardTitle>{parish.name}</CardTitle>
                                        <CardDescription>{parish.address ?? "No address on file"}</CardDescription>
                                    </div>
                                    <Badge variant={parish.isActive ? "secondary" : "outline"}>
                                        {parish.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isEditing ? (
                                    <div className="grid gap-4">
                                        <Field label="Parish name">
                                            <Input
                                                value={editForm.parishName}
                                                onChange={(event) =>
                                                    updateEditForm("parishName", event.target.value)
                                                }
                                            />
                                        </Field>
                                        <Field label="Address">
                                            <Input
                                                value={editForm.address}
                                                onChange={(event) => updateEditForm("address", event.target.value)}
                                            />
                                        </Field>
                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <Field label="Prefix">
                                                <Input
                                                    value={editForm.familyNumberPrefix}
                                                    onChange={(event) =>
                                                        updateEditForm("familyNumberPrefix", event.target.value)
                                                    }
                                                />
                                            </Field>
                                            <Field label="Width">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={editForm.familyNumberWidth}
                                                    onChange={(event) =>
                                                        updateEditForm("familyNumberWidth", event.target.value)
                                                    }
                                                />
                                            </Field>
                                            <Field label="Start">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={editForm.familyNumberStart}
                                                    onChange={(event) =>
                                                        updateEditForm("familyNumberStart", event.target.value)
                                                    }
                                                />
                                            </Field>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditingId(null);
                                                    setEditForm(null);
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                            <Button type="button" disabled={saving} onClick={() => saveParish(parish.id)}>
                                                Save
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-1 text-xs text-muted-foreground">
                                            <p>Identifier: {parish.id}</p>
                                            <p>
                                                Family numbering: {parish.familyNumberPrefix}
                                                {"{"}n:{parish.familyNumberWidth}{"}"} starting at {parish.familyNumberStart}
                                            </p>
                                            <p>
                                                Created {new Date(parish.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                        {canManage ? (
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setEditingId(parish.id);
                                                        setEditForm(editStateFromParish(parish));
                                                    }}
                                                >
                                                    Configure
                                                </Button>
                                                {parish.isActive ? (
                                                    <ConfirmDialog
                                                        trigger={
                                                            <Button type="button" variant="destructive">
                                                                Deactivate
                                                            </Button>
                                                        }
                                                        title="Deactivate parish"
                                                        description="This keeps history intact but removes the parish from active operations."
                                                        confirmLabel="Deactivate"
                                                        onConfirm={() => {
                                                            void deactivateParish(parish.id);
                                                        }}
                                                    />
                                                ) : null}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                Diocese Staff may review structural configuration but cannot change it.
                                            </p>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {children}
        </div>
    );
}