"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRightIcon,
  BankIcon,
  CalendarDotsIcon,
  ChartDonutIcon,
  CheckCircleIcon,
  ListDashesIcon,
  ScalesIcon,
  TrendDownIcon,
  TrendUpIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/patterns/page-header";
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  PageSkeleton,
} from "@/components/patterns/states";
import {
  LedgerOwnerSwitcher,
  useFinanceLedgerOwner,
} from "@/components/finance/ledger-owner-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { formatCents } from "@/lib/finance/money";
import { cn } from "@/lib/utils";
import type { FinancePicture } from "@/lib/finance/dashboard";

type DashboardResponse = {
  ok: true;
  ledger: { ownerType: string; ownerId: string; parishId: string | null };
  picture: FinancePicture;
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const LINKS = [
  {
    href: "/finance/accounts",
    title: "Chart of Accounts",
    description: "Funds and ledger accounts",
    icon: ChartDonutIcon,
  },
  {
    href: "/finance/journal",
    title: "Journal",
    description: "Postings and reversals",
    icon: ListDashesIcon,
  },
  {
    href: "/finance/periods",
    title: "Accounting Periods",
    description: "Open and closed periods",
    icon: CalendarDotsIcon,
  },
  {
    href: "/finance/donations",
    title: "Donations",
    description: "Gifts and attribution",
    icon: BankIcon,
    giving: true,
  },
  {
    href: "/finance/approvals",
    title: "Approvals",
    description: "Maker-checker queue",
    icon: CheckCircleIcon,
  },
  {
    href: "/finance/budgets",
    title: "Budgets",
    description: "Plans vs actuals",
    icon: ScalesIcon,
  },
  {
    href: "/finance/reports",
    title: "Reports",
    description: "Receipts & payments",
    icon: TrendUpIcon,
  },
] as const;

const incomeExpenseConfig = {
  income: { label: "Income", color: "var(--chart-2)" },
  expense: { label: "Expense", color: "var(--chart-5)" },
} satisfies ChartConfig;

const fundChartConfig = {
  balance: { label: "Balance", color: "var(--chart-1)" },
} satisfies ChartConfig;

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function moneyTone(cents: string): string {
  const v = BigInt(cents || "0");
  if (v > 0n) return "text-emerald-700 dark:text-emerald-400";
  if (v < 0n) return "text-rose-700 dark:text-rose-400";
  return "text-foreground";
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardDescription className="text-xs font-medium uppercase tracking-wide">
            {label}
          </CardDescription>
          <CardTitle
            className={cn(
              "font-semibold tabular-nums tracking-tight text-2xl sm:text-3xl",
              tone,
            )}
          >
            {value}
          </CardTitle>
        </div>
        <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
      </CardHeader>
      {hint ? (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function ProgressBar({
  label,
  actual,
  budget,
  invert,
}: {
  label: string;
  actual: string;
  budget: string;
  invert?: boolean;
}) {
  const a = Number(BigInt(actual));
  const b = Number(BigInt(budget));
  const pct = b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;
  const over = invert ? a > b : a < b && b > 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {formatCents(actual)}
          <span className="text-muted-foreground">
            {" "}
            / {formatCents(budget)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">{pct}%</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-rose-500/80" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function FinanceOverviewPage() {
  const ledger = useFinanceLedgerOwner();
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const fiscalYear = new Date().getUTCFullYear();

  const ownerQuery = ledger.owner
    ? `?owner=${encodeURIComponent(ledger.owner)}`
    : "";

  const dashQuery = useQuery({
    queryKey: ["finance", "dashboard", ledger.owner, basis, fiscalYear],
    enabled: ledger.isReady && !ledger.isForbidden && Boolean(ledger.owner),
    queryFn: () =>
      apiRequest<DashboardResponse>(
        `/api/finance/dashboard?owner=${encodeURIComponent(ledger.owner)}&basis=${basis}&fiscalYear=${fiscalYear}`,
      ),
  });

  const picture = dashQuery.data?.picture;
  const ownerLabel =
    ledger.options.find((o) => o.value === ledger.owner)?.label ??
    (ledger.owner === "diocese"
      ? "Diocese general ledger"
      : ledger.owner === "parish"
        ? "Parish general ledger"
        : "Selected ledger");

  const incomeExpenseData = useMemo(() => {
    if (!picture) return [];
    return [
      {
        name: "YTD",
        income: Number(BigInt(picture.kpis.incomeCents)) / 100,
        expense: Number(BigInt(picture.kpis.expenseCents)) / 100,
      },
    ];
  }, [picture]);

  const fundPieData = useMemo(() => {
    if (!picture) return [];
    return picture.funds.slice(0, 6).map((f) => ({
      name: f.name,
      value: Math.max(0, Number(BigInt(f.balanceCents)) / 100),
    }));
  }, [picture]);

  if (!ledger.isReady) {
    return <PageSkeleton rows={8} />;
  }

  if (ledger.isForbidden) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader
          title="Finance"
          description="The requested ledger is not available to your account."
          actions={<LedgerOwnerSwitcher state={ledger} />}
        />
        <div className="flex-1 p-4 sm:p-6">
          <ForbiddenState description="Choose an authorized ledger owner or return to your dashboard." />
        </div>
      </div>
    );
  }

  const error =
    dashQuery.error && isApiClientError(dashQuery.error)
      ? dashQuery.error
      : null;

  return (
    <div className="flex min-h-full flex-col" data-testid="finance-dashboard">
      <PageHeader
        title="Finance"
        description={`Full financial picture for ${ownerLabel}. Position, operating results, budget, and recent activity for this entity’s books.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={basis}
              onValueChange={(v) => setBasis(v as "accrual" | "cash")}
            >
              <TabsList className="h-9">
                <TabsTrigger value="accrual" className="text-xs">
                  Accrual
                </TabsTrigger>
                <TabsTrigger value="cash" className="text-xs">
                  Cash
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={String(fiscalYear)} disabled>
              <SelectTrigger className="w-[7.5rem]" aria-label="Fiscal year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(fiscalYear)}>FY {fiscalYear}</SelectItem>
              </SelectContent>
            </Select>
            <LedgerOwnerSwitcher state={ledger} />
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {dashQuery.isLoading ? <PageSkeleton rows={10} /> : null}

        {error ? (
          <ErrorState
            title="Could not load financial picture"
            description={error.message}
            retry={() => {
              void dashQuery.refetch();
            }}
          />
        ) : null}

        {picture ? (
          <>
            {/* Entity band */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-br from-primary/5 via-background to-muted/40 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Entity books · {basis} basis
                </p>
                <h2 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                  {ownerLabel}
                </h2>
                <p className="text-sm text-muted-foreground">
                  FY {picture.fiscalYear} ·{" "}
                  {DATE_FMT.format(new Date(picture.range.from + "T00:00:00Z"))}{" "}
                  – {DATE_FMT.format(new Date(picture.range.to + "T00:00:00Z"))}
                  {picture.periods.current ? (
                    <>
                      {" "}
                      · Period{" "}
                      <Badge variant="outline" className="ml-1 align-middle">
                        {picture.periods.current.status}
                      </Badge>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">
                  {picture.counts.accounts} accounts
                </Badge>
                <Badge variant="secondary">{picture.counts.funds} funds</Badge>
                {picture.approvals.pendingCount > 0 ? (
                  <Badge variant="destructive">
                    {picture.approvals.pendingCount} pending approvals
                  </Badge>
                ) : (
                  <Badge variant="outline">No pending approvals</Badge>
                )}
              </div>
            </div>

            {/* KPI row */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Cash & bank"
                value={formatCents(picture.kpis.cashCents)}
                hint="Cash-like asset accounts"
                icon={WalletIcon}
                tone={moneyTone(picture.kpis.cashCents)}
              />
              <KpiCard
                label="YTD income"
                value={formatCents(picture.kpis.incomeCents)}
                hint={`${basis} basis · FY ${picture.fiscalYear}`}
                icon={TrendUpIcon}
                tone={moneyTone(picture.kpis.incomeCents)}
              />
              <KpiCard
                label="YTD expense"
                value={formatCents(picture.kpis.expenseCents)}
                hint={`${basis} basis · FY ${picture.fiscalYear}`}
                icon={TrendDownIcon}
              />
              <KpiCard
                label="YTD net operating"
                value={formatCents(picture.kpis.netOperatingCents)}
                hint="Income − expense"
                icon={ScalesIcon}
                tone={moneyTone(picture.kpis.netOperatingCents)}
              />
            </div>

            {/* Position strip */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Balance sheet position</CardTitle>
                <CardDescription>
                  Cumulative posted balances for this ledger (all periods).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      label: "Assets",
                      value: picture.kpis.assetCents,
                    },
                    {
                      label: "Liabilities",
                      value: picture.kpis.liabilityCents,
                    },
                    {
                      label: "Net position",
                      value: picture.kpis.netPositionCents,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border bg-muted/20 px-4 py-3"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-xl font-semibold tabular-nums",
                          moneyTone(item.value),
                        )}
                      >
                        {formatCents(item.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Income vs expense */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Operating result (YTD)
                  </CardTitle>
                  <CardDescription>
                    Income and expense for FY {picture.fiscalYear}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {Number(BigInt(picture.kpis.incomeCents)) === 0 &&
                  Number(BigInt(picture.kpis.expenseCents)) === 0 ? (
                    <EmptyState
                      title="No posted activity yet"
                      description="Post journal entries or donations to populate this chart."
                    />
                  ) : (
                    <ChartContainer
                      config={incomeExpenseConfig}
                      className="aspect-auto h-[240px] w-full"
                      initialDimension={{ width: 480, height: 240 }}
                    >
                      <BarChart
                        accessibilityLayer
                        data={incomeExpenseData}
                        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={56}
                          tickFormatter={(v) =>
                            `$${Number(v).toLocaleString("en-US", {
                              maximumFractionDigits: 0,
                            })}`
                          }
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) =>
                                formatCents(Math.round(Number(value) * 100))
                              }
                            />
                          }
                        />
                        <Bar
                          dataKey="income"
                          fill="var(--color-income)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="expense"
                          fill="var(--color-expense)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              {/* Funds */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Fund balances</CardTitle>
                  <CardDescription>
                    Asset balances by fund (cash & other assets)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {fundPieData.length === 0 ? (
                    <EmptyState
                      title="No fund balances"
                      description="Seed the chart of accounts or post activity to funds."
                    />
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ChartContainer
                        config={fundChartConfig}
                        className="aspect-square max-h-[220px] w-full"
                        initialDimension={{ width: 220, height: 220 }}
                      >
                        <PieChart>
                          <Pie
                            data={fundPieData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={48}
                            outerRadius={80}
                            paddingAngle={2}
                          >
                            {fundPieData.map((_, i) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) =>
                                  formatCents(Math.round(Number(value) * 100))
                                }
                              />
                            }
                          />
                        </PieChart>
                      </ChartContainer>
                      <ul className="space-y-2 self-center text-sm">
                        {picture.funds.slice(0, 6).map((f, i) => (
                          <li
                            key={f.fundId ?? f.name}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className="size-2.5 shrink-0 rounded-full"
                                style={{
                                  background: PIE_COLORS[i % PIE_COLORS.length],
                                }}
                              />
                              <span className="truncate">{f.name}</span>
                            </span>
                            <span className="tabular-nums font-medium">
                              {formatCents(f.balanceCents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Top income / expense tables */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top income accounts</CardTitle>
                  <CardDescription>YTD credits by income account</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {picture.topIncome.length === 0 ? (
                    <p className="px-6 text-sm text-muted-foreground">
                      No income posted this year.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {picture.topIncome.map((row) => (
                          <TableRow key={row.accountId}>
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">
                                {row.code}
                              </span>{" "}
                              {row.name}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCents(row.amountCents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top expense accounts</CardTitle>
                  <CardDescription>YTD debits by expense account</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {picture.topExpense.length === 0 ? (
                    <p className="px-6 text-sm text-muted-foreground">
                      No expenses posted this year.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {picture.topExpense.map((row) => (
                          <TableRow key={row.accountId}>
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">
                                {row.code}
                              </span>{" "}
                              {row.name}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCents(row.amountCents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Budget */}
            {picture.budget ? (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Budget vs actual · FY {picture.budget.fiscalYear}
                    </CardTitle>
                    <CardDescription>
                      Income favorable when actual exceeds budget; expense
                      favorable when actual is under budget.
                    </CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/finance/budgets${ownerQuery}`}>
                      Manage budgets
                      <ArrowUpRightIcon className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ProgressBar
                    label="Income"
                    actual={picture.budget.actualIncomeCents}
                    budget={picture.budget.budgetedIncomeCents}
                  />
                  <ProgressBar
                    label="Expense"
                    actual={picture.budget.actualExpenseCents}
                    budget={picture.budget.budgetedExpenseCents}
                    invert
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        Income variance{" "}
                      </span>
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          moneyTone(picture.budget.incomeVarianceCents),
                        )}
                      >
                        {formatCents(picture.budget.incomeVarianceCents)}
                      </span>
                    </div>
                    <div className="rounded-md border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        Expense underspend{" "}
                      </span>
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          moneyTone(picture.budget.expenseVarianceCents),
                        )}
                      >
                        {formatCents(picture.budget.expenseVarianceCents)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Recent journals</CardTitle>
                    <CardDescription>Latest entries on this ledger</CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/finance/journal${ownerQuery}`}>
                      View all
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="px-0">
                  {picture.activity.recentJournals.length === 0 ? (
                    <p className="px-6 text-sm text-muted-foreground">
                      No journal entries yet.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {picture.activity.recentJournals.map((j) => (
                          <TableRow key={j.id}>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {DATE_FMT.format(
                                new Date(j.entryDate + "T00:00:00Z"),
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[16rem] truncate">
                                {j.description}
                              </div>
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                {j.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCents(j.totalDebitCents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Recent giving</CardTitle>
                    <CardDescription>
                      Active donations YTD for this entity
                    </CardDescription>
                  </div>
                  {ledger.canManageGiving ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/finance/donations">View all</Link>
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="px-0">
                  {picture.activity.recentDonations.length === 0 ? (
                    <p className="px-6 text-sm text-muted-foreground">
                      {ledger.owner.startsWith("org:")
                        ? "Organization ledgers do not hold gifts; use the parish or diocese books."
                        : "No donations recorded this year."}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {picture.activity.recentDonations.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {DATE_FMT.format(
                                new Date(d.receivedAt + "T00:00:00Z"),
                              )}
                            </TableCell>
                            <TableCell className="capitalize">
                              {d.method.toLowerCase().replaceAll("_", " ")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCents(d.amountCents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Module links */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Finance modules
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {LINKS.filter(
                  (item) =>
                    !("giving" in item && item.giving) || ledger.canManageGiving,
                ).map((item) => {
                  const ItemIcon = item.icon;
                  const href =
                    "giving" in item && item.giving
                      ? item.href
                      : `${item.href}${ownerQuery}`;
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <Card className="h-full transition-colors hover:bg-muted/40">
                        <CardHeader className="grid-cols-[auto_1fr] gap-x-3">
                          <span className="row-span-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <ItemIcon className="size-4.5" />
                          </span>
                          <CardTitle className="text-base">{item.title}</CardTitle>
                          <CardDescription>{item.description}</CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        {!dashQuery.isLoading && !error && !picture ? (
          <EmptyState
            title="No financial picture"
            description="Select a ledger owner to view the books."
          />
        ) : null}
      </div>
    </div>
  );
}
