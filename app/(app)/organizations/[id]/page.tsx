"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import {
  membershipModeDisplay,
  organizationTypeLabel,
} from "@/lib/organizations/display";

type Organization = {
  id: string;
  name: string;
  organizationType: string;
  membershipMode: string;
  description: string | null;
};

type Membership = {
  id: string;
  memberId: string;
  role: string;
  member: { id: string; firstName: string; lastName: string };
};

type Officer = {
  id: string;
  title: string;
  member: { id: string; firstName: string; lastName: string };
};

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
};

type ConflictPayload = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
};

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;

  const [org, setOrg] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [memberId, setMemberId] = useState("");
  const [officerMemberId, setOfficerMemberId] = useState("");
  const [officerTitle, setOfficerTitle] = useState("");
  const [conflict, setConflict] = useState<ConflictPayload | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [orgsRes, memRes, offRes, membersRes] = await Promise.all([
        apiRequest<{ ok: true; organizations: Organization[] }>(
          "/api/organizations",
        ),
        apiRequest<{ ok: true; memberships: Membership[] }>(
          `/api/organizations/${organizationId}/memberships`,
        ),
        apiRequest<{ ok: true; officers: Officer[] }>(
          `/api/organizations/${organizationId}/officers`,
        ),
        apiRequest<{ ok: true; members: MemberOption[] }>("/api/members"),
      ]);

      const found =
        orgsRes.organizations.find((o) => o.id === organizationId) ?? null;
      if (!found) {
        setError("Organization not found or not visible for your role.");
        setOrg(null);
      } else {
        setOrg(found);
      }
      setMemberships(memRes.memberships);
      setOfficers(offRes.officers);
      setMembers(
        membersRes.members.map((m) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
        })),
      );
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load organization",
      );
    } finally {
      setBusy(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMembership(targetMemberId: string) {
    try {
      await apiRequest(`/api/organizations/${organizationId}/memberships`, {
        method: "POST",
        body: JSON.stringify({ memberId: targetMemberId }),
      });
      toast.success("Member added");
      setMemberId("");
      setConflict(null);
      setPendingMemberId(null);
      await load();
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        const payload = err.payload as {
          conflict?: ConflictPayload | null;
        } | null;
        if (payload?.conflict) {
          setPendingMemberId(targetMemberId);
          setConflict(payload.conflict);
          return;
        }
      }
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Add member failed",
      );
    }
  }

  async function resolveMove() {
    if (!conflict || !pendingMemberId) return;
    setResolving(true);
    try {
      await apiRequest(
        `/api/organizations/${conflict.organizationId}/memberships`,
        {
          method: "PATCH",
          body: JSON.stringify({
            membershipId: conflict.membershipId,
            action: "leave",
          }),
        },
      );
      await apiRequest(`/api/organizations/${organizationId}/memberships`, {
        method: "POST",
        body: JSON.stringify({ memberId: pendingMemberId }),
      });
      toast.success("Membership moved");
      setConflict(null);
      setPendingMemberId(null);
      setMemberId("");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Move failed",
      );
    } finally {
      setResolving(false);
    }
  }

  async function addOfficer() {
    if (!officerMemberId || !officerTitle.trim()) return;
    try {
      await apiRequest(`/api/organizations/${organizationId}/officers`, {
        method: "POST",
        body: JSON.stringify({
          memberId: officerMemberId,
          title: officerTitle,
        }),
      });
      toast.success("Officer added");
      setOfficerMemberId("");
      setOfficerTitle("");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Add officer failed",
      );
    }
  }

  if (busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Organization" description="Loading…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Organization" description="Could not load." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error ?? "Not found"} />
        </div>
      </div>
    );
  }

  const mode = membershipModeDisplay(org.organizationType, org.membershipMode);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={org.name}
        description={`${organizationTypeLabel(org.organizationType)} · ${mode.label} membership${
          mode.isDefault ? " (type default)" : ""
        }`}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <Card data-testid="org-roster">
          <CardHeader>
            <CardTitle className="text-base">Roster</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="add-member">Add member</Label>
                <Select value={memberId} onValueChange={setMemberId}>
                  <SelectTrigger id="add-member">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.lastName}, {m.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={() => void addMembership(memberId)}
                disabled={!memberId}
              >
                Add to roster
              </Button>
            </div>
            <DataTable
              rows={memberships}
              columns={[
                {
                  key: "name",
                  header: "Member",
                  cell: (row) =>
                    `${row.member.lastName}, ${row.member.firstName}`,
                },
                {
                  key: "role",
                  header: "Role",
                  cell: (row) => <Badge variant="secondary">{row.role}</Badge>,
                },
              ]}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="Empty roster"
                  description="Add members to this organization."
                />
              }
            />
          </CardContent>
        </Card>

        <Card data-testid="org-officers">
          <CardHeader>
            <CardTitle className="text-base">Officers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="officer-member">Member</Label>
                <Select
                  value={officerMemberId}
                  onValueChange={setOfficerMemberId}
                >
                  <SelectTrigger id="officer-member">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.lastName}, {m.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="officer-title">Title</Label>
                <Input
                  id="officer-title"
                  value={officerTitle}
                  onChange={(e) => setOfficerTitle(e.target.value)}
                  placeholder="e.g. Secretary"
                />
              </div>
              <Button
                type="button"
                onClick={() => void addOfficer()}
                disabled={!officerMemberId || !officerTitle.trim()}
              >
                Add officer
              </Button>
            </div>
            <DataTable
              rows={officers}
              columns={[
                {
                  key: "name",
                  header: "Member",
                  cell: (row) =>
                    `${row.member.lastName}, ${row.member.firstName}`,
                },
                {
                  key: "title",
                  header: "Title",
                  cell: (row) => row.title,
                },
              ]}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="No officers"
                  description="Assign officers for this organization."
                />
              }
            />
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={conflict != null}
        onOpenChange={(open) => {
          if (!open) {
            setConflict(null);
            setPendingMemberId(null);
          }
        }}
      >
        <AlertDialogContent data-testid="exclusive-conflict-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Exclusive membership conflict</AlertDialogTitle>
            <AlertDialogDescription>
              This member already belongs to{" "}
              <strong>{conflict?.organizationName}</strong>, an exclusive
              organization of the same type. End that membership and move them
              here, or cancel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resolving}
              onClick={(e) => {
                e.preventDefault();
                void resolveMove();
              }}
            >
              {resolving ? "Moving…" : "End existing & join"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
