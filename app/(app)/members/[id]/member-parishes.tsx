"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";

type Membership = {
    id: string;
    parishId: string;
    isPrimary: boolean;
    membershipType: string;
    parish: { name: string; };
};

export function MemberParishes({ memberId }: { memberId: string; }) {
    const { claims } = useSession();
    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [loading, setLoading] = useState(true);
    const canSetPrimary = (claims?.app_metadata.roles ?? []).includes(
        "parish_admin",
    );

    async function load() {
        try {
            const response = await apiRequest<{ ok: true; memberships: Membership[]; }>(
                `/api/members/${memberId}/parishes`,
            );
            setMemberships(response.memberships);
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Unable to load memberships",
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

    async function setPrimary(parishId: string) {
        try {
            await apiRequest<{ ok: true; }>(`/api/members/${memberId}/parishes`, {
                method: "PATCH",
                body: JSON.stringify({ primaryParishId: parishId }),
            });
            toast.success("Primary parish updated");
            await load();
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Update failed",
            );
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Parish memberships</CardTitle>
                <CardDescription>
                    Multi-parish membership and primary parish assignment.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : memberships.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No parish memberships recorded.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {memberships.map((membership) => (
                            <li
                                key={membership.id}
                                className="flex items-center justify-between py-3"
                            >
                                <div>
                                    <p className="text-sm font-medium">
                                        {membership.parish.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {membership.membershipType}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {membership.isPrimary ? (
                                        <Badge variant="default">Primary</Badge>
                                    ) : canSetPrimary ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPrimary(membership.parishId)}
                                        >
                                            <CheckIcon className="mr-1 size-3" />
                                            Set primary
                                        </Button>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
