"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingsIcon, CaretDownIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ParishOption = { id: string; name: string };

type ContextResponse = {
  ok: true;
  portal: "parish" | "diocese";
  workingParish: ParishOption | null;
  homeParish: ParishOption | null;
  canSwitchParish: boolean;
};

export function TenantContextSwitcher({
  canSwitchParish,
  initialPortal,
  initialParishName,
  initialWorkingParishId,
}: {
  canSwitchParish: boolean;
  initialPortal: "parish" | "diocese";
  initialParishName: string | null;
  initialWorkingParishId: string | null;
}) {
  const router = useRouter();
  const [portal, setPortal] = useState(initialPortal);
  const [working, setWorking] = useState<ParishOption | null>(
    initialWorkingParishId && initialParishName
      ? { id: initialWorkingParishId, name: initialParishName }
      : null,
  );
  const [parishes, setParishes] = useState<ParishOption[]>([]);
  const [busy, setBusy] = useState(false);

  const loadParishes = useCallback(async () => {
    if (!canSwitchParish) return;
    try {
      const res = await apiRequest<{ ok: true; parishes: ParishOption[] }>(
        "/api/parishes",
      );
      setParishes(
        res.parishes.map((p) => ({ id: p.id, name: p.name })),
      );
    } catch {
      // Diocese staff/report viewer may lack list rights — still show chip.
    }
  }, [canSwitchParish]);

  useEffect(() => {
    void loadParishes();
  }, [loadParishes]);

  async function enterParish(parishId: string) {
    setBusy(true);
    try {
      const res = await apiRequest<{
        ok: true;
        workingParish: ParishOption;
      }>("/api/session/context", {
        method: "PUT",
        body: JSON.stringify({ parishId }),
      });
      setPortal("parish");
      setWorking(res.workingParish);
      toast.success(`Working in ${res.workingParish.name}`);
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not switch parish",
      );
    } finally {
      setBusy(false);
    }
  }

  async function exitParish() {
    setBusy(true);
    try {
      await apiRequest("/api/session/context", { method: "DELETE" });
      setPortal("diocese");
      setWorking(null);
      toast.success("Back to diocese context");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not exit parish context",
      );
    } finally {
      setBusy(false);
    }
  }

  // Parish-home users: non-interactive label with parish name when known
  if (!canSwitchParish) {
    return (
      <span
        className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[0.6875rem] text-muted-foreground sm:inline-flex"
        data-testid="tenant-context-label"
      >
        <BuildingsIcon className="size-3.5" />
        {initialParishName
          ? initialParishName
          : portal === "parish"
            ? "Parish context"
            : "Diocese context"}
      </span>
    );
  }

  const label =
    portal === "parish" && working
      ? working.name
      : "Diocese context";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          className={cn(
            "hidden h-8 max-w-[14rem] gap-1.5 text-[0.6875rem] sm:inline-flex",
            portal === "diocese" &&
              "border-amber-300 text-amber-800 hover:bg-amber-50",
          )}
          data-testid="tenant-context-switcher"
        >
          <BuildingsIcon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <CaretDownIcon className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Tenant context</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={portal === "diocese" || busy}
          onClick={() => void exitParish()}
        >
          Diocese (all parishes)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Work in parish
        </DropdownMenuLabel>
        {parishes.length === 0 ? (
          <DropdownMenuItem disabled>No parishes loaded</DropdownMenuItem>
        ) : (
          parishes.map((p) => (
            <DropdownMenuItem
              key={p.id}
              disabled={busy || working?.id === p.id}
              onClick={() => void enterParish(p.id)}
            >
              {p.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Optional prefetch for SSR props */
export type { ContextResponse };
