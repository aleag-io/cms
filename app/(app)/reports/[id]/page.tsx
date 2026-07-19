"use client";

import { use, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PageSkeleton } from "@/components/patterns/states";
import { ReportView, type ReportResult } from "@/components/reports/report-view";
import { Button } from "@/components/ui/button";
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
  LedgerOwnerSwitcher,
  useFinanceLedgerOwner,
} from "@/components/finance/ledger-owner-switcher";
import { apiRequest } from "@/lib/api-client";

type ParamDef = {
  key: string;
  label: string;
  type: "year" | "dateRange" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
};

type ReportSummary = {
  id: string;
  title: string;
  description: string;
  needsLedgerOwner: boolean;
  params: ParamDef[];
};

export default function ReportRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const ledger = useFinanceLedgerOwner();
  const [values, setValues] = useState<Record<string, string>>({
    year: String(new Date().getFullYear()),
  });

  const catalog = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () =>
      apiRequest<{ ok: true; reports: ReportSummary[] }>("/api/reports"),
  });

  const definition = catalog.data?.reports.find((report) => report.id === id);

  const queryString = useMemo(() => {
    const search = new URLSearchParams();
    for (const param of definition?.params ?? []) {
      const value = values[param.key];
      if (value) search.set(param.key, value);
    }
    if (definition?.needsLedgerOwner && ledger.owner) {
      search.set("owner", ledger.owner);
    }
    return search.toString();
  }, [definition, values, ledger.owner]);

  const missingRequired = (definition?.params ?? []).some(
    (param) => param.required && !values[param.key],
  );

  const report = useQuery({
    queryKey: ["reports", "run", id, queryString],
    enabled: Boolean(definition) && !missingRequired,
    queryFn: () =>
      apiRequest<{ ok: true; result: ReportResult }>(
        `/api/reports/${id}?${queryString}`,
      ),
  });

  if (catalog.isLoading) return <PageSkeleton rows={4} />;
  if (catalog.isError || !definition) {
    return (
      <ErrorState
        title="Report unavailable"
        description="This report does not exist or your role cannot run it."
      />
    );
  }

  const downloadHref = (format: "csv" | "pdf") =>
    `/api/reports/${id}?${queryString}${queryString ? "&" : ""}format=${format}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={definition.title}
        description={definition.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {definition.needsLedgerOwner ? (
              <LedgerOwnerSwitcher state={ledger} />
            ) : null}
            <Button asChild variant="outline" disabled={missingRequired}>
              <a href={downloadHref("csv")}>Download CSV</a>
            </Button>
            <Button asChild variant="outline" disabled={missingRequired}>
              <a href={downloadHref("pdf")}>Download PDF</a>
            </Button>
          </div>
        }
      />

      {definition.params.length > 0 ? (
        <div className="flex flex-wrap items-end gap-4">
          {definition.params.map((param) => (
            <div key={param.key} className="space-y-1">
              <Label htmlFor={`param-${param.key}`}>{param.label}</Label>
              {param.type === "select" ? (
                <Select
                  value={values[param.key] ?? param.options?.[0]?.value ?? ""}
                  onValueChange={(value) =>
                    setValues((prev) => ({ ...prev, [param.key]: value }))
                  }
                >
                  <SelectTrigger
                    id={`param-${param.key}`}
                    className="w-40"
                    aria-label={param.label}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(param.options ?? []).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`param-${param.key}`}
                  className="w-32"
                  inputMode="numeric"
                  value={values[param.key] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      [param.key]: event.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {report.isLoading ? <PageSkeleton rows={6} /> : null}
      {report.isError ? (
        <ErrorState
          title="Could not run this report"
          description="The report failed to run with the selected parameters."
          retry={() => void report.refetch()}
        />
      ) : null}
      {report.data ? <ReportView result={report.data.result} /> : null}
    </div>
  );
}
