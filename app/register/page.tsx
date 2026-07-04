"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BuildingsIcon, CheckCircleIcon } from "@phosphor-icons/react";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";

const registrationSchema = z.object({
    parishId: z.string().min(1, "Select a parish"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    familyName: z.string().optional(),
    notes: z.string().optional(),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

type ParishOption = { id: string; name: string; };

export default function RegisterPage() {
    const router = useRouter();
    const [parishes, setParishes] = useState<ParishOption[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const [loadingParishes, setLoadingParishes] = useState(true);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting },
        setError,
    } = useForm<RegistrationForm>({
        resolver: zodResolver(registrationSchema),
        defaultValues: {
            parishId: "",
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            familyName: "",
            notes: "",
        },
    });

    useEffect(() => {
        apiRequest<{ ok: true; parishes: ParishOption[]; }>("/api/public/parishes")
            .then((response) => setParishes(response.parishes))
            .catch(() => toast.error("Unable to load parishes"))
            .finally(() => setLoadingParishes(false));
    }, []);

    async function onSubmit(data: RegistrationForm) {
        try {
            await apiRequest<{ ok: true; }>("/api/registrations", {
                method: "POST",
                body: JSON.stringify({
                    ...data,
                    email: data.email || null,
                    phone: data.phone || null,
                    familyName: data.familyName || null,
                    notes: data.notes || null,
                }),
            });
            setSubmitted(true);
        } catch (err) {
            const message = isApiClientError(err)
                ? err.message
                : err instanceof Error
                    ? err.message
                    : "Registration failed";
            setError("root", { message });
            toast.error(message);
        }
    }

    if (submitted) {
        return (
            <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                            <CheckCircleIcon className="size-6" />
                        </div>
                        <CardTitle>Registration submitted</CardTitle>
                        <CardDescription>
                            Your request is pending review. You will be contacted once it is
                            approved.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => router.push("/login")}
                        >
                            Back to sign in
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
                            Self-registration
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Register with a parish</CardTitle>
                        <CardDescription>
                            Submit your details for parish staff review. You will not appear
                            in the directory until approved.
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="parishId">Parish</Label>
                                <Select
                                    disabled={loadingParishes}
                                    onValueChange={(value) =>
                                        setValue("parishId", value, { shouldValidate: true })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a parish" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {parishes.map((parish) => (
                                            <SelectItem key={parish.id} value={parish.id}>
                                                {parish.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <input type="hidden" {...register("parishId")} />
                                {errors.parishId ? (
                                    <p className="text-xs text-destructive">
                                        {errors.parishId.message}
                                    </p>
                                ) : null}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="firstName">First name</Label>
                                    <Input id="firstName" {...register("firstName")} />
                                    {errors.firstName ? (
                                        <p className="text-xs text-destructive">
                                            {errors.firstName.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lastName">Last name</Label>
                                    <Input id="lastName" {...register("lastName")} />
                                    {errors.lastName ? (
                                        <p className="text-xs text-destructive">
                                            {errors.lastName.message}
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" {...register("email")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input id="phone" {...register("phone")} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="familyName">Family name</Label>
                                <Input id="familyName" {...register("familyName")} />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Input id="notes" {...register("notes")} />
                            </div>

                            {errors.root ? (
                                <p className="text-xs text-destructive">
                                    {errors.root.message}
                                </p>
                            ) : null}
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? "Submitting…" : "Submit registration"}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </main>
    );
}
