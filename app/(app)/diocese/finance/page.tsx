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

type GivingSummaryRow = {
  parish_id: string;
  period_start: Date | string;
  period_end: Date | string;
  fund_name: string;
  total_cents: bigint;
  donation_count: number;
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  timeZone: "UTC",
});

export default async function DioceseFinancePage() {
  const actor = await requireRole([
    Role.GLOBAL_ADMIN,
    Role.DIOCESE_ADMIN,
    Role.DIOCESE_STAFF,
    Role.DIOCESE_REPORT_VIEWER,
  ]);
  const claims = await claimsFromUser(actor);

  const rows = await withTenant(claims, async (tx) => {
    const [parishes, summaries] = await Promise.all([
      tx.parish.findMany({
        where: { dioceseId: actor.dioceseId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      tx.$queryRaw<GivingSummaryRow[]>(Prisma.sql`
        SELECT parish_id, period_start, period_end, fund_name, total_cents, donation_count
        FROM diocese_parish_giving_summary
        ORDER BY period_start DESC, parish_id, fund_name
      `),
    ]);
    const parishNames = new Map(parishes.map((parish) => [parish.id, parish.name]));
    return summaries.map((summary) => ({
      ...summary,
      parishName: parishNames.get(summary.parish_id) ?? "Unknown parish",
    }));
  });

  const totals = rows.reduce(
    (result, row) => ({
      totalCents: result.totalCents + row.total_cents,
      donations: result.donations + Number(row.donation_count),
      parishes: result.parishes.add(row.parish_id),
      funds: result.funds.add(row.fund_name),
    }),
    {
      totalCents: 0n,
      donations: 0,
      parishes: new Set<string>(),
      funds: new Set<string>(),
    },
  );

  return (
    <div className="pb-6">
      <PageHeader
        title="Diocese Finance"
        description="Tier-2 giving summaries by parish, fund, and period. This default view never renders donor or raw journal rows."
        actions={<Badge variant="outline">Summary only</Badge>}
      />

      <div className="space-y-6 p-4 sm:p-6">
        <Alert>
          <AlertTitle>Aggregate-only surface</AlertTitle>
          <AlertDescription>
            Raw parish ledger and giving detail require an active, category-specific
            sharing grant and a separately audited read path.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Giving" value={formatCents(totals.totalCents)} />
          <SummaryCard title="Donations" value={totals.donations.toLocaleString()} />
          <SummaryCard title="Parishes" value={totals.parishes.size.toLocaleString()} />
          <SummaryCard title="Funds" value={totals.funds.size.toLocaleString()} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parish giving summary</CardTitle>
            <CardDescription>
              Monthly totals only; donor identity and transaction-level detail are excluded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState
                title="No giving summaries"
                description="Parish totals will appear after donations are recorded."
              />
            ) : (
              <Table aria-label="Parish giving summary">
                <TableHeader>
                  <TableRow>
                    <TableHead>Parish</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right">Donations</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={`${row.parish_id}:${String(row.period_start)}:${row.fund_name}`}
                    >
                      <TableCell className="font-medium">{row.parishName}</TableCell>
                      <TableCell>
                        {DATE_FORMAT.format(new Date(row.period_start))}
                      </TableCell>
                      <TableCell>{row.fund_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row.donation_count).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(row.total_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
