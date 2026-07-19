"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/states";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api-client";
import { toCsv } from "@/lib/csv";

type ImportError = { line: number; field?: string; reason: string };

type ImportResult = {
  mode: "dry-run" | "commit";
  total: number;
  valid: number;
  created: number;
  failed: number;
  errors: ImportError[];
};

export default function MemberImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (mode: "dry-run" | "commit") => {
    setBusy(true);
    try {
      const response = await apiRequest<ImportResult & { ok: true }>(
        "/api/members/import",
        { method: "POST", body: JSON.stringify({ content, mode }) },
      );
      setResult(response);
      if (mode === "commit") {
        toast.success(
          response.failed === 0
            ? `Imported ${response.created} members`
            : `Imported ${response.created}; ${response.failed} row(s) skipped`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadErrors = () => {
    if (!result) return;
    const csv = toCsv(
      ["Line", "Field", "Reason"],
      result.errors.map((error) => [error.line, error.field ?? "", error.reason]),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "member-import-errors.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title="Import members"
        description="Upload a CSV to create members in bulk. Always dry-run first — nothing is written until you commit."
        actions={
          <Button asChild variant="outline">
            <Link href="/members">Back to members</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose a file</CardTitle>
          <CardDescription>
            Required columns: first name and last name. Optional: email, phone,
            gender, status, member id, family name. Column names are matched
            loosely (<code>first_name</code>, <code>First Name</code>, …).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                setContent(await file.text());
                setResult(null);
              }}
            />
          </div>
          {fileName ? (
            <p className="text-sm text-muted-foreground">
              Loaded <span className="font-medium">{fileName}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run("dry-run")} disabled={!content || busy}>
              Validate (dry run)
            </Button>
            <Button
              variant="default"
              onClick={() => run("commit")}
              disabled={!result || result.valid === 0 || busy}
            >
              Import {result ? `${result.valid} valid row(s)` : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {result.mode === "commit" ? "Import result" : "Validation result"}
            </CardTitle>
            <CardDescription>
              {result.total} row(s) read · {result.valid} valid ·{" "}
              {result.created} created · {result.failed} problem(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.errors.length === 0 ? (
              <EmptyState
                title="No problems found"
                description={
                  result.mode === "commit"
                    ? "Every row imported cleanly."
                    : "Every row is ready to import."
                }
              />
            ) : (
              <>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    Download errors CSV
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table aria-label="Import problems">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Line</TableHead>
                        <TableHead className="w-40">Field</TableHead>
                        <TableHead>Problem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((error, index) => (
                        <TableRow key={`${error.line}-${index}`}>
                          <TableCell className="tabular-nums">{error.line}</TableCell>
                          <TableCell>{error.field ?? "—"}</TableCell>
                          <TableCell>{error.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
