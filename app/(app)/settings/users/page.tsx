"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusIcon } from "@phosphor-icons/react";
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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";

const userSchema = z.object({
    email: z.string().email("Valid email is required"),
    displayName: z.string().min(1, "Display name is required"),
    role: z.string().min(1, "Select a role"),
});

type UserForm = z.infer<typeof userSchema>;

type UserRecord = {
    id: string;
    email: string;
    displayName: string;
    role: string;
    isActive: boolean;
};

const PARISH_ROLES = [
    { value: "PARISH_STAFF", label: "Parish Staff" },
    { value: "PARISH_DATA_SHARING_MANAGER", label: "Data Sharing Manager" },
    { value: "MINISTRY_LEADER", label: "Ministry Leader" },
    { value: "ORGANIZATION_LEADER", label: "Organization Leader" },
    { value: "PASTORAL_DATA_ACCESSOR", label: "Pastoral Data Accessor" },
    { value: "MEMBER", label: "Member" },
];

export default function ParishUsersPage() {
    const { claims, isLoading: sessionLoading } = useSession();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const canManage =
        claims?.app_metadata.roles.includes("parish_admin") ?? false;

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        formState: { errors, isSubmitting },
        setError,
    } = useForm<UserForm>({
        resolver: zodResolver(userSchema),
        defaultValues: { email: "", displayName: "", role: "" },
    });

    async function load() {
        try {
            const response = await apiRequest<{ ok: true; users: UserRecord[]; }>(
                "/api/parish/users",
            );
            setUsers(response.users);
        } catch (err) {
            toast.error(
                isApiClientError(err)
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Unable to load users",
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (sessionLoading) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [sessionLoading]);

    async function onSubmit(data: UserForm) {
        try {
            await apiRequest<{ ok: true; user: UserRecord; }>("/api/parish/users", {
                method: "POST",
                body: JSON.stringify(data),
            });
            toast.success("User assigned");
            reset();
            await load();
        } catch (err) {
            const message = isApiClientError(err)
                ? err.message
                : err instanceof Error
                    ? err.message
                    : "Assignment failed";
            setError("root", { message });
            toast.error(message);
        }
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="Parish users"
                description="Assign supplementary parish roles."
            />
            <div className="flex-1 space-y-6 p-4 sm:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Current users</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <p className="text-sm text-muted-foreground">Loading…</p>
                        ) : users.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No parish users assigned yet.
                            </p>
                        ) : (
                            <ul className="divide-y">
                                {users.map((user) => (
                                    <li
                                        key={user.id}
                                        className="flex items-center justify-between py-3"
                                    >
                                        <div>
                                            <p className="text-sm font-medium">{user.displayName}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {user.email}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge variant="outline">{user.role}</Badge>
                                            <Badge
                                                variant={user.isActive ? "default" : "secondary"}
                                            >
                                                {user.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                {canManage ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Assign user</CardTitle>
                            <CardDescription>
                                Create a user account with a supplementary parish role.
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleSubmit(onSubmit)}>
                            <CardContent className="grid gap-4 sm:grid-cols-3">
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
                                    <Label htmlFor="displayName">Display name</Label>
                                    <Input id="displayName" {...register("displayName")} />
                                    {errors.displayName ? (
                                        <p className="text-xs text-destructive">
                                            {errors.displayName.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="role">Role</Label>
                                    <Select
                                        onValueChange={(value) =>
                                            setValue("role", value, { shouldValidate: true })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PARISH_ROLES.map((role) => (
                                                <SelectItem key={role.value} value={role.value}>
                                                    {role.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <input type="hidden" {...register("role")} />
                                    {errors.role ? (
                                        <p className="text-xs text-destructive">
                                            {errors.role.message}
                                        </p>
                                    ) : null}
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
                                    Assign user
                                </Button>
                            </CardContent>
                        </form>
                    </Card>
                ) : null}
            </div>
        </div>
    );
}
