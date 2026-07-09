"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const PROGRAM_TYPES = [
  "FAITH_FORMATION",
  "BIBLE_STUDY",
  "YOUTH",
  "CHOIR",
  "OUTREACH",
  "OTHER",
] as const;

export default function NewProgramPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [programType, setProgramType] = useState<string>("OTHER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<{ ok: true; program: { id: string } }>(
        "/api/programs",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            description: description || null,
            programType,
          }),
        },
      );
      toast.success("Program created");
      router.push(`/programs/${res.program.id}`);
    } catch (err) {
      const message = isApiClientError(err)
        ? err.message
        : err instanceof Error
          ? err.message
          : "Create failed";
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Add program"
        description="Create a ministry or program for enrollment and attendance."
      />
      <div className="flex-1 p-4 sm:p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Program details</CardTitle>
          </CardHeader>
          <form onSubmit={onSubmit}>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="programType">Type</Label>
                <Select value={programType} onValueChange={setProgramType}>
                  <SelectTrigger id="programType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRAM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="gap-2">
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? "Creating…" : "Create program"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
