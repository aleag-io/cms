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
type SwitchableParish = ParishOption & { isPrimary: boolean };

type ContextResponse = {
  ok: true;
  portal: "parish" | "diocese";
  workingParish: ParishOption | null;
  homeParish: ParishOption | null;
  canSwitchParish: boolean;
  switchableParishes: SwitchableParish[];
};

function errorMessage(err: unknown, fallback: string): string {
  return isApiClientError(err)
    ? err.message
    : err instanceof Error
      ? err.message
      : fallback;
}

export function TenantContextSwitcher({
  canSwitchParish,
  initialPortal,
  initialParishName,
  initialWorkingParishId,
  homeParishId,
  switchableParishes,
}: {
  canSwitchParish: boolean;
  initialPortal: "parish" | "diocese";
  initialParishName: string | null;
  initialWorkingParishId: string | null;
  homeParishId: string | null;
  switchableParishes: SwitchableParish[];
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

  // Multi-parish member mode: the choices come from the server (their own
  // MemberParish memberships) — never from the parish portfolio API.
  const isMemberSwitcher =
    switchableParishes.length > 1 && initialPortal === "parish";

  const loadParishes = useCallback(async () => {
    if (!canSwitchParish || isMemberSwitcher) return;
    try {
      const res = await apiRequest<{ ok: true; parishes: ParishOption[] }>(
        "/api/parishes",
      );
      setParishes(res.parishes.map((p) => ({ id: p.id, name: p.name })));
    } catch {
      // Diocese staff/report viewer may lack list rights — still show chip.
    }
  }, [canSwitchParish, isMemberSwitcher]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadParishes();
    });
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
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not switch parish"));
    } finally {
      setBusy(false);
    }
  }

  async function exitParish() {
    setBusy(true);
    try {
      await apiRequest("/api/session/context", { method: "DELETE" });
      setWorking(null);
      if (isMemberSwitcher) {
        setPortal("parish");
        toast.success("Back to your home parish");
      } else {
        setPortal("diocese");
        toast.success("Back to diocese context");
      }
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not exit parish context"));
    } finally {
      setBusy(false);
    }
  }

  // Single-parish users (or anyone without switch rights): static label.
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

  // ── Multi-parish member switcher (MM-17) ────────────────────────────────
  if (isMemberSwitcher) {
    const label = working?.name ?? initialParishName ?? "My parishes";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="hidden h-8 max-w-[14rem] gap-1.5 text-[0.6875rem] sm:inline-flex"
            data-testid="tenant-context-switcher"
          >
            <BuildingsIcon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
            <CaretDownIcon className="size-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>My parishes</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {switchableParishes.map((p) => {
            const isCurrent = working ? working.id === p.id : homeParishId === p.id;
            return (
              <DropdownMenuItem
                key={p.id}
                disabled={busy || isCurrent}
                onClick={() => {
                  if (homeParishId === p.id && working) {
                    // Returning to the home parish = exit work-context.
                    void exitParish();
                  } else {
                    void enterParish(p.id);
                  }
                }}
              >
                <span className="flex-1 truncate">{p.name}</span>
                {p.isPrimary ? (
                  <span className="ml-2 text-[0.625rem] text-muted-foreground">
                    primary
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // ── Diocese work-context switcher ───────────────────────────────────────
  const label = portal === "parish" && working ? working.name : "Diocese context";

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
