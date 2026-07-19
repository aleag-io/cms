import { Prisma, Role } from "@prisma/client";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { claimsFromUser, requireRole } from "@/lib/auth";
import { withTenant } from "@/lib/db/withTenant";
import { formatCents } from "@/lib/finance/money";

// RP-9 / DA-12: the Global Finance Approval Policy Dashboard. Reads the
// self-securing Tier-2 views so a diocese sees every ledger owner's
// maker-checker configuration without touching parish ledger rows.

type PolicyRow = {
  parish_id: string | null;
  owner_type: string;
  owner_id: string;
  owner_label: string;
  entity_kind: string;
  mode: string;
  threshold_cents: bigint | null;
  min_approvals: number;
  approver_roles: string[];
  is_active: boolean;
};

type RequestRow = {
  parish_id: string | null;
  entity_kind: string;
  status: string;
  request_count: number;
  total_amount_cents: bigint;
  oldest_created_at: Date | string;
};

const MODE_LABELS: Record<string, string> = {
  STRICT: "Strict",
  THRESHOLD_BASED: "Threshold",
  HYBRID: "Hybrid",
};

function daysSince(value: Date | string): number {
  const then = new Date(value).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

export default async function DioceseApprovalPoliciesPage() {
  const actor = await requireRole([
    Role.GLOBAL_ADMIN,
    Role.DIOCESE_ADMIN,
    Role.DIOCESE_STAFF,
    Role.DIOCESE_REPORT_VIEWER,
  ]);
  const claims = await claimsFromUser(actor);

  const { policies, requests } = await withTenant(claims, async (tx) => {
    const [policyRows, requestRows] = await Promise.all([
      tx.$queryRaw<PolicyRow[]>(Prisma.sql`
        SELECT parish_id, owner_type, owner_id, owner_label, entity_kind, mode,
               threshold_cents, min_approvals, approver_roles, is_active
        FROM diocese_approval_policy_dashboard
        ORDER BY owner_label, entity_kind
      `),
      tx.$queryRaw<RequestRow[]>(Prisma.sql`
        SELECT parish_id, entity_kind, status, request_count,
               total_amount_cents, oldest_created_at
        FROM diocese_approval_request_summary
        ORDER BY status, entity_kind
      `),
    ]);
    return { policies: policyRows, requests: requestRows };
  });

  const pending = requests.filter((row) => row.status === "PENDING");
  const oldestPending = pending.reduce<Date | null>((oldest, row) => {
    const created = new Date(row.oldest_created_at);
    return !oldest || created < oldest ? created : oldest;
  }, null);
  const unconfigured = policies.filter((row) => !row.is_active).length;

  return (
    <div className="pb-6">
      <PageHeader
        title="Approval Policies"
        description="Maker-checker configuration across every ledger owner in the diocese, with the current approval queue depth."
        actions={<Badge variant="outline">Summary only</Badge>}
      />

      <div className="space-y-6 p-4 sm:p-6">
        <Alert>
          <AlertTitle>Configuration oversight, not control</AlertTitle>
          <AlertDescription>
            Each parish and organization owns its own approval policy. This view
            reports how those ledgers are configured; changing a policy is done by
            that ledger&apos;s administrators.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Policies configured" value={String(policies.length)} />
          <SummaryCard title="Inactive policies" value={String(unconfigured)} />
          <SummaryCard
            title="Pending approvals"
            value={String(pending.reduce((n, row) => n + Number(row.request_count), 0))}
          />
          <SummaryCard
            title="Oldest pending"
            value={oldestPending ? `${daysSince(oldestPending)} days` : "—"}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policy matrix</CardTitle>
            <CardDescription>
              One row per ledger owner and entity kind. A ledger with no policy
              auto-approves, which is why absent rows matter as much as present ones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {policies.length === 0 ? (
              <EmptyState
                title="No approval policies configured"
                description="Every ledger in this diocese currently auto-approves postings."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table aria-label="Approval policy matrix">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ledger owner</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Threshold</TableHead>
                      <TableHead className="text-right">Approvals</TableHead>
                      <TableHead>Approvers</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map((row) => (
                      <TableRow key={`${row.owner_id}:${row.entity_kind}`}>
                        <TableCell className="font-medium">{row.owner_label}</TableCell>
                        <TableCell>{row.owner_type}</TableCell>
                        <TableCell>{row.entity_kind}</TableCell>
                        <TableCell>{MODE_LABELS[row.mode] ?? row.mode}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.threshold_cents === null
                            ? "—"
                            : formatCents(row.threshold_cents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.min_approvals}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.approver_roles.join(", ")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.is_active ? "default" : "outline"}>
                            {row.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approval requests</CardTitle>
            <CardDescription>
              Counts by status and entity kind across the diocese.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <EmptyState
                title="No approval requests"
                description="Requests appear once ledgers post entities through maker-checker."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table aria-label="Approval request summary">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Total value</TableHead>
                      <TableHead className="text-right">Oldest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((row) => (
                      <TableRow key={`${row.parish_id}:${row.entity_kind}:${row.status}`}>
                        <TableCell>
                          <Badge
                            variant={row.status === "PENDING" ? "default" : "outline"}
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{row.entity_kind}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(row.request_count).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(row.total_amount_cents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {daysSince(row.oldest_created_at)}d
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
