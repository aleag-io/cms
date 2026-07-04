"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/patterns/page-header";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { toast } from "sonner";

const newMemberSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    familyId: z.string().optional(),
    workNotes: z.string().optional(),
});

type NewMemberForm = z.infer<typeof newMemberSchema>;

type FamilyOption = {
    id: string;
    familyName: string;
    familyNumber: string;
};

export default function NewMemberPage() {
    const router = useRouter();
    const [families, setFamilies] = useState<FamilyOption[]>([]);
    const [loadingFamilies, setLoadingFamilies] = useState(true);
    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting },
        setError,
    } = useForm<NewMemberForm>({
        resolver: zodResolver(newMemberSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            familyId: "",
            workNotes: "",
        },
    });

    useEffect(() => {
        apiRequest<{ ok: true; families: FamilyOption[]; }>("/api/families")
            .then((response) => setFamilies(response.families))
            .catch(() => toast.error("Unable to load families"))
            .finally(() => setLoadingFamilies(false));
    }, []);

    async function onSubmit(data: NewMemberForm) {
        try {
            const response = await apiRequest<{
                ok: true;
                member: { id: string; };
            }>("/api/members", {
                method: "POST",
                body: JSON.stringify({
                    ...data,
                    email: data.email || null,
                    phone: data.phone || null,
                    workNotes: data.workNotes || null,
                    familyId: data.familyId || undefined,
                }),
            });
            toast.success("Member created");
            router.push(`/members/${response.member.id}`);
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
                title="Add member"
                description="Create a new member record in the current parish."
            />
            <div className="flex-1 p-4 sm:p-6">
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle>Member details</CardTitle>
                    </CardHeader>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
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
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" {...register("email")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input id="phone" {...register("phone")} />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="familyId">Family</Label>
                                <Select
                                    disabled={loadingFamilies}
                                    onValueChange={(value) =>
                                        setValue("familyId", value === "none" ? "" : value)
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a family (optional)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No family</SelectItem>
                                        {families.map((family) => (
                                            <SelectItem key={family.id} value={family.id}>
                                                {family.familyName} ({family.familyNumber})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="workNotes">Work notes</Label>
                                <Input id="workNotes" {...register("workNotes")} />
                            </div>
                            {errors.root ? (
                                <p className="text-xs text-destructive sm:col-span-2">
                                    {errors.root.message}
                                </p>
                            ) : null}
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "Creating…" : "Create member"}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
