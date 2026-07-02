import { ReactNode } from "react";
import { WarningCircleIcon, LockKeyIcon, TrayIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

function StateFrame({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-52 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center",
        className,
      )}
    >
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <StateFrame
      icon={<TrayIcon className="size-7" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  retry,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
}) {
  return (
    <StateFrame
      icon={<WarningCircleIcon className="size-7" />}
      title={title}
      description={description}
      action={
        retry ? (
          <Button type="button" variant="outline" onClick={retry}>
            Try again
          </Button>
        ) : null
      }
    />
  );
}

export function ForbiddenState({
  title = "Access restricted",
  description = "Your account does not have access to this area.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <StateFrame
      icon={<LockKeyIcon className="size-7" />}
      title={title}
      description={description}
    />
  );
}
