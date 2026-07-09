"use client";

import { useMemo, useState } from "react";
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

const ORG_TYPES = [
  "PRAYER_GROUP",
  "COMMITTEE",
  "AUXILIARY",
  "MINISTRY",
  "OTHER",
] as const;

type OrgType = (typeof ORG_TYPES)[number];
type MembershipModeValue = "OPEN" | "EXCLUSIVE";

const TYPE_LABELS: Record<OrgType, string> = {
  PRAYER_GROUP: "Prayer group",
  COMMITTEE: "Committee",
  AUXILIARY: "Auxiliary",
  MINISTRY: "Ministry",
  OTHER: "Other",
};

function defaultMode(type: OrgType): MembershipModeValue {
  return type === "PRAYER_GROUP" ? "EXCLUSIVE" : "OPEN";
}

export default function NewOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [organizationType, setOrganizationType] = useState<OrgType>("OTHER");
  const [membershipMode, setMembershipMode] = useState<MembershipModeValue>(
    defaultMode("OTHER"),
  );
  const [modeTouched, setModeTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modeHint = useMemo(() => {
    const isDefault = membershipMode === defaultMode(organizationType);
    return {
      label: membershipMode === "EXCLUSIVE" ? "Exclusive" : "Open",
      isDefault,
    };
  }, [organizationType, membershipMode]);

  function onTypeChange(value: string) {
    const type = value as OrgType;
    setOrganizationType(type);
    if (!modeTouched) {
      setMembershipMode(defaultMode(type));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<{
        ok: true;
        organization: { id: string };
      }>("/api/organizations", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || null,
          organizationType,
          membershipMode,
        }),
      });
      toast.success("Organization created");
      router.push(`/organizations/${res.organization.id}`);
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
        title="Add organization"
        description="Type defaults membership mode (PA-15); admins may override."
      />
      <div className="flex-1 p-4 sm:p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Organization details</CardTitle>
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
                <Label htmlFor="organizationType">Type</Label>
                <Select value={organizationType} onValueChange={onTypeChange}>
                  <SelectTrigger id="organizationType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="membershipMode">Membership mode</Label>
                <Select
                  value={membershipMode}
                  onValueChange={(v) => {
                    setModeTouched(true);
                    setMembershipMode(v as MembershipModeValue);
                  }}
                >
                  <SelectTrigger id="membershipMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="EXCLUSIVE">Exclusive</SelectItem>
                  </SelectContent>
                </Select>
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="mode-default-hint"
                >
                  {modeHint.isDefault
                    ? `Default for ${TYPE_LABELS[organizationType]}`
                    : "Custom override of type default"}
                </p>
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
                {submitting ? "Creating…" : "Create organization"}
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
