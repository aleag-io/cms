"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";

// Members may self-edit contact fields only (email, phone) — the API rejects
// anything else; name/status changes go through parish staff.
const profileSchema = z.object({
    email: z.string().email("Enter a valid email").optional().or(z.literal("")),
    phone: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

type FamilySummary = {
    familyName: string;
    familyNumber: string;
};

type MemberDetail = {
    id: string;
    memberIdentifier: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    status: string;
    family: FamilySummary | null;
};

export default function SelfServicePage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const memberId = claims?.app_metadata.member_id;
    const [member, setMember] = useState<MemberDetail | null>(null);
    const [family, setFamily] = useState<FamilySummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [editing, setEditing] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
        setError: setFormError,
    } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

    async function load() {
        if (!memberId) {
            setError("No member record is linked to your account.");
            setBusy(false);
            return;
        }
        try {
            const response = await apiRequest<{ ok: true; member: MemberDetail; }>(
                `/api/members/${memberId}`,
            );
            setMember(response.member);
            setFamily(response.member.family);
            reset({
                email: response.member.email ?? "",
                phone: response.member.phone ?? "",
            });
        } catch (err) {
            setError(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Unable to load profile",
            );
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (sessionLoading) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberId, sessionLoading]);

    async function onSubmit(data: ProfileForm) {
        if (!memberId) return;
        try {
            const response = await apiRequest<{ ok: true; member: MemberDetail; }>(
                `/api/members/${memberId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        email: data.email || null,
                        phone: data.phone || null,
                    }),
                },
            );
            setMember(response.member);
            setEditing(false);
            toast.success("Profile updated");
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
                <PageHeader title="My profile" description="Loading…" />
                <div className="flex-1 p-4 sm:p-6">
                    <PageSkeleton />
                </div>
            </div>
        );
    }

    if (error || !member) {
        return (
            <div className="flex min-h-full flex-col">
                <PageHeader title="My profile" description="Error" />
                <div className="flex-1 p-4 sm:p-6">
                    <ErrorState title="Load failed" description={error ?? "Not found"} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="My profile"
                description={`${member.memberIdentifier} · ${member.status}`}
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing((current) => !current)}
                    >
                        <PencilSimpleIcon className="mr-2 size-4" />
                        {editing ? "Cancel" : "Edit"}
                    </Button>
                }
            />

            <div className="flex-1 space-y-6 p-4 sm:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>My information</CardTitle>
                        <CardDescription>
                            You can update your own contact details. Other changes must be
                            requested through parish staff.
                        </CardDescription>
                    </CardHeader>
                    {editing ? (
                        <form onSubmit={handleSubmit(onSubmit)}>
                            <CardContent className="grid gap-4 sm:grid-cols-2">
                                <ReadOnlyField label="First name" value={member.firstName} />
                                <ReadOnlyField label="Last name" value={member.lastName} />
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" {...register("email")} />
                                    {errors.email ? (
                                        <p className="text-xs text-destructive">
                                            {errors.email.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input id="phone" {...register("phone")} />
                                </div>
                                {errors.root ? (
                                    <p className="text-xs text-destructive sm:col-span-2">
                                        {errors.root.message}
                                    </p>
                                ) : null}
                            </CardContent>
                            <CardContent>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Saving…" : "Save changes"}
                                </Button>
                            </CardContent>
                        </form>
                    ) : (
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <ReadOnlyField label="First name" value={member.firstName} />
                            <ReadOnlyField label="Last name" value={member.lastName} />
                            <ReadOnlyField label="Email" value={member.email ?? "—"} />
                            <ReadOnlyField label="Phone" value={member.phone ?? "—"} />
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
                        </CardContent>
                    )}
                </Card>

                {family ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>My family</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <ReadOnlyField label="Family name" value={family.familyName} />
                            <ReadOnlyField label="Family number" value={family.familyNumber} />
                        </CardContent>
                    </Card>
                ) : null}

                <CommunicationPreferencesCard />

                <MyGivingCard />
            </div>
        </div>
    );
}

type MyStatement = {
    id: string;
    periodKey: string;
    status: string;
    totalCents: string;
};

function MyGivingCard() {
    const [statements, setStatements] = useState<MyStatement[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let active = true;
        apiRequest<{ ok: true; statements: MyStatement[] }>(
            "/api/finance/giving-statements?mine=1",
        )
            .then((res) => {
                if (active) setStatements(res.statements);
            })
            .catch(() => {
                /* member may have no statements yet */
            })
            .finally(() => {
                if (active) setLoaded(true);
            });
        return () => {
            active = false;
        };
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>My Giving</CardTitle>
                <CardDescription>
                    Your annual contribution statements. Only gifts attributed to you
                    appear here — never another family member&apos;s.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {!loaded ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : statements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No statements are available yet.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {statements.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center justify-between py-2 text-sm"
                            >
                                <span>Tax year {s.periodKey}</span>
                                <a
                                    className="text-primary underline"
                                    href={`/api/finance/giving-statements/${s.id}/pdf`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Download PDF
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}

type CommPreference = {
    channel: "EMAIL" | "SMS";
    optedOut: boolean;
};

const CHANNEL_LABELS: Record<CommPreference["channel"], string> = {
    EMAIL: "Email messages",
    SMS: "Text messages (SMS)",
};

function CommunicationPreferencesCard() {
    const [preferences, setPreferences] = useState<CommPreference[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        apiRequest<{ ok: true; preferences: CommPreference[]; }>(
            "/api/self-service/communication-preferences",
        )
            .then((response) => {
                if (!cancelled) setPreferences(response.preferences);
            })
            .catch(() => {
                // No linked member record — hide the card silently.
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    async function toggle(channel: CommPreference["channel"], optedOut: boolean) {
        setSaving(channel);
        const previous = preferences;
        setPreferences((current) =>
            current.map((pref) =>
                pref.channel === channel ? { ...pref, optedOut } : pref,
            ),
        );
        try {
            await apiRequest<{ ok: true; }>(
                "/api/self-service/communication-preferences",
                {
                    method: "PUT",
                    body: JSON.stringify({ preferences: [{ channel, optedOut }] }),
                },
            );
            toast.success(
                optedOut
                    ? `Opted out of ${CHANNEL_LABELS[channel].toLowerCase()}`
                    : `Opted in to ${CHANNEL_LABELS[channel].toLowerCase()}`,
            );
        } catch (err) {
            setPreferences(previous);
            toast.error(
                isApiClientError(err) ? err.message : "Could not save preference",
            );
        } finally {
            setSaving(null);
        }
    }

    if (loading || preferences.length === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Communication preferences</CardTitle>
                <CardDescription>
                    Choose how your parish may contact you. Opting out stops future
                    messages on that channel.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {preferences.map((pref) => (
                    <div
                        key={pref.channel}
                        className="flex items-center justify-between gap-4"
                    >
                        <Label htmlFor={`comm-pref-${pref.channel}`}>
                            {CHANNEL_LABELS[pref.channel]}
                        </Label>
                        <Switch
                            id={`comm-pref-${pref.channel}`}
                            checked={!pref.optedOut}
                            disabled={saving === pref.channel}
                            onCheckedChange={(checked) =>
                                void toggle(pref.channel, !checked)
                            }
                        />
                    </div>
                ))}
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
