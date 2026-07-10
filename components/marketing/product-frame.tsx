import { cn } from "@/lib/utils";

/** Browser-chrome wrapper for marketing product mockups. */
export function ProductFrame({
  children,
  className,
  url = "cms.marthoma.example/app",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  url?: string;
  label?: string;
}) {
  return (
    <figure className={cn("w-full", className)}>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-primary/10 ring-1 ring-black/5">
        <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-red-400/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="min-w-0 flex-1 truncate rounded-md bg-background/80 px-2.5 py-1 text-center text-[10px] text-muted-foreground sm:text-xs">
            {url}
          </div>
        </div>
        <div className="bg-background">{children}</div>
      </div>
      {label ? (
        <figcaption className="mt-3 text-center text-sm text-muted-foreground">
          {label}
        </figcaption>
      ) : null}
    </figure>
  );
}
