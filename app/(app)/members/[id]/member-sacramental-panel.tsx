"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { PrinterIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import {
  SACRAMENT_LABELS,
  SACRAMENT_TYPES,
  sacramentLabel,
} from "@/lib/sacramental/constants";
import type { SacramentType } from "@prisma/client";
import { toast } from "sonner";
import Link from "next/link";

type SacramentalRecord = {
  id: string;
  sacramentType: SacramentType;
  occurredOn: string;
  officiantName: string | null;
  locationText: string | null;
  registerBook: string | null;
  registerPage: string | null;
  registerEntry: string | null;
  notes: string | null;
  sponsorNames: string | null;
  spouseName: string | null;
  witnessNames: string | null;
  ordainedOffice: string | null;
  pastoralNoteRef: string | null;
  isActive: boolean;
};

export function MemberSacramentalPanel({
  memberId,
  memberName,
  canWrite,
}: {
  memberId: string;
  memberName: string;
  canWrite: boolean;
}) {
  const [records, setRecords] = useState<SacramentalRecord[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sacramentType, setSacramentType] = useState<SacramentType>("BAPTISM");
  const [occurredOn, setOccurredOn] = useState("");
  const [officiantName, setOfficiantName] = useState("");
  const [locationText, setLocationText] = useState("");
  const [registerBook, setRegisterBook] = useState("");
  const [registerPage, setRegisterPage] = useState("");
  const [registerEntry, setRegisterEntry] = useState("");
  const [sponsorNames, setSponsorNames] = useState("");
  const [spouseName, setSpouseName] = useState("");
  const [witnessNames, setWitnessNames] = useState("");
  const [ordainedOffice, setOrdainedOffice] = useState("");
  const [pastoralNoteRef, setPastoralNoteRef] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<{ ok: true; records: SacramentalRecord[] }>(
        `/api/members/${memberId}/sacramental-records`,
      );
      setRecords(res.records);
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load sacramental records",
      );
    } finally {
      setBusy(false);
    }
  }, [memberId]);

  useEffect(() => {
    // Defer so load()'s setState is not treated as sync set-state-in-effect.
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function createRecord() {
    if (!occurredOn) {
      toast.error("Date is required");
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/members/${memberId}/sacramental-records`, {
        method: "POST",
        body: JSON.stringify({
          sacramentType,
          occurredOn,
          officiantName: officiantName || null,
          locationText: locationText || null,
          registerBook: registerBook || null,
          registerPage: registerPage || null,
          registerEntry: registerEntry || null,
          sponsorNames: sponsorNames || null,
          spouseName: spouseName || null,
          witnessNames: witnessNames || null,
          ordainedOffice: ordainedOffice || null,
          pastoralNoteRef: pastoralNoteRef || null,
          notes: notes || null,
        }),
      });
      toast.success("Sacramental record added");
      setShowForm(false);
      setOccurredOn("");
      setOfficiantName("");
      setLocationText("");
      setRegisterBook("");
      setRegisterPage("");
      setRegisterEntry("");
      setSponsorNames("");
      setSpouseName("");
      setWitnessNames("");
      setOrdainedOffice("");
      setPastoralNoteRef("");
      setNotes("");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to create record",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    try {
      await apiRequest(
        `/api/members/${memberId}/sacramental-records/${id}`,
        { method: "DELETE" },
      );
      toast.success("Record deactivated");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to deactivate",
      );
    }
  }

  if (busy) return <PageSkeleton />;
  if (error) {
    return <ErrorState title="Could not load records" description={error} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Sacramental register</CardTitle>
            <CardDescription>
              Official sacramental history for {memberName}. Sensitive — clergy and
              parish administrators only.
            </CardDescription>
          </div>
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowForm((v) => !v)}
            >
              <PlusIcon className="mr-2 size-4" />
              {showForm ? "Cancel" : "Add record"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm ? (
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sacramentType">Sacrament</Label>
                <Select
                  value={sacramentType}
                  onValueChange={(v) => setSacramentType(v as SacramentType)}
                >
                  <SelectTrigger id="sacramentType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SACRAMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {SACRAMENT_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="occurredOn">Date</Label>
                <Input
                  id="occurredOn"
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="officiantName">Officiant</Label>
                <Input
                  id="officiantName"
                  value={officiantName}
                  onChange={(e) => setOfficiantName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationText">Location / parish</Label>
                <Input
                  id="locationText"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registerBook">Register book</Label>
                <Input
                  id="registerBook"
                  value={registerBook}
                  onChange={(e) => setRegisterBook(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="registerPage">Page</Label>
                  <Input
                    id="registerPage"
                    value={registerPage}
                    onChange={(e) => setRegisterPage(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registerEntry">Entry</Label>
                  <Input
                    id="registerEntry"
                    value={registerEntry}
                    onChange={(e) => setRegisterEntry(e.target.value)}
                  />
                </div>
              </div>
              {sacramentType === "BAPTISM" ||
              sacramentType === "CONFIRMATION" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="sponsorNames">Sponsors / godparents</Label>
                  <Input
                    id="sponsorNames"
                    value={sponsorNames}
                    onChange={(e) => setSponsorNames(e.target.value)}
                  />
                </div>
              ) : null}
              {sacramentType === "MARRIAGE" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="spouseName">Spouse name</Label>
                    <Input
                      id="spouseName"
                      value={spouseName}
                      onChange={(e) => setSpouseName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="witnessNames">Witnesses</Label>
                    <Input
                      id="witnessNames"
                      value={witnessNames}
                      onChange={(e) => setWitnessNames(e.target.value)}
                    />
                  </div>
                </>
              ) : null}
              {sacramentType === "ORDINATION" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ordainedOffice">Ordained office</Label>
                  <Input
                    id="ordainedOffice"
                    value={ordainedOffice}
                    onChange={(e) => setOrdainedOffice(e.target.value)}
                  />
                </div>
              ) : null}
              {sacramentType === "CONFESSION" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pastoralNoteRef">
                    Pastoral note reference (no confession content)
                  </Label>
                  <Input
                    id="pastoralNoteRef"
                    value={pastoralNoteRef}
                    onChange={(e) => setPastoralNoteRef(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void createRecord()}
                >
                  {saving ? "Saving…" : "Save record"}
                </Button>
              </div>
            </div>
          ) : null}

          {records.length === 0 ? (
            <EmptyState
              title="No sacramental records"
              description="Add a register entry when a sacrament is celebrated."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {records.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {sacramentLabel(r.sacramentType)}
                      </span>
                      {!r.isActive ? (
                        <Badge variant="secondary">Inactive</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(r.occurredOn), "dd MMM yyyy")}
                      {r.officiantName ? ` · ${r.officiantName}` : ""}
                      {r.locationText ? ` · ${r.locationText}` : ""}
                    </p>
                    {(r.registerBook || r.registerPage || r.registerEntry) && (
                      <p className="text-xs text-muted-foreground">
                        Register{" "}
                        {[r.registerBook, r.registerPage, r.registerEntry]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link
                        href={`/members/${memberId}/sacramental-records/${r.id}/certificate`}
                      >
                        <PrinterIcon className="mr-2 size-4" />
                        Certificate
                      </Link>
                    </Button>
                    {canWrite && r.isActive ? (
                      <ConfirmDialog
                        trigger={
                          <Button type="button" variant="ghost" size="sm">
                            Deactivate
                          </Button>
                        }
                        title="Deactivate record?"
                        description="The register entry will be hidden from the default list. Audit history is retained."
                        confirmLabel="Deactivate"
                        destructive
                        onConfirm={() => {
                          void deactivate(r.id);
                        }}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
