/**
 * R5 / M10 finance demo data for prisma/seed.ts.
 *
 * Seeds full multi-level books:
 *   - Diocese general ledger
 *   - Diocese-level organizations (created if missing) with own ledgers
 *   - Each parish general ledger
 *   - Each parish organization with hasOwnLedger
 *
 * Also: campaigns, pledges, donations (all methods + external/anonymous),
 * vendors/bills/payments, budgets, approval policies, recon sample.
 *
 * Programs do not own ledgers in the schema; parish program activity is
 * reflected via ministry/auxiliary orgs with hasOwnLedger and parish books.
 */

import { randomUUID } from 'node:crypto';
import type {
  DonationMethod,
  LedgerOwnerType,
  PrismaClient,
  Role,
} from '@prisma/client';
import { seedDefaultChart } from '../lib/finance/seedChart';

export type FinanceParishBundle = {
  id: string;
  name: string;
  adminUserId: string;
  staffUserId: string;
  families: Array<{
    id: string;
    familyName: string;
    primaryContactEmail: string | null;
  }>;
  members: Array<{
    id: string;
    familyId: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
  }>;
};

export type FinanceSeedInput = {
  dioceseId: string;
  dioceseAdminId: string;
  dioceseStaffId: string;
  parishes: FinanceParishBundle[];
};

export type FinanceSeedCounts = {
  ledgers: number;
  funds: number;
  accounts: number;
  periods: number;
  journals: number;
  donations: number;
  campaigns: number;
  pledges: number;
  vendors: number;
  budgets: number;
  dioceseOrgs: number;
  externalDonors: number;
};

type LedgerCtx = {
  ownerType: LedgerOwnerType;
  ownerId: string;
  dioceseId: string;
  parishId: string | null;
  actorUserId: string;
  label: string;
};

type ChartIds = {
  cashId: string;
  buildingCashId: string;
  incomeId: string;
  buildingIncomeId: string;
  expenseUtilitiesId: string;
  expenseSalariesId: string;
  apId: string;
  fundGeneralId: string;
  fundBuildingId: string;
  fundMissionsId: string;
  periodId: string;
  priorPeriodId: string;
};

const DONATION_METHODS: DonationMethod[] = [
  'CASH',
  'CHECK',
  'ZELLE',
  'ACH',
  'CARD',
  'STOCK',
  'OTHER',
];

const DIOCESE_ORG_DEFS = [
  {
    name: 'Diocese Finance Committee',
    organizationType: 'COMMITTEE' as const,
    description: 'Diocese-wide finance oversight (own ledger)',
    hasOwnLedger: true,
  },
  {
    name: 'Diocese Missions Board',
    organizationType: 'MINISTRY' as const,
    description: 'Diocese missions & outreach board (own ledger)',
    hasOwnLedger: true,
  },
  {
    name: 'Diocese Youth Fellowship',
    organizationType: 'AUXILIARY' as const,
    description: 'Diocese youth fellowship (own ledger)',
    hasOwnLedger: true,
  },
  {
    name: 'Diocese Program Office',
    organizationType: 'OTHER' as const,
    description:
      'Operational umbrella for diocese program funding (own ledger)',
    hasOwnLedger: true,
  },
];

function cents(n: number): bigint {
  return BigInt(Math.round(n));
}

function dateOnly(iso: string): Date {
  return new Date(iso);
}


async function createPostedJournal(
  prisma: PrismaClient,
  data: {
    id: string;
    dioceseId: string;
    parishId: string | null;
    ownerType: LedgerOwnerType;
    ownerId: string;
    periodId: string;
    entryDate: Date;
    description: string;
    source: 'MANUAL' | 'DONATION' | 'VENDOR_BILL' | 'PAYMENT' | 'REVERSAL' | 'STRIPE' | 'BATCH_ADJUSTMENT';
    cashImpact: boolean;
    actorUserId: string;
    lines: Array<{ accountId: string; direction: 'DEBIT' | 'CREDIT'; amountCents: bigint; memo?: string }>;
  },
) {
  // Insert as DRAFT so line insert is allowed; then flip to POSTED.
  await prisma.journalEntry.create({
    data: {
      id: data.id,
      dioceseId: data.dioceseId,
      parishId: data.parishId,
      ownerType: data.ownerType,
      ownerId: data.ownerId,
      periodId: data.periodId,
      entryDate: data.entryDate,
      description: data.description,
      source: data.source,
      status: 'DRAFT',
      cashImpact: data.cashImpact,
      createdByUserId: data.actorUserId,
      lines: {
        create: data.lines.map((l) => ({
          accountId: l.accountId,
          direction: l.direction,
          amountCents: l.amountCents,
          memo: l.memo ?? null,
        })),
      },
    },
  });

  // DB trigger assert_journal_approved: MANUAL journals cannot reach POSTED
  // without an APPROVED/AUTO_APPROVED ApprovalRequest (system sources exempt).
  if (data.source === 'MANUAL') {
    const amountCents = data.lines
      .filter((l) => l.direction === 'DEBIT')
      .reduce((sum, l) => sum + l.amountCents, BigInt(0));
    await prisma.approvalRequest.create({
      data: {
        dioceseId: data.dioceseId,
        parishId: data.parishId,
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        entityKind: 'JOURNAL',
        entityId: data.id,
        makerUserId: data.actorUserId,
        amountCents,
        status: 'AUTO_APPROVED',
        requiredApprovals: 0,
      },
    });
  }

  await prisma.journalEntry.update({
    where: { id: data.id },
    data: {
      status: 'POSTED',
      postedAt: new Date(),
      postedByUserId: data.actorUserId,
    },
  });
}


async function ensureDioceseOrgs(
  prisma: PrismaClient,
  dioceseId: string,
  leaderMemberId: string | null,
): Promise<Array<{ id: string; name: string; hasOwnLedger: boolean }>> {
  const existing = await prisma.organization.findMany({
    where: { dioceseId, parishId: null },
    select: { id: true, name: true, hasOwnLedger: true },
  });
  if (existing.length >= DIOCESE_ORG_DEFS.length) {
    // Ensure ledgers enabled on known names
    for (const def of DIOCESE_ORG_DEFS) {
      await prisma.organization.updateMany({
        where: { dioceseId, parishId: null, name: def.name },
        data: { hasOwnLedger: def.hasOwnLedger },
      });
    }
    return prisma.organization.findMany({
      where: { dioceseId, parishId: null },
      select: { id: true, name: true, hasOwnLedger: true },
    });
  }

  const created: Array<{ id: string; name: string; hasOwnLedger: boolean }> =
    [...existing];

  for (const def of DIOCESE_ORG_DEFS) {
    if (existing.some((o) => o.name === def.name)) continue;
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        dioceseId,
        parishId: null,
        name: def.name,
        description: def.description,
        organizationType: def.organizationType,
        membershipMode: 'OPEN',
        hasOwnLedger: def.hasOwnLedger,
        isActive: true,
      },
    });
    // Skip OrganizationOfficer for diocese-scoped orgs: Phase 3 officer
    // policies assume parish context; ledger ownership does not need officers.
    void leaderMemberId;
    created.push({ id, name: def.name, hasOwnLedger: def.hasOwnLedger });
  }

  return created;
}

/** Ensure parish ministry orgs that map to programs have own ledgers. */
async function ensureParishProgramOrgs(
  prisma: PrismaClient,
  dioceseId: string,
  parish: FinanceParishBundle,
): Promise<void> {
  const programOrgNames = [
    {
      name: `${parish.name.split(' ')[0]} Youth Program Fund`,
      organizationType: 'AUXILIARY' as const,
      description: 'Books for youth program activities',
    },
    {
      name: `${parish.name.split(' ')[0]} Faith Formation Fund`,
      organizationType: 'MINISTRY' as const,
      description: 'Books for Sunday school / faith formation',
    },
  ];

  for (const def of programOrgNames) {
    const found = await prisma.organization.findFirst({
      where: { parishId: parish.id, name: def.name },
    });
    if (found) {
      if (!found.hasOwnLedger) {
        await prisma.organization.update({
          where: { id: found.id },
          data: { hasOwnLedger: true },
        });
      }
      continue;
    }
    const leader = parish.members[0];
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        dioceseId,
        parishId: parish.id,
        name: def.name,
        description: def.description,
        organizationType: def.organizationType,
        membershipMode: 'OPEN',
        hasOwnLedger: true,
        isActive: true,
      },
    });
    if (leader) {
      await prisma.organizationMembership.create({
        data: {
          dioceseId,
          parishId: parish.id,
          organizationId: id,
          memberId: leader.id,
          role: 'LEADER',
          organizationType: def.organizationType,
          membershipMode: 'OPEN',
        },
      });
      await prisma.organizationOfficer.create({
        data: {
          dioceseId,
          parishId: parish.id,
          organizationId: id,
          memberId: leader.id,
          title: 'Treasurer',
          isActive: true,
          termStart: new Date(),
        },
      });
    }
  }
}

async function seedLedgerSkeleton(
  prisma: PrismaClient,
  ledger: LedgerCtx,
): Promise<ChartIds> {
  await seedDefaultChart(prisma, {
    ownerType: ledger.ownerType,
    ownerId: ledger.ownerId,
    dioceseId: ledger.dioceseId,
    parishId: ledger.parishId,
  });

  const accounts = await prisma.account.findMany({
    where: {
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
    },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const funds = await prisma.fund.findMany({
    where: {
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
    },
  });
  const fundByName = new Map(funds.map((f) => [f.name, f]));

  const periodId = randomUUID();
  const priorPeriodId = randomUUID();
  await prisma.accountingPeriod.createMany({
    data: [
      {
        id: priorPeriodId,
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        startDate: dateOnly('2025-01-01'),
        endDate: dateOnly('2025-12-31'),
        status: 'CLOSED',
        closedAt: dateOnly('2026-01-05'),
        closedByUserId: ledger.actorUserId,
      },
      {
        id: periodId,
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        startDate: dateOnly('2026-01-01'),
        endDate: dateOnly('2026-12-31'),
        status: 'OPEN',
      },
    ],
  });

  // Opening / sample journals (balanced) — current period
  const samples: Array<{
    description: string;
    debitCode: string;
    creditCode: string;
    amount: number;
    cashImpact: boolean;
    source:
      | 'MANUAL'
      | 'DONATION'
      | 'VENDOR_BILL'
      | 'PAYMENT'
      | 'REVERSAL';
  }> = [
    {
      description: `${ledger.label}: opening cash position`,
      debitCode: '1000',
      creditCode: '3000',
      amount: 50_000_00,
      cashImpact: true,
      source: 'MANUAL',
    },
    {
      description: `${ledger.label}: utilities expense accrual`,
      debitCode: '5100',
      creditCode: '2000',
      amount: 1_250_00,
      cashImpact: false,
      source: 'VENDOR_BILL',
    },
    {
      description: `${ledger.label}: pay utilities`,
      debitCode: '2000',
      creditCode: '1000',
      amount: 1_250_00,
      cashImpact: true,
      source: 'PAYMENT',
    },
  ];

  for (const s of samples) {
    const debit = byCode.get(s.debitCode);
    const credit = byCode.get(s.creditCode);
    if (!debit || !credit) continue;
    await createPostedJournal(prisma, {
      id: randomUUID(),
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      periodId,
      entryDate: dateOnly('2026-03-15'),
      description: s.description,
      source: s.source,
      cashImpact: s.cashImpact,
      actorUserId: ledger.actorUserId,
      lines: [
        {
          accountId: debit.id,
          direction: 'DEBIT',
          amountCents: cents(s.amount),
        },
        {
          accountId: credit.id,
          direction: 'CREDIT',
          amountCents: cents(s.amount),
        },
      ],
    });
  }

  // Approval policy per entity kind
  for (const entityKind of ['JOURNAL', 'VENDOR_BILL', 'PAYMENT'] as const) {
    await prisma.approvalPolicy.create({
      data: {
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        entityKind,
        mode: entityKind === 'JOURNAL' ? 'THRESHOLD_BASED' : 'HYBRID',
        thresholdCents: cents(5_000_00),
        minApprovals: 1,
        approverRoles: [
          'PARISH_ADMIN',
          'DIOCESE_ADMIN',
          'ORGANIZATION_LEADER',
        ] as Role[],
        sensitiveKinds:
          entityKind === 'PAYMENT' ? ['PAYMENT'] : [],
      },
    });
  }

  // Budget for fiscal year
  const budgetId = randomUUID();
  await prisma.budget.create({
    data: {
      id: budgetId,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      fiscalYear: 2026,
      status: 'APPROVED',
      lines: {
        create: [
          {
            accountId: byCode.get('4000')!.id,
            originalCents: cents(200_000_00),
            revisedCents: cents(210_000_00),
          },
          {
            accountId: byCode.get('5000')!.id,
            originalCents: cents(80_000_00),
            revisedCents: cents(82_000_00),
          },
          {
            accountId: byCode.get('5100')!.id,
            originalCents: cents(12_000_00),
            revisedCents: cents(12_000_00),
          },
        ],
      },
    },
  });

  return {
    cashId: byCode.get('1000')!.id,
    buildingCashId: byCode.get('1010')!.id,
    incomeId: byCode.get('4000')!.id,
    buildingIncomeId: byCode.get('4100')!.id,
    expenseUtilitiesId: byCode.get('5100')!.id,
    expenseSalariesId: byCode.get('5000')!.id,
    apId: byCode.get('2000')!.id,
    fundGeneralId: fundByName.get('General')!.id,
    fundBuildingId: fundByName.get('Building')!.id,
    fundMissionsId: fundByName.get('Missions')!.id,
    periodId,
    priorPeriodId,
  };
}

async function seedGivingCategories(prisma: PrismaClient, ledger: LedgerCtx) {
  const accounts = await prisma.account.findMany({
    where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId, type: 'INCOME' },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const defs = [
    { name: 'Subscription', code: '4110', section: 'Church Operation', sortOrder: 1 },
    { name: 'Offertory (Plate)', code: '4120', section: 'Church Operation', sortOrder: 2 },
    { name: 'Birthday Offertory', code: '4130', section: 'Church Operation', sortOrder: 3 },
    { name: 'Christmas Donation', code: '4140', section: 'Church Operation', sortOrder: 4 },
    { name: 'Special Donation', code: '4150', section: 'Church Operation', sortOrder: 5 },
    { name: 'Wedding Anniversary Offertory', code: '4160', section: 'Church Operation', sortOrder: 6 },
    { name: 'Harvest (Donation/Auction)', code: '4210', section: 'Mission Fund', sortOrder: 1 },
  ];
  for (const d of defs) {
    const account = byCode.get(d.code);
    if (!account) continue;
    const existing = await prisma.givingCategory.findFirst({
      where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId, name: d.name },
    });
    if (existing) continue;
    await prisma.givingCategory.create({
      data: {
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        name: d.name,
        section: d.section,
        sortOrder: d.sortOrder,
        fundId: account.fundId,
        incomeAccountId: account.id,
      },
    });
  }
}

async function seedParishGiving(
  prisma: PrismaClient,
  dioceseId: string,
  parish: FinanceParishBundle,
  chart: ChartIds,
  actorUserId: string,
): Promise<{ donations: number; campaigns: number; pledges: number }> {
  // Envelope numbers on first 8 families
  for (let i = 0; i < Math.min(8, parish.families.length); i++) {
    await prisma.family.update({
      where: { id: parish.families[i]!.id },
      data: { envelopeNumber: String(100 + i) },
    });
  }

  const external1 = randomUUID();
  const external2 = randomUUID();
  await prisma.externalDonor.createMany({
    data: [
      {
        id: external1,
        dioceseId,
        parishId: parish.id,
        name: 'Visitor — John Guest',
        email: 'john.guest@example.com',
        notes: 'Attended Christmas service',
      },
      {
        id: external2,
        dioceseId,
        parishId: parish.id,
        name: 'Acme Foundation',
        email: 'grants@acme.example',
        address: '1 Corporate Way',
      },
    ],
  });

  const campaignAnnual = randomUUID();
  const campaignBuilding = randomUUID();
  await prisma.campaign.createMany({
    data: [
      {
        id: campaignAnnual,
        dioceseId,
        parishId: parish.id,
        name: `${parish.name.split(' ')[0]} Annual Stewardship 2026`,
        description: 'General operating campaign',
        fundId: chart.fundGeneralId,
        accountId: chart.incomeId,
        goalCents: cents(150_000_00),
        startDate: dateOnly('2026-01-01'),
        endDate: dateOnly('2026-12-31'),
        status: 'ACTIVE',
      },
      {
        id: campaignBuilding,
        dioceseId,
        parishId: parish.id,
        name: `${parish.name.split(' ')[0]} Building Appeal`,
        description: 'Sanctuary renovations',
        fundId: chart.fundBuildingId,
        accountId: chart.buildingIncomeId,
        goalCents: cents(500_000_00),
        startDate: dateOnly('2026-02-01'),
        endDate: dateOnly('2026-11-30'),
        status: 'ACTIVE',
      },
    ],
  });

  // Pledges
  let pledges = 0;
  for (let i = 0; i < Math.min(5, parish.families.length); i++) {
    const fam = parish.families[i]!;
    const member = parish.members.find((m) => m.familyId === fam.id);
    await prisma.pledge.create({
      data: {
        dioceseId,
        parishId: parish.id,
        campaignId: campaignAnnual,
        familyId: fam.id,
        memberId: i % 2 === 0 ? (member?.id ?? null) : null,
        amountCents: cents((2_000 + i * 500) * 100),
        fulfilledCents: cents((500 + i * 100) * 100),
        frequency: i % 2 === 0 ? 'MONTHLY' : 'ANNUAL',
        status: 'ACTIVE',
        startDate: dateOnly('2026-01-01'),
        endDate: dateOnly('2026-12-31'),
      },
    });
    pledges += 1;
  }

  // Sunday offering batch + donations covering all methods
  const batchId = randomUUID();
  await prisma.donationBatch.create({
    data: {
      id: batchId,
      dioceseId,
      parishId: parish.id,
      ownerType: 'PARISH',
      ownerId: parish.id,
      batchDate: dateOnly('2026-06-01'),
      label: '2026-06-01 Sunday Offering',
      status: 'POSTED',
      totalCents: cents(0),
      donationCount: 0,
      depositReference: 'DEP-SEED-001',
    },
  });

  let donations = 0;
  let batchTotal = 0n;

  const giftSpecs: Array<{
    method: DonationMethod;
    amount: number;
    familyIdx?: number;
    member?: boolean;
    externalId?: string;
    anonymous?: boolean;
    campaignId?: string;
    fundId: string;
    incomeAccountId: string;
    cashAccountId: string;
    checkNumber?: string;
    externalTxnId?: string;
    dedication?: string;
    inBatch?: boolean;
  }> = [
    {
      method: 'CASH',
      amount: 125_00,
      anonymous: true,
      fundId: chart.fundGeneralId,
      incomeAccountId: chart.incomeId,
      cashAccountId: chart.cashId,
      inBatch: true,
    },
    {
      method: 'CHECK',
      amount: 500_00,
      familyIdx: 0,
      checkNumber: '4521',
      fundId: chart.fundGeneralId,
      incomeAccountId: chart.incomeId,
      cashAccountId: chart.cashId,
      inBatch: true,
      campaignId: campaignAnnual,
    },
    {
      method: 'ZELLE',
      amount: 200_00,
      familyIdx: 1,
      member: true,
      externalTxnId: `zelle-seed-${parish.id.slice(0, 8)}-1`,
      fundId: chart.fundGeneralId,
      incomeAccountId: chart.incomeId,
      cashAccountId: chart.cashId,
    },
    {
      method: 'ACH',
      amount: 750_00,
      familyIdx: 2,
      externalTxnId: `ach-seed-${parish.id.slice(0, 8)}-1`,
      fundId: chart.fundBuildingId,
      incomeAccountId: chart.buildingIncomeId,
      cashAccountId: chart.buildingCashId,
      campaignId: campaignBuilding,
    },
    {
      method: 'CARD',
      amount: 100_00,
      familyIdx: 0,
      member: true,
      externalTxnId: `card-seed-${parish.id.slice(0, 8)}-1`,
      fundId: chart.fundGeneralId,
      incomeAccountId: chart.incomeId,
      cashAccountId: chart.cashId,
      campaignId: campaignAnnual,
    },
    {
      method: 'STOCK',
      amount: 2_500_00,
      externalId: external2,
      fundId: chart.fundMissionsId,
      incomeAccountId: chart.incomeId,
      cashAccountId: chart.cashId,
      dedication: 'In memory of parish founders',
    },
    {
      method: 'OTHER',
      amount: 50_00,
      externalId: external1,
      fundId: chart.fundGeneralId,
      incomeAccountId: chart.incomeId,
      cashAccountId: chart.cashId,
    },
    {
      method: 'CHECK',
      amount: 300_00,
      familyIdx: 3,
      checkNumber: '8890',
      fundId: chart.fundGeneralId,
      incomeAccountId: chart.incomeId,
      cashAccountId: chart.cashId,
      // split gift: also allocate via second fund in create below
      inBatch: true,
    },
  ];

  for (const g of giftSpecs) {
    const fam =
      g.familyIdx != null ? parish.families[g.familyIdx] : undefined;
    const member =
      g.member && fam
        ? parish.members.find((m) => m.familyId === fam.id)
        : undefined;

    const amount = cents(g.amount);
    const journalId = randomUUID();
    await createPostedJournal(prisma, {
      id: journalId,
      dioceseId,
      parishId: parish.id,
      ownerType: 'PARISH',
      ownerId: parish.id,
      periodId: chart.periodId,
      entryDate: dateOnly('2026-06-01'),
      description: `Donation ${g.method}${g.checkNumber ? ` #${g.checkNumber}` : ''}`,
      source: 'DONATION',
      cashImpact: true,
      actorUserId,
      lines: [
        {
          accountId: g.cashAccountId,
          direction: 'DEBIT',
          amountCents: amount,
        },
        {
          accountId: g.incomeAccountId,
          direction: 'CREDIT',
          amountCents: amount,
        },
      ],
    });

    const donationId = randomUUID();
    const isSplit = g.checkNumber === '8890';
    await prisma.donation.create({
      data: {
        id: donationId,
        dioceseId,
        parishId: parish.id,
        familyId: g.anonymous || g.externalId ? null : (fam?.id ?? null),
        memberId: g.anonymous || g.externalId ? null : (member?.id ?? null),
        externalDonorId: g.externalId ?? null,
        isAnonymous: g.anonymous === true,
        fundId: g.fundId,
        campaignId: g.campaignId ?? null,
        periodId: chart.periodId,
        batchId: g.inBatch ? batchId : null,
        amountCents: amount,
        method: g.method,
        checkNumber: g.checkNumber ?? null,
        externalTxnId: g.externalTxnId ?? null,
        dedication: g.dedication ?? null,
        receivedAt: dateOnly('2026-06-01'),
        status: 'ACTIVE',
        journalEntryId: journalId,
        allocations: {
          create: isSplit
            ? [
                {
                  fundId: chart.fundGeneralId,
                  amountCents: cents(200_00),
                },
                {
                  fundId: chart.fundBuildingId,
                  amountCents: cents(100_00),
                },
              ]
            : [{ fundId: g.fundId, amountCents: amount }],
        },
      },
    });
    donations += 1;
    if (g.inBatch) batchTotal += amount;
  }

  await prisma.donationBatch.update({
    where: { id: batchId },
    data: {
      totalCents: batchTotal,
      donationCount: giftSpecs.filter((g) => g.inBatch).length,
    },
  });

  // Vendor + bill + payment on parish books
  const vendorId = randomUUID();
  await prisma.vendor.create({
    data: {
      id: vendorId,
      dioceseId,
      parishId: parish.id,
      name: `${parish.name.split(' ')[0]} Utilities Co`,
      email: 'billing@utilities.example',
      isActive: true,
    },
  });
  const billId = randomUUID();
  const billJe = randomUUID();
  await createPostedJournal(prisma, {
    id: billJe,
    dioceseId,
    parishId: parish.id,
    ownerType: 'PARISH',
    ownerId: parish.id,
    periodId: chart.periodId,
    entryDate: dateOnly('2026-05-01'),
    description: 'Electric bill accrual',
    source: 'VENDOR_BILL',
    cashImpact: false,
    actorUserId,
    lines: [
      {
        accountId: chart.expenseUtilitiesId,
        direction: 'DEBIT',
        amountCents: cents(875_00),
      },
      {
        accountId: chart.apId,
        direction: 'CREDIT',
        amountCents: cents(875_00),
      },
    ],
  });
  await prisma.vendorBill.create({
    data: {
      id: billId,
      dioceseId,
      parishId: parish.id,
      ownerType: 'PARISH',
      ownerId: parish.id,
      vendorId,
      amountCents: cents(875_00),
      description: 'May electric service',
      invoiceNumber: 'UTIL-2026-05',
      billDate: dateOnly('2026-05-01'),
      dueDate: dateOnly('2026-05-25'),
      status: 'POSTED',
      journalEntryId: billJe,
    },
  });
  const payJe = randomUUID();
  await createPostedJournal(prisma, {
    id: payJe,
    dioceseId,
    parishId: parish.id,
    ownerType: 'PARISH',
    ownerId: parish.id,
    periodId: chart.periodId,
    entryDate: dateOnly('2026-05-20'),
    description: 'Pay electric bill',
    source: 'PAYMENT',
    cashImpact: true,
    actorUserId,
    lines: [
      {
        accountId: chart.apId,
        direction: 'DEBIT',
        amountCents: cents(875_00),
      },
      {
        accountId: chart.cashId,
        direction: 'CREDIT',
        amountCents: cents(875_00),
      },
    ],
  });
  await prisma.payment.create({
    data: {
      dioceseId,
      parishId: parish.id,
      ownerType: 'PARISH',
      ownerId: parish.id,
      vendorBillId: billId,
      amountCents: cents(875_00),
      method: 'ACH',
      paidAt: dateOnly('2026-05-20'),
      journalEntryId: payJe,
    },
  });
  await prisma.vendorBill.update({
    where: { id: billId },
    data: { status: 'PAID' },
  });

  // Bank recon sample
  const runId = randomUUID();
  await prisma.reconciliationRun.create({
    data: {
      id: runId,
      dioceseId,
      parishId: parish.id,
      ownerType: 'PARISH',
      ownerId: parish.id,
      status: 'OPEN',
      matchedCount: 0,
      unmatchedCount: 2,
      lines: {
        create: [
          {
            dioceseId,
            parishId: parish.id,
            ownerType: 'PARISH',
            ownerId: parish.id,
            postedDate: dateOnly('2026-06-02'),
            amountCents: cents(500_00),
            descriptionRaw: 'CHECK DEPOSIT 4521',
            status: 'UNMATCHED',
          },
          {
            dioceseId,
            parishId: parish.id,
            ownerType: 'PARISH',
            ownerId: parish.id,
            postedDate: dateOnly('2026-06-03'),
            amountCents: cents(-875_00),
            descriptionRaw: 'ACH UTILITIES',
            status: 'UNMATCHED',
          },
        ],
      },
    },
  });

  return { donations, campaigns: 2, pledges };
}

async function seedDioceseGiving(
  prisma: PrismaClient,
  dioceseId: string,
  chart: ChartIds,
  actorUserId: string,
): Promise<{ donations: number; campaigns: number }> {
  const campaignId = randomUUID();
  await prisma.campaign.create({
    data: {
      id: campaignId,
      dioceseId,
      parishId: null,
      name: 'Diocese Missions Appeal 2026',
      description: 'Diocese-level missions fundraising',
      fundId: chart.fundMissionsId,
      accountId: chart.incomeId,
      goalCents: cents(1_000_000_00),
      startDate: dateOnly('2026-01-01'),
      endDate: dateOnly('2026-12-31'),
      status: 'ACTIVE',
    },
  });

  const externalId = randomUUID();
  await prisma.externalDonor.create({
    data: {
      id: externalId,
      dioceseId,
      parishId: null,
      name: 'Mar Thoma Mission Partner Org',
      email: 'partner@missions.example',
    },
  });

  const amount = cents(10_000_00);
  const journalId = randomUUID();
  await createPostedJournal(prisma, {
    id: journalId,
    dioceseId,
    parishId: null,
    ownerType: 'DIOCESE',
    ownerId: dioceseId,
    periodId: chart.periodId,
    entryDate: dateOnly('2026-04-10'),
    description: 'Diocese mission gift (external)',
    source: 'DONATION',
    cashImpact: true,
    actorUserId,
    lines: [
      {
        accountId: chart.cashId,
        direction: 'DEBIT',
        amountCents: amount,
      },
      {
        accountId: chart.incomeId,
        direction: 'CREDIT',
        amountCents: amount,
      },
    ],
  });
  await prisma.donation.create({
    data: {
      dioceseId,
      parishId: null,
      externalDonorId: externalId,
      fundId: chart.fundMissionsId,
      campaignId,
      periodId: chart.periodId,
      amountCents: amount,
      method: 'ACH',
      externalTxnId: 'diocese-ach-seed-1',
      receivedAt: dateOnly('2026-04-10'),
      status: 'ACTIVE',
      journalEntryId: journalId,
      allocations: {
        create: [{ fundId: chart.fundMissionsId, amountCents: amount }],
      },
    },
  });

  return { donations: 1, campaigns: 1 };
}

export async function seedFinanceData(
  prisma: PrismaClient,
  input: FinanceSeedInput,
): Promise<FinanceSeedCounts> {
  const counts: FinanceSeedCounts = {
    ledgers: 0,
    funds: 0,
    accounts: 0,
    periods: 0,
    journals: 0,
    donations: 0,
    campaigns: 0,
    pledges: 0,
    vendors: 0,
    budgets: 0,
    dioceseOrgs: 0,
    externalDonors: 0,
  };

  const leaderMember =
    input.parishes[0]?.members[0]?.id ??
    (
      await prisma.member.findFirst({
        where: { dioceseId: input.dioceseId, status: 'ACTIVE' },
        select: { id: true },
      })
    )?.id ??
    null;

  // Diocese orgs (create if missing)
  const dioceseOrgs = await ensureDioceseOrgs(
    prisma,
    input.dioceseId,
    leaderMember,
  );
  counts.dioceseOrgs = dioceseOrgs.length;

  // Parish program-linked orgs with ledgers
  for (const parish of input.parishes) {
    await ensureParishProgramOrgs(prisma, input.dioceseId, parish);
  }

  // Ensure remaining parish AUXILIARY orgs keep hasOwnLedger (from main seed)
  await prisma.organization.updateMany({
    where: {
      dioceseId: input.dioceseId,
      parishId: { not: null },
      organizationType: { in: ['AUXILIARY', 'MINISTRY'] },
    },
    data: { hasOwnLedger: true },
  });

  const ledgerTargets: LedgerCtx[] = [
    {
      ownerType: 'DIOCESE',
      ownerId: input.dioceseId,
      dioceseId: input.dioceseId,
      parishId: null,
      actorUserId: input.dioceseAdminId,
      label: 'Diocese',
    },
  ];

  for (const org of dioceseOrgs.filter((o) => o.hasOwnLedger)) {
    ledgerTargets.push({
      ownerType: 'ORGANIZATION',
      ownerId: org.id,
      dioceseId: input.dioceseId,
      parishId: null,
      actorUserId: input.dioceseStaffId,
      label: org.name,
    });
  }

  for (const parish of input.parishes) {
    ledgerTargets.push({
      ownerType: 'PARISH',
      ownerId: parish.id,
      dioceseId: input.dioceseId,
      parishId: parish.id,
      actorUserId: parish.adminUserId,
      label: parish.name,
    });
  }

  const parishOrgs = await prisma.organization.findMany({
    where: {
      dioceseId: input.dioceseId,
      parishId: { not: null },
      hasOwnLedger: true,
      isActive: true,
    },
    select: { id: true, name: true, parishId: true },
  });

  for (const org of parishOrgs) {
    const parish = input.parishes.find((p) => p.id === org.parishId);
    ledgerTargets.push({
      ownerType: 'ORGANIZATION',
      ownerId: org.id,
      dioceseId: input.dioceseId,
      parishId: org.parishId,
      actorUserId: parish?.adminUserId ?? input.dioceseAdminId,
      label: org.name,
    });
  }

  // Seed each ledger (chart + period + sample JE + policies + budget)
  const parishCharts = new Map<string, ChartIds>();
  let dioceseChart: ChartIds | null = null;

  for (const ledger of ledgerTargets) {
    const chart = await seedLedgerSkeleton(prisma, ledger);
    await seedGivingCategories(prisma, ledger);
    counts.ledgers += 1;
    if (ledger.ownerType === 'DIOCESE') dioceseChart = chart;
    if (ledger.ownerType === 'PARISH' && ledger.parishId) {
      parishCharts.set(ledger.parishId, chart);
    }
  }

  // Diocese-level giving
  if (dioceseChart) {
    const d = await seedDioceseGiving(
      prisma,
      input.dioceseId,
      dioceseChart,
      input.dioceseAdminId,
    );
    counts.donations += d.donations;
    counts.campaigns += d.campaigns;
  }

  // Parish giving + vendors (first 3 parishes full; others lighter)
  for (let i = 0; i < input.parishes.length; i++) {
    const parish = input.parishes[i]!;
    const chart = parishCharts.get(parish.id);
    if (!chart) continue;
    if (i < 3) {
      const g = await seedParishGiving(
        prisma,
        input.dioceseId,
        parish,
        chart,
        parish.adminUserId,
      );
      counts.donations += g.donations;
      counts.campaigns += g.campaigns;
      counts.pledges += g.pledges;
    } else {
      // Light sample: one cash anonymous donation
      const amount = cents(75_00);
      const journalId = randomUUID();
      await createPostedJournal(prisma, {
        id: journalId,
        dioceseId: input.dioceseId,
        parishId: parish.id,
        ownerType: 'PARISH',
        ownerId: parish.id,
        periodId: chart.periodId,
        entryDate: dateOnly('2026-06-08'),
        description: 'Plate cash',
        source: 'DONATION',
        cashImpact: true,
        actorUserId: parish.adminUserId,
        lines: [
          {
            accountId: chart.cashId,
            direction: 'DEBIT',
            amountCents: amount,
          },
          {
            accountId: chart.incomeId,
            direction: 'CREDIT',
            amountCents: amount,
          },
        ],
      });
      await prisma.donation.create({
        data: {
          dioceseId: input.dioceseId,
          parishId: parish.id,
          isAnonymous: true,
          fundId: chart.fundGeneralId,
          periodId: chart.periodId,
          amountCents: amount,
          method: 'CASH',
          receivedAt: dateOnly('2026-06-08'),
          status: 'ACTIVE',
          journalEntryId: journalId,
          allocations: {
            create: [
              { fundId: chart.fundGeneralId, amountCents: amount },
            ],
          },
        },
      });
      counts.donations += 1;
    }
  }

  // Org-ledger sample donation (first parish org with ledger) — expense JE already from skeleton
  const firstOrg = parishOrgs[0];
  if (firstOrg) {
    const orgAccounts = await prisma.account.findMany({
      where: {
        ownerType: 'ORGANIZATION',
        ownerId: firstOrg.id,
      },
    });
    const cash = orgAccounts.find((a) => a.code === '1000');
    const income = orgAccounts.find((a) => a.code === '4000');
    const period = await prisma.accountingPeriod.findFirst({
      where: {
        ownerType: 'ORGANIZATION',
        ownerId: firstOrg.id,
        status: 'OPEN',
      },
    });
    if (cash && income && period) {
      const amount = cents(250_00);
      await createPostedJournal(prisma, {
        id: randomUUID(),
        dioceseId: input.dioceseId,
        parishId: firstOrg.parishId,
        ownerType: 'ORGANIZATION',
        ownerId: firstOrg.id,
        periodId: period.id,
        entryDate: dateOnly('2026-05-10'),
        description: `${firstOrg.name} fundraising event`,
        source: 'MANUAL',
        cashImpact: true,
        actorUserId: input.dioceseAdminId,
        lines: [
          {
            accountId: cash.id,
            direction: 'DEBIT',
            amountCents: amount,
          },
          {
            accountId: income.id,
            direction: 'CREDIT',
            amountCents: amount,
          },
        ],
      });
    }
  }

  counts.funds = await prisma.fund.count();
  counts.accounts = await prisma.account.count();
  counts.periods = await prisma.accountingPeriod.count();
  counts.journals = await prisma.journalEntry.count();
  counts.vendors = await prisma.vendor.count();
  counts.budgets = await prisma.budget.count();
  counts.externalDonors = await prisma.externalDonor.count();
  // donations/campaigns/pledges already tallied partially — refresh absolute
  counts.donations = await prisma.donation.count();
  counts.campaigns = await prisma.campaign.count();
  counts.pledges = await prisma.pledge.count();

  void DONATION_METHODS; // covered by giftSpecs methods
  return counts;
}
