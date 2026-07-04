"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BuildingsIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

const bootstrapSchema = z.object({
    dioceseName: z.string().min(1, "Diocese name is required"),
    parishName: z.string().min(1, "Parish name is required"),
    parishAddress: z.string().optional(),
    adminEmail: z.string().email("Valid email is required"),
    adminName: z.string().min(1, "Admin name is required"),
    adminPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .optional(),
});

type BootstrapForm = z.infer<typeof bootstrapSchema>;

const defaultValues: BootstrapForm = {
    dioceseName: "Diocese of North America",
    parishName: "St. Thomas Mar Thoma Parish",
    parishAddress: "",
    adminEmail: "admin@cms.local",
    adminName: "Diocese Admin",
    adminPassword: "Admin@Local1",
};

export default function BootstrapPage() {
    const router = useRouter();
    const [completed, setCompleted] = useState<{
        email: string;
        password: string;
    } | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        setError,
    } = useForm<BootstrapForm>({
        resolver: zodResolver(bootstrapSchema),
        defaultValues,
    });

    async function onSubmit(data: BootstrapForm) {
        try {
            const response = await apiRequest<{
                ok: true;
                message: string;
                credentials: { email: string; password: string; };
            }>("/api/bootstrap", {
                method: "POST",
                body: JSON.stringify({
                    ...data,
                    adminPassword: data.adminPassword || undefined,
                }),
            });
            setCompleted(response.credentials);
        } catch (err) {
            setError("root", {
                message: err instanceof Error ? err.message : "Bootstrap failed",
            });
        }
    }

    if (completed) {
        return (
            <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                            <CheckCircleIcon className="size-6" />
                        </div>
                        <CardTitle>Bootstrap complete</CardTitle>
                        <CardDescription>
                            Your diocese and first parish are ready. Sign in with the
                            credentials below.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="rounded-md bg-muted p-3 text-sm">
                            <p>
                                <span className="font-medium">Email:</span> {completed.email}
                            </p>
                            <p>
                                <span className="font-medium">Password:</span>{" "}
                                {completed.password}
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={() => router.push("/login")}>
                            Go to sign in
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        );
    }

    return (
        <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
            <div className="w-full max-w-lg space-y-6">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <BuildingsIcon className="size-6" weight="fill" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold">Mar Thoma CMS</h1>
                        <p className="text-sm text-muted-foreground">
                            First-run provisioning wizard
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Provision your tenant</CardTitle>
                        <CardDescription>
                            Create the first diocese, parish, and admin account. This is a
                            one-time setup step.
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="dioceseName">Diocese name</Label>
                                    <Input
                                        id="dioceseName"
                                        {...register("dioceseName")}
                                        aria-invalid={errors.dioceseName ? "true" : "false"}
                                    />
                                    {errors.dioceseName ? (
                                        <p className="text-xs text-destructive">
                                            {errors.dioceseName.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="parishName">Parish name</Label>
                                    <Input
                                        id="parishName"
                                        {...register("parishName")}
                                        aria-invalid={errors.parishName ? "true" : "false"}
                                    />
                                    {errors.parishName ? (
                                        <p className="text-xs text-destructive">
                                            {errors.parishName.message}
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="parishAddress">Parish address</Label>
                                <Input id="parishAddress" {...register("parishAddress")} />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="adminEmail">Admin email</Label>
                                    <Input
                                        id="adminEmail"
                                        type="email"
                                        {...register("adminEmail")}
                                        aria-invalid={errors.adminEmail ? "true" : "false"}
                                    />
                                    {errors.adminEmail ? (
                                        <p className="text-xs text-destructive">
                                            {errors.adminEmail.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="adminName">Admin display name</Label>
                                    <Input
                                        id="adminName"
                                        {...register("adminName")}
                                        aria-invalid={errors.adminName ? "true" : "false"}
                                    />
                                    {errors.adminName ? (
                                        <p className="text-xs text-destructive">
                                            {errors.adminName.message}
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="adminPassword">
                                    Admin password{" "}
                                    <span className="text-muted-foreground">(optional)</span>
                                </Label>
                                <Input
                                    id="adminPassword"
                                    type="password"
                                    {...register("adminPassword")}
                                    aria-invalid={errors.adminPassword ? "true" : "false"}
                                />
                                {errors.adminPassword ? (
                                    <p className="text-xs text-destructive">
                                        {errors.adminPassword.message}
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Leave blank to generate a secure password.
                                    </p>
                                )}
                            </div>

                            {errors.root ? (
                                <Alert variant="destructive">
                                    <AlertDescription>{errors.root.message}</AlertDescription>
                                </Alert>
                            ) : null}
                        </CardContent>
                        <CardFooter className="flex-col gap-3">
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? <Spinner /> : null}
                                Provision tenant
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="w-full"
                                onClick={() => router.push("/login")}
                            >
                                Back to sign in
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </main>
    );
}
