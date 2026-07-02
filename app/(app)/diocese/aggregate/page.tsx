import { Prisma, Role } from '@prisma/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';

type MemberSummaryRow = {
  parish_id: string;
  active_count: number;
  inactive_count: number;
  deceased_count: number;
  moved_count: number;
  total_count: number;
};

type FamilySummaryRow = {
  parish_id: string;
  family_count: number;
  active_family_count: number;
};

type AggregateRow = {
  parishId: string;
  parishName: string;
  isActive: boolean;
  members: number;
  activeMembers: number;
  inactiveMembers: number;
  deceasedMembers: number;
  movedMembers: number;
  families: number;
  activeFamilies: number;
};

export default async function DioceseAggregatePage() {
  const actor = await requireRole([
    Role.GLOBAL_ADMIN,
    Role.DIOCESE_ADMIN,
    Role.DIOCESE_STAFF,
    Role.DIOCESE_REPORT_VIEWER,
  ]);
  const claims = await claimsFromUser(actor);

  const rows = await withTenant(claims, async (tx) => {
    const [parishes, memberSummary, familySummary] = await Promise.all([
      tx.parish.findMany({
        where: { dioceseId: actor.dioceseId },
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      tx.$queryRaw<MemberSummaryRow[]>(Prisma.sql`
        SELECT parish_id, active_count, inactive_count, deceased_count, moved_count, total_count
        FROM diocese_parish_member_summary
        ORDER BY parish_id
      `),
      tx.$queryRaw<FamilySummaryRow[]>(Prisma.sql`
        SELECT parish_id, family_count, active_family_count
        FROM diocese_parish_family_summary
        ORDER BY parish_id
      `),
    ]);

    const memberByParish = new Map(
      memberSummary.map((row) => [row.parish_id, row] as const),
    );
    const familyByParish = new Map(
      familySummary.map((row) => [row.parish_id, row] as const),
    );

    return parishes.map((parish) => {
      const member = memberByParish.get(parish.id);
      const family = familyByParish.get(parish.id);

      return {
        parishId: parish.id,
        parishName: parish.name,
        isActive: parish.isActive,
        members: member?.total_count ?? 0,
        activeMembers: member?.active_count ?? 0,
        inactiveMembers: member?.inactive_count ?? 0,
        deceasedMembers: member?.deceased_count ?? 0,
        movedMembers: member?.moved_count ?? 0,
        families: family?.family_count ?? 0,
        activeFamilies: family?.active_family_count ?? 0,
      } satisfies AggregateRow;
    });
  });

  const totals = rows.reduce(
    (acc, row) => ({
      parishes: acc.parishes + 1,
      activeParishes: acc.activeParishes + (row.isActive ? 1 : 0),
      members: acc.members + row.members,
      activeMembers: acc.activeMembers + row.activeMembers,
      families: acc.families + row.families,
    }),
    {
      parishes: 0,
      activeParishes: 0,
      members: 0,
      activeMembers: 0,
      families: 0,
    },
  );

  return (
    <div className="pb-6">
      <PageHeader
        title="Diocese Aggregate"
        description="Tier-2 parish summary only. This screen renders counts and totals, never individual member, family, or financial rows."
        actions={<Badge variant="outline">Summary only</Badge>}
      />

      <div className="space-y-6 p-4 sm:p-6">
        <Alert>
          <AlertTitle>Aggregate-only surface</AlertTitle>
          <AlertDescription>
            Diocese reporting stays at parish summary level. If a workflow needs
            person-level access, it must go through grant-scoped sharing APIs and
            their independent RLS checks.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Parishes"
            value={totals.parishes}
            detail={`${totals.activeParishes} active`}
          />
          <SummaryCard
            title="Members"
            value={totals.members}
            detail={`${totals.activeMembers} active`}
          />
          <SummaryCard
            title="Families"
            value={totals.families}
            detail="Aggregate count across parishes"
          />
          <SummaryCard
            title="Inactive Members"
            value={rows.reduce((count, row) => count + row.inactiveMembers, 0)}
            detail="Summary trend indicator"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Parish Portfolio</CardTitle>
            <CardDescription>
              Structural parish list with summary counts from the protected diocese
              aggregate views.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState
                title="No parishes available"
                description="Parish summaries will appear here once diocesan parishes are provisioned."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parish</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">Families</TableHead>
                    <TableHead className="text-right">Inactive</TableHead>
                    <TableHead className="text-right">Moved</TableHead>
                    <TableHead className="text-right">Deceased</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.parishId}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{row.parishName}</div>
                          <div className="text-[0.6875rem] text-muted-foreground">
                            {row.parishId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.isActive ? 'secondary' : 'outline'}>
                          {row.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{row.members}</TableCell>
                      <TableCell className="text-right">{row.activeMembers}</TableCell>
                      <TableCell className="text-right">{row.families}</TableCell>
                      <TableCell className="text-right">{row.inactiveMembers}</TableCell>
                      <TableCell className="text-right">{row.movedMembers}</TableCell>
                      <TableCell className="text-right">{row.deceasedMembers}</TableCell>
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

function SummaryCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: number;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value.toLocaleString()}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}