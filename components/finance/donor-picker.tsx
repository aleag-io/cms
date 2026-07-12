"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";

export type DonorValue = {
  familyId: string | null;
  memberId: string | null;
  externalDonorId: string | null;
  isAnonymous: boolean;
};

export const EMPTY_DONOR: DonorValue = {
  familyId: null,
  memberId: null,
  externalDonorId: null,
  isAnonymous: false,
};

type Family = { id: string; familyName: string };
type ExternalDonor = { id: string; name: string };

/**
 * Compact donor selector for batch/donation entry: a family (member gift),
 * a non-member external donor (pick or create inline), or anonymous plate cash.
 */
export function DonorPicker({
  families,
  externalDonors,
  value,
  onChange,
  onExternalCreated,
}: {
  families: Family[];
  externalDonors: ExternalDonor[];
  value: DonorValue;
  onChange: (v: DonorValue) => void;
  onExternalCreated?: (donor: ExternalDonor) => void;
}) {
  const [newName, setNewName] = useState("");
  const mode = value.isAnonymous
    ? "anonymous"
    : value.externalDonorId
      ? "external"
      : "family";

  const createDonor = useMutation({
    mutationFn: () =>
      apiRequest<{ ok: true; donor: ExternalDonor }>("/api/finance/external-donors", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      }),
    onSuccess: (res) => {
      onExternalCreated?.(res.donor);
      onChange({ ...EMPTY_DONOR, externalDonorId: res.donor.id });
      setNewName("");
      toast.success("Donor added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="flex flex-1 items-center gap-1.5">
      <Select
        value={mode}
        onValueChange={(m) =>
          onChange(m === "anonymous" ? { ...EMPTY_DONOR, isAnonymous: true } : { ...EMPTY_DONOR })
        }
      >
        <SelectTrigger className="w-32" aria-label="Donor type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="family">Family</SelectItem>
          <SelectItem value="external">Non-member</SelectItem>
          <SelectItem value="anonymous">Anonymous</SelectItem>
        </SelectContent>
      </Select>

      {mode === "family" ? (
        <Select
          value={value.familyId ?? ""}
          onValueChange={(v) => onChange({ ...EMPTY_DONOR, familyId: v })}
        >
          <SelectTrigger className="flex-1" aria-label="Family">
            <SelectValue placeholder="Select family" />
          </SelectTrigger>
          <SelectContent>
            {families.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.familyName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {mode === "external" ? (
        <div className="flex flex-1 items-center gap-1.5">
          <Select
            value={value.externalDonorId ?? ""}
            onValueChange={(v) => onChange({ ...EMPTY_DONOR, externalDonorId: v })}
          >
            <SelectTrigger className="flex-1" aria-label="Non-member donor">
              <SelectValue placeholder="Select donor" />
            </SelectTrigger>
            <SelectContent>
              {externalDonors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-32"
            placeholder="+ new donor"
            aria-label="New donor name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!newName.trim() || createDonor.isPending}
            onClick={() => createDonor.mutate()}
          >
            Add
          </Button>
        </div>
      ) : null}

      {mode === "anonymous" ? (
        <span className="flex-1 text-sm text-muted-foreground">Anonymous / plate cash</span>
      ) : null}
    </div>
  );
}
