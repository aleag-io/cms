"use client";

import Link from "next/link";
import {
  BankIcon,
  CalendarDotsIcon,
  ChartDonutIcon,
  CheckCircleIcon,
  ListDashesIcon,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/patterns/page-header";
import { ForbiddenState, PageSkeleton } from "@/components/patterns/states";
import {
  LedgerOwnerSwitcher,
  useFinanceLedgerOwner,
} from "@/components/finance/ledger-owner-switcher";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    description: "Review postings and reversals",
    icon: ListDashesIcon,
  },
  {
    href: "/finance/periods",
    title: "Accounting Periods",
    description: "Review open and closed periods",
    icon: CalendarDotsIcon,
  },
  {
    href: "/finance/donations",
    title: "Donations",
    description: "Review gifts and attribution",
    icon: BankIcon,
    ownerScoped: false,
  },
  {
    href: "/finance/approvals",
    title: "Approvals",
    description: "Maker-checker request queue",
    icon: CheckCircleIcon,
  },
];

export default function FinanceOverviewPage() {
  const ledger = useFinanceLedgerOwner();
  const ownerQuery = ledger.owner
    ? `?owner=${encodeURIComponent(ledger.owner)}`
    : "";

  if (!ledger.isReady) {
    return <PageSkeleton rows={6} />;
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

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Finance"
        description="Ledger, approvals, periods, and giving for the selected book. Database policies remain the source of truth for every owner scope."
        actions={<LedgerOwnerSwitcher state={ledger} />}
      />

      <div className="flex-1 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {LINKS.filter(
            (item) => item.ownerScoped !== false || ledger.canManageGiving,
          ).map((item) => {
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={`${item.href}${item.ownerScoped === false ? "" : ownerQuery}`}
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
    </div>
  );
}
