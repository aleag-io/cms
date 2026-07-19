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
import { formatCents } from '@/lib/finance/money';

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

// R6: richer Tier-2 dashboards (deferred from R3). All source views are
// self-securing — diocese + reporting-role predicates live in the view body.
type MembershipTrendRow = {
    parish_id: string;
    month: Date | string;
    new_member_count: number;
};

type SacramentalSummaryRow = {
    parish_id: string;
    sacrament_type: string;
    year: number;
    record_count: number;
};

type AttendanceSummaryRow = {
    parish_id: string;
    month: Date | string;
    session_count: number;
    present_count: number;
    absent_count: number;
    excused_count: number;
};

type EventSummaryRow = {
    parish_id: string;
    month: Date | string;
    event_count: number;
    rsvp_yes_count: number;
    attended_count: number;
};

type PledgeSummaryRow = {
    parish_id: string;
    campaign_count: number;
    pledge_count: number;
    pledged_cents: bigint;
    fulfilled_cents: bigint;
};

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});

export default async function DioceseAggregatePage() {
    const actor = await requireRole([
        Role.GLOBAL_ADMIN,
        Role.DIOCESE_ADMIN,
        Role.DIOCESE_STAFF,
        Role.DIOCESE_REPORT_VIEWER,
    ]);
    const claims = await claimsFromUser(actor);

    const { rows, parishNames, trend, sacramental, attendance, events, pledges } =
        await withTenant(claims, async (tx) => {
            const [
                parishes,
                memberSummary,
                familySummary,
                trendRows,
                sacramentalRows,
                attendanceRows,
                eventRows,
                pledgeRows,
            ] = await Promise.all([
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
                tx.$queryRaw<MembershipTrendRow[]>(Prisma.sql`
        SELECT parish_id, month, new_member_count
        FROM diocese_parish_membership_trend
        WHERE month >= (date_trunc('month', now()) - interval '11 months')::date
        ORDER BY month DESC, parish_id
      `),
                tx.$queryRaw<SacramentalSummaryRow[]>(Prisma.sql`
        SELECT parish_id, sacrament_type, year, record_count
        FROM diocese_parish_sacramental_summary
        ORDER BY year DESC, parish_id, sacrament_type
      `),
                tx.$queryRaw<AttendanceSummaryRow[]>(Prisma.sql`
        SELECT parish_id, month, session_count, present_count, absent_count, excused_count
        FROM diocese_parish_attendance_summary
        ORDER BY month DESC, parish_id
      `),
                tx.$queryRaw<EventSummaryRow[]>(Prisma.sql`
        SELECT parish_id, month, event_count, rsvp_yes_count, attended_count
        FROM diocese_parish_event_summary
        ORDER BY month DESC, parish_id
      `),
                tx.$queryRaw<PledgeSummaryRow[]>(Prisma.sql`
        SELECT parish_id, campaign_count, pledge_count, pledged_cents, fulfilled_cents
        FROM diocese_parish_pledge_summary
        ORDER BY parish_id
      `),
            ]);

            const memberByParish = new Map(
                memberSummary.map((row) => [row.parish_id, row] as const),
            );
            const familyByParish = new Map(
                familySummary.map((row) => [row.parish_id, row] as const),
            );

            return {
                parishNames: new Map(parishes.map((p) => [p.id, p.name] as const)),
                trend: trendRows,
                sacramental: sacramentalRows,
                attendance: attendanceRows,
                events: eventRows,
                pledges: pledgeRows,
                rows: parishes.map((parish) => {
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
                }),
            };
        });

    const parishName = (id: string) => parishNames.get(id) ?? 'Unknown parish';
    const month = (value: Date | string) => MONTH_FORMAT.format(new Date(value));

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

                <AggregateTable
                    title="New members by month"
                    description="Rolling 12-month intake per parish, from the protected membership-trend view."
                    empty="No members have joined in the last 12 months."
                    headers={['Parish', 'Month', 'New members']}
                    rows={trend.map((row) => ({
                        key: `${row.parish_id}:${String(row.month)}`,
                        cells: [
                            parishName(row.parish_id),
                            month(row.month),
                            Number(row.new_member_count).toLocaleString(),
                        ],
                    }))}
                />

                <AggregateTable
                    title="Sacramental records"
                    description="Record counts by parish, type, and year. Names and register text are never included."
                    empty="No sacramental records recorded."
                    headers={['Parish', 'Year', 'Sacrament', 'Records']}
                    rows={sacramental.map((row) => ({
                        key: `${row.parish_id}:${row.year}:${row.sacrament_type}`,
                        cells: [
                            parishName(row.parish_id),
                            String(row.year),
                            row.sacrament_type,
                            Number(row.record_count).toLocaleString(),
                        ],
                    }))}
                />

                <AggregateTable
                    title="Program attendance"
                    description="Sessions held and attendance outcomes per parish per month."
                    empty="No program attendance recorded."
                    headers={['Parish', 'Month', 'Sessions', 'Present', 'Absent', 'Excused']}
                    rows={attendance.map((row) => ({
                        key: `${row.parish_id}:${String(row.month)}`,
                        cells: [
                            parishName(row.parish_id),
                            month(row.month),
                            Number(row.session_count).toLocaleString(),
                            Number(row.present_count).toLocaleString(),
                            Number(row.absent_count).toLocaleString(),
                            Number(row.excused_count).toLocaleString(),
                        ],
                    }))}
                />

                <AggregateTable
                    title="Events"
                    description="Events held with RSVP and attendance counts per parish per month."
                    empty="No events scheduled."
                    headers={['Parish', 'Month', 'Events', 'RSVP yes', 'Attended']}
                    rows={events.map((row) => ({
                        key: `${row.parish_id}:${String(row.month)}`,
                        cells: [
                            parishName(row.parish_id),
                            month(row.month),
                            Number(row.event_count).toLocaleString(),
                            Number(row.rsvp_yes_count).toLocaleString(),
                            Number(row.attended_count).toLocaleString(),
                        ],
                    }))}
                />

                <AggregateTable
                    title="Pledges"
                    description="Campaign and pledge totals per parish. Individual pledges are never listed."
                    empty="No pledges recorded."
                    headers={['Parish', 'Campaigns', 'Pledges', 'Pledged', 'Fulfilled']}
                    rows={pledges.map((row) => ({
                        key: row.parish_id,
                        cells: [
                            parishName(row.parish_id),
                            Number(row.campaign_count).toLocaleString(),
                            Number(row.pledge_count).toLocaleString(),
                            formatCents(row.pledged_cents),
                            formatCents(row.fulfilled_cents),
                        ],
                    }))}
                />
            </div>
        </div>
    );
}

function AggregateTable({
    title,
    description,
    empty,
    headers,
    rows,
}: {
    title: string;
    description: string;
    empty: string;
    headers: string[];
    rows: { key: string; cells: string[] }[];
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <EmptyState title={title} description={empty} />
                ) : (
                    <div className="overflow-x-auto">
                        <Table aria-label={title}>
                            <TableHeader>
                                <TableRow>
                                    {headers.map((header, index) => (
                                        <TableHead
                                            key={header}
                                            className={index === 0 ? undefined : 'text-right'}
                                        >
                                            {header}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row) => (
                                    <TableRow key={row.key}>
                                        {row.cells.map((cell, index) => (
                                            <TableCell
                                                key={index}
                                                className={
                                                    index === 0
                                                        ? 'font-medium'
                                                        : 'text-right tabular-nums'
                                                }
                                            >
                                                {cell}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
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