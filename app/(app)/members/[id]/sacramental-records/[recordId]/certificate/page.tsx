"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { sacramentLabel } from "@/lib/sacramental/constants";
import type { SacramentType } from "@prisma/client";

type RecordPayload = {
  id: string;
  sacramentType: SacramentType;
  occurredOn: string;
  officiantName: string | null;
  locationText: string | null;
  registerBook: string | null;
  registerPage: string | null;
  registerEntry: string | null;
  sponsorNames: string | null;
  spouseName: string | null;
  ordainedOffice: string | null;
};

type MemberPayload = {
  firstName: string;
  lastName: string;
  memberIdentifier: string;
};

export default function SacramentalCertificatePage() {
  const params = useParams<{ id: string; recordId: string }>();
  const [record, setRecord] = useState<RecordPayload | null>(null);
  const [member, setMember] = useState<MemberPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest<{ ok: true; record: RecordPayload }>(
        `/api/members/${params.id}/sacramental-records/${params.recordId}`,
      ),
      apiRequest<{ ok: true; member: MemberPayload }>(
        `/api/members/${params.id}`,
      ),
    ])
      .then(([rec, mem]) => {
        if (!cancelled) {
          setRecord(rec.record);
          setMember(mem.member);
          setBusy(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            isApiClientError(err)
              ? err.message
              : err instanceof Error
                ? err.message
                : "Unable to load certificate",
          );
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, params.recordId]);

  if (busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Certificate" description="Loading…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error || !record || !member) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Certificate" description="Unavailable" />
        <div className="p-6">
          <ErrorState
            title="Cannot print certificate"
            description={error ?? "Record not found"}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Sacramental certificate"
        description="Printable certificate (MVP). No private notes are included."
        actions={
          <Button type="button" onClick={() => window.print()} className="print:hidden">
            Print
          </Button>
        }
      />
      <div className="flex-1 p-6">
        <article
          className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-background p-10 shadow-sm print:border-0 print:shadow-none"
          data-testid="sacramental-certificate"
        >
          <header className="space-y-1 text-center">
            <p className="text-sm uppercase tracking-widest text-muted-foreground">
              Mar Thoma Church · Diocese of North America
            </p>
            <h1 className="font-heading text-2xl font-semibold">
              Certificate of {sacramentLabel(record.sacramentType)}
            </h1>
          </header>
          <p className="text-center text-lg leading-relaxed">
            This certifies that{" "}
            <strong>
              {member.firstName} {member.lastName}
            </strong>{" "}
            ({member.memberIdentifier}) received{" "}
            <strong>{sacramentLabel(record.sacramentType)}</strong> on{" "}
            <strong>{format(parseISO(record.occurredOn), "dd MMMM yyyy")}</strong>
            {record.locationText ? (
              <>
                {" "}
                at <strong>{record.locationText}</strong>
              </>
            ) : null}
            {record.officiantName ? (
              <>
                , celebrated by <strong>{record.officiantName}</strong>
              </>
            ) : null}
            .
          </p>
          {record.sponsorNames ? (
            <p className="text-center text-sm text-muted-foreground">
              Sponsors / godparents: {record.sponsorNames}
            </p>
          ) : null}
          {record.spouseName ? (
            <p className="text-center text-sm text-muted-foreground">
              Spouse: {record.spouseName}
            </p>
          ) : null}
          {record.ordainedOffice ? (
            <p className="text-center text-sm text-muted-foreground">
              Office: {record.ordainedOffice}
            </p>
          ) : null}
          {(record.registerBook ||
            record.registerPage ||
            record.registerEntry) && (
            <p className="text-center text-xs text-muted-foreground">
              Register reference:{" "}
              {[record.registerBook, record.registerPage, record.registerEntry]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <footer className="pt-8 text-center text-xs text-muted-foreground">
            Generated from the parish sacramental register. Not a sealed diocesan
            instrument.
          </footer>
        </article>
      </div>
    </div>
  );
}
