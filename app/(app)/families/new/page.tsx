"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/patterns/page-header";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";

const newFamilySchema = z.object({
    familyName: z.string().min(1, "Family name is required"),
    familyNumber: z.string().optional(),
    primaryContactEmail: z.string().email().optional().or(z.literal("")),
    primaryContactPhone: z.string().optional(),
    address: z.string().optional(),
});

type NewFamilyForm = z.infer<typeof newFamilySchema>;

export default function NewFamilyPage() {
    const router = useRouter();
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        setError,
    } = useForm<NewFamilyForm>({
        resolver: zodResolver(newFamilySchema),
        defaultValues: {
            familyName: "",
            familyNumber: "",
            primaryContactEmail: "",
            primaryContactPhone: "",
            address: "",
        },
    });

    async function onSubmit(data: NewFamilyForm) {
        try {
            const response = await apiRequest<{
                ok: true;
                family: { id: string; };
            }>("/api/families", {
                method: "POST",
                body: JSON.stringify({
                    ...data,
                    familyNumber: data.familyNumber || undefined,
                    primaryContactEmail: data.primaryContactEmail || null,
                    primaryContactPhone: data.primaryContactPhone || null,
                    address: data.address || null,
                }),
            });
            toast.success("Family created");
            router.push(`/families/${response.family.id}`);
        } catch (err) {
            const message = isApiClientError(err)
                ? err.message
                : err instanceof Error
                    ? err.message
                    : "Create failed";
            setError("root", { message });
            toast.error(message);
        }
    }

    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="Add family"
                description="Create a new family record in the current parish."
            />
            <div className="flex-1 p-4 sm:p-6">
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle>Family details</CardTitle>
                    </CardHeader>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="familyName">Family name</Label>
                                <Input id="familyName" {...register("familyName")} />
                                {errors.familyName ? (
                                    <p className="text-xs text-destructive">
                                        {errors.familyName.message}
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="familyNumber">
                                    Family number{" "}
                                    <span className="text-muted-foreground">(optional)</span>
                                </Label>
                                <Input
                                    id="familyNumber"
                                    {...register("familyNumber")}
                                    placeholder="Auto-generated from parish scheme"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="primaryContactEmail">Email</Label>
                                <Input
                                    id="primaryContactEmail"
                                    type="email"
                                    {...register("primaryContactEmail")}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="primaryContactPhone">Phone</Label>
                                <Input
                                    id="primaryContactPhone"
                                    {...register("primaryContactPhone")}
                                />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="address">Address</Label>
                                <Input id="address" {...register("address")} />
                            </div>
                            {errors.root ? (
                                <p className="text-xs text-destructive sm:col-span-2">
                                    {errors.root.message}
                                </p>
                            ) : null}
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "Creating…" : "Create family"}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
