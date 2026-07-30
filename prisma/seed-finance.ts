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
  Prisma,
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
        // Every giving-category income account and every expense account gets a
        // line so the R6 Receipts & Payments report shows a budget column on
        // each row rather than a column of dashes.
        create: [
          { code: '4000', original: 200_000_00, revised: 210_000_00 },
          { code: '4110', original: 90_000_00, revised: 92_000_00 },
          { code: '4120', original: 40_000_00, revised: 41_000_00 },
          { code: '4130', original: 6_000_00, revised: 6_000_00 },
          { code: '4140', original: 12_000_00, revised: 12_500_00 },
          { code: '4150', original: 15_000_00, revised: 15_000_00 },
          { code: '4160', original: 4_000_00, revised: 4_000_00 },
          { code: '4100', original: 60_000_00, revised: 65_000_00 },
          { code: '4200', original: 25_000_00, revised: 25_000_00 },
          { code: '4210', original: 18_000_00, revised: 19_000_00 },
          { code: '5000', original: 80_000_00, revised: 82_000_00 },
          { code: '5100', original: 12_000_00, revised: 12_000_00 },
          { code: '5200', original: 22_000_00, revised: 23_500_00 },
          { code: '5300', original: 20_000_00, revised: 20_000_00 },
        ]
          .filter((line) => byCode.has(line.code))
          .map((line) => ({
            accountId: byCode.get(line.code)!.id,
            originalCents: cents(line.original),
            revisedCents: cents(line.revised),
          })),
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

// ── Bulk multi-year giving & operating history ─────────────────────────────
//
// The functions above build a small, hand-curated set of ledgers/journals for
// screenshot-friendly demo coverage. Everything below adds volume: several
// years of weekly parish offertory plus monthly vendor bill/payment cycles,
// batched via createMany so it stays fast against a remote database (each
// (ledger, year) combo is a handful of round trips regardless of row count).
//
// Deferred constraint triggers (journal_balanced, donation_allocations_sum)
// fire at the end of each createMany statement, so inserting all lines for a
// batch of entries in one call — after the parent entries already exist from
// a prior committed statement — validates correctly without extra ceremony.
// AccountingPeriod stays OPEN while its journal entries are inserted and
// posted, then flips to CLOSED once that year is done (the DB refuses writes
// into a CLOSED period).

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;

function rPick<T>(rand: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function rIntBetween(rand: Rng, min: number, max: number) {
  return min + Math.floor(rand() * (max - min + 1));
}
function rChance(rand: Rng, p: number) {
  return rand() < p;
}

/** 2025 reuses the existing (already CLOSED) prior period; 2026 reuses the existing OPEN period. */
const HISTORY_ALL_YEARS = [2021, 2022, 2023, 2024, 2025, 2026] as const;

const METHOD_WEIGHTS: Array<{ method: DonationMethod; weight: number }> = [
  { method: 'CHECK', weight: 30 },
  { method: 'CASH', weight: 25 },
  { method: 'ACH', weight: 20 },
  { method: 'CARD', weight: 15 },
  { method: 'ZELLE', weight: 6 },
  { method: 'OTHER', weight: 2 },
  { method: 'STOCK', weight: 2 },
];
function weightedMethod(rand: Rng): DonationMethod {
  const total = METHOD_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = rand() * total;
  for (const w of METHOD_WEIGHTS) {
    if (r < w.weight) return w.method;
    r -= w.weight;
  }
  return 'CASH';
}

function sundaysInYear(year: number): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCFullYear() === year) {
    out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function monthlyDate(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

async function ensureVendor(
  prisma: PrismaClient,
  dioceseId: string,
  parishId: string | null,
  name: string,
): Promise<string> {
  const existing = await prisma.vendor.findFirst({
    where: { dioceseId, parishId, name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const id = randomUUID();
  await prisma.vendor.create({
    data: { id, dioceseId, parishId, name, isActive: true },
  });
  return id;
}

async function ensurePartnerDonor(
  prisma: PrismaClient,
  dioceseId: string,
  name: string,
  email: string,
): Promise<string> {
  const existing = await prisma.externalDonor.findFirst({
    where: { dioceseId, parishId: null, name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const id = randomUUID();
  await prisma.externalDonor.create({
    data: { id, dioceseId, parishId: null, name, email },
  });
  return id;
}

type YearPeriod = { id: string; isHistorical: boolean };

async function getYearPeriod(
  prisma: PrismaClient,
  ledger: LedgerCtx,
  chart: ChartIds,
  year: number,
): Promise<YearPeriod> {
  if (year === 2026) return { id: chart.periodId, isHistorical: false };
  if (year === 2025) {
    await prisma.accountingPeriod.update({
      where: { id: chart.priorPeriodId },
      data: { status: 'OPEN' },
    });
    return { id: chart.priorPeriodId, isHistorical: true };
  }
  const id = randomUUID();
  await prisma.accountingPeriod.create({
    data: {
      id,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
      status: 'OPEN',
    },
  });
  return { id, isHistorical: true };
}

async function closeYearPeriod(
  prisma: PrismaClient,
  ledger: LedgerCtx,
  periodId: string,
) {
  await prisma.accountingPeriod.update({
    where: { id: periodId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedByUserId: ledger.actorUserId,
    },
  });
}

type HistoryCounts = {
  donations: number;
  journals: number;
  bills: number;
  payments: number;
};

/** One fiscal year of weekly offertory + monthly bill/payment cycles for one PARISH ledger. */
async function seedParishYearHistory(
  prisma: PrismaClient,
  ledger: LedgerCtx,
  chart: ChartIds,
  parishId: string,
  givers: Array<{ familyId: string; memberId: string | null }>,
  utilitiesVendorId: string,
  payrollVendorId: string,
  year: number,
  rand: Rng,
): Promise<HistoryCounts> {
  const period = await getYearPeriod(prisma, ledger, chart, year);

  const journalEntries: Prisma.JournalEntryCreateManyInput[] = [];
  const journalLines: Prisma.JournalLineCreateManyInput[] = [];
  const donations: Prisma.DonationCreateManyInput[] = [];
  const allocations: Prisma.DonationAllocationCreateManyInput[] = [];
  const bills: Prisma.VendorBillCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];

  let checkSeq = 1000 + (year % 100) * 10;

  for (const sunday of sundaysInYear(year)) {
    const numGifts = rIntBetween(rand, 5, 11);
    for (let g = 0; g < numGifts; g++) {
      const anonymous = rChance(rand, 0.12);
      const giver = anonymous ? undefined : rPick(rand, givers);
      const method = weightedMethod(rand);
      const toBuilding = rChance(rand, 0.1);
      const toMissions = !toBuilding && rChance(rand, 0.05);
      const fundId = toBuilding
        ? chart.fundBuildingId
        : toMissions
          ? chart.fundMissionsId
          : chart.fundGeneralId;
      const incomeAccountId = toBuilding ? chart.buildingIncomeId : chart.incomeId;
      const cashAccountId = toBuilding ? chart.buildingCashId : chart.cashId;
      const amount = cents(
        toBuilding
          ? rIntBetween(rand, 5_000, 150_000)
          : toMissions
            ? rIntBetween(rand, 2_000, 40_000)
            : rIntBetween(rand, 1_500, 60_000),
      );

      const entryId = randomUUID();
      const postedAt = new Date(sunday.getTime() + 2 * 24 * 3_600_000);
      journalEntries.push({
        id: entryId,
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        periodId: period.id,
        entryDate: sunday,
        description: `Donation ${method}`,
        source: 'DONATION',
        status: 'DRAFT',
        cashImpact: true,
        createdByUserId: ledger.actorUserId,
        postedByUserId: ledger.actorUserId,
        postedAt,
      });
      journalLines.push(
        {
          id: randomUUID(),
          journalEntryId: entryId,
          accountId: cashAccountId,
          direction: 'DEBIT',
          amountCents: amount,
        },
        {
          id: randomUUID(),
          journalEntryId: entryId,
          accountId: incomeAccountId,
          direction: 'CREDIT',
          amountCents: amount,
        },
      );

      const donationId = randomUUID();
      const isCheck = method === 'CHECK';
      const isElectronic = method === 'ACH' || method === 'CARD' || method === 'ZELLE';
      donations.push({
        id: donationId,
        dioceseId: ledger.dioceseId,
        parishId,
        familyId: giver?.familyId ?? null,
        memberId: giver?.memberId ?? null,
        isAnonymous: anonymous,
        fundId,
        periodId: period.id,
        amountCents: amount,
        method,
        checkNumber: isCheck ? String(checkSeq++) : null,
        externalTxnId: isElectronic
          ? `${method.toLowerCase()}-${parishId.slice(0, 8)}-${year}-${entryId.slice(0, 8)}`
          : null,
        receivedAt: sunday,
        status: 'ACTIVE',
        journalEntryId: entryId,
      });
      allocations.push({
        id: randomUUID(),
        donationId,
        fundId,
        amountCents: amount,
      });
    }
  }

  const monthlyOps: Array<{
    vendorId: string;
    expenseAccountId: string;
    label: string;
    baseAmount: number;
  }> = [
    { vendorId: utilitiesVendorId, expenseAccountId: chart.expenseUtilitiesId, label: 'Utilities', baseAmount: 60_000 },
    { vendorId: payrollVendorId, expenseAccountId: chart.expenseSalariesId, label: 'Payroll', baseAmount: 350_000 },
  ];

  for (let m = 0; m < 12; m++) {
    for (const op of monthlyOps) {
      const billDate = monthlyDate(year, m, 5);
      const dueDate = monthlyDate(year, m, 25);
      const payDate = monthlyDate(year, m, 20);
      const amount = cents(op.baseAmount + rIntBetween(rand, -5_000, 8_000));

      const billJeId = randomUUID();
      journalEntries.push({
        id: billJeId,
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        periodId: period.id,
        entryDate: billDate,
        description: `${op.label} bill accrual`,
        source: 'VENDOR_BILL',
        status: 'DRAFT',
        cashImpact: false,
        createdByUserId: ledger.actorUserId,
        postedByUserId: ledger.actorUserId,
        postedAt: billDate,
      });
      journalLines.push(
        {
          id: randomUUID(),
          journalEntryId: billJeId,
          accountId: op.expenseAccountId,
          direction: 'DEBIT',
          amountCents: amount,
        },
        {
          id: randomUUID(),
          journalEntryId: billJeId,
          accountId: chart.apId,
          direction: 'CREDIT',
          amountCents: amount,
        },
      );
      const billId = randomUUID();
      bills.push({
        id: billId,
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        vendorId: op.vendorId,
        amountCents: amount,
        description: `${op.label} — ${year}-${String(m + 1).padStart(2, '0')}`,
        invoiceNumber: `${op.label.slice(0, 3).toUpperCase()}-${year}-${String(m + 1).padStart(2, '0')}`,
        billDate,
        dueDate,
        status: 'PAID',
        journalEntryId: billJeId,
      });

      const payJeId = randomUUID();
      journalEntries.push({
        id: payJeId,
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        periodId: period.id,
        entryDate: payDate,
        description: `Pay ${op.label.toLowerCase()} bill`,
        source: 'PAYMENT',
        status: 'DRAFT',
        cashImpact: true,
        createdByUserId: ledger.actorUserId,
        postedByUserId: ledger.actorUserId,
        postedAt: payDate,
      });
      journalLines.push(
        {
          id: randomUUID(),
          journalEntryId: payJeId,
          accountId: chart.apId,
          direction: 'DEBIT',
          amountCents: amount,
        },
        {
          id: randomUUID(),
          journalEntryId: payJeId,
          accountId: chart.cashId,
          direction: 'CREDIT',
          amountCents: amount,
        },
      );
      payments.push({
        id: randomUUID(),
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        vendorBillId: billId,
        amountCents: amount,
        method: 'ACH',
        paidAt: payDate,
        journalEntryId: payJeId,
      });
    }
  }

  await prisma.journalEntry.createMany({ data: journalEntries });
  await prisma.journalLine.createMany({ data: journalLines });
  if (donations.length) await prisma.donation.createMany({ data: donations });
  if (allocations.length) await prisma.donationAllocation.createMany({ data: allocations });
  if (bills.length) await prisma.vendorBill.createMany({ data: bills });
  if (payments.length) await prisma.payment.createMany({ data: payments });

  await prisma.journalEntry.updateMany({
    where: {
      periodId: period.id,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      status: 'DRAFT',
    },
    data: { status: 'POSTED' },
  });

  if (period.isHistorical) {
    await closeYearPeriod(prisma, ledger, period.id);
  }

  return {
    donations: donations.length,
    journals: journalEntries.length,
    bills: bills.length,
    payments: payments.length,
  };
}

/** One fiscal year of lighter diocese-level giving + operating cycles for the DIOCESE ledger. */
async function seedDioceseYearHistory(
  prisma: PrismaClient,
  ledger: LedgerCtx,
  chart: ChartIds,
  opsVendorId: string,
  partnerDonorIds: string[],
  year: number,
  rand: Rng,
): Promise<HistoryCounts> {
  const period = await getYearPeriod(prisma, ledger, chart, year);

  const journalEntries: Prisma.JournalEntryCreateManyInput[] = [];
  const journalLines: Prisma.JournalLineCreateManyInput[] = [];
  const donations: Prisma.DonationCreateManyInput[] = [];
  const allocations: Prisma.DonationAllocationCreateManyInput[] = [];
  const bills: Prisma.VendorBillCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];

  const giftCount = rIntBetween(rand, 4, 8);
  for (let i = 0; i < giftCount; i++) {
    const month = rIntBetween(rand, 0, 11);
    const day = rIntBetween(rand, 1, 27);
    const receivedAt = monthlyDate(year, month, day);
    const method = rPick(rand, ['ACH', 'CHECK', 'STOCK'] as DonationMethod[]);
    const amount = cents(rIntBetween(rand, 100_000, 2_000_000));
    const donorId = rPick(rand, partnerDonorIds);

    const entryId = randomUUID();
    journalEntries.push({
      id: entryId,
      dioceseId: ledger.dioceseId,
      parishId: null,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      periodId: period.id,
      entryDate: receivedAt,
      description: `Diocese mission gift (${method})`,
      source: 'DONATION',
      status: 'DRAFT',
      cashImpact: true,
      createdByUserId: ledger.actorUserId,
      postedByUserId: ledger.actorUserId,
      postedAt: receivedAt,
    });
    journalLines.push(
      { id: randomUUID(), journalEntryId: entryId, accountId: chart.cashId, direction: 'DEBIT', amountCents: amount },
      { id: randomUUID(), journalEntryId: entryId, accountId: chart.incomeId, direction: 'CREDIT', amountCents: amount },
    );

    const donationId = randomUUID();
    donations.push({
      id: donationId,
      dioceseId: ledger.dioceseId,
      parishId: null,
      externalDonorId: donorId,
      fundId: chart.fundMissionsId,
      periodId: period.id,
      amountCents: amount,
      method,
      externalTxnId: `diocese-${method.toLowerCase()}-${year}-${entryId.slice(0, 8)}`,
      receivedAt,
      status: 'ACTIVE',
      journalEntryId: entryId,
    });
    allocations.push({ id: randomUUID(), donationId, fundId: chart.fundMissionsId, amountCents: amount });
  }

  for (let m = 0; m < 12; m++) {
    const billDate = monthlyDate(year, m, 3);
    const dueDate = monthlyDate(year, m, 20);
    const payDate = monthlyDate(year, m, 15);
    const amount = cents(180_000 + rIntBetween(rand, -10_000, 15_000));

    const billJeId = randomUUID();
    journalEntries.push({
      id: billJeId,
      dioceseId: ledger.dioceseId,
      parishId: null,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      periodId: period.id,
      entryDate: billDate,
      description: 'Diocese operations bill accrual',
      source: 'VENDOR_BILL',
      status: 'DRAFT',
      cashImpact: false,
      createdByUserId: ledger.actorUserId,
      postedByUserId: ledger.actorUserId,
      postedAt: billDate,
    });
    journalLines.push(
      { id: randomUUID(), journalEntryId: billJeId, accountId: chart.expenseSalariesId, direction: 'DEBIT', amountCents: amount },
      { id: randomUUID(), journalEntryId: billJeId, accountId: chart.apId, direction: 'CREDIT', amountCents: amount },
    );
    const billId = randomUUID();
    bills.push({
      id: billId,
      dioceseId: ledger.dioceseId,
      parishId: null,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      vendorId: opsVendorId,
      amountCents: amount,
      description: `Diocese operations — ${year}-${String(m + 1).padStart(2, '0')}`,
      invoiceNumber: `DIO-OPS-${year}-${String(m + 1).padStart(2, '0')}`,
      billDate,
      dueDate,
      status: 'PAID',
      journalEntryId: billJeId,
    });

    const payJeId = randomUUID();
    journalEntries.push({
      id: payJeId,
      dioceseId: ledger.dioceseId,
      parishId: null,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      periodId: period.id,
      entryDate: payDate,
      description: 'Pay diocese operations bill',
      source: 'PAYMENT',
      status: 'DRAFT',
      cashImpact: true,
      createdByUserId: ledger.actorUserId,
      postedByUserId: ledger.actorUserId,
      postedAt: payDate,
    });
    journalLines.push(
      { id: randomUUID(), journalEntryId: payJeId, accountId: chart.apId, direction: 'DEBIT', amountCents: amount },
      { id: randomUUID(), journalEntryId: payJeId, accountId: chart.cashId, direction: 'CREDIT', amountCents: amount },
    );
    payments.push({
      id: randomUUID(),
      dioceseId: ledger.dioceseId,
      parishId: null,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      vendorBillId: billId,
      amountCents: amount,
      method: 'ACH',
      paidAt: payDate,
      journalEntryId: payJeId,
    });
  }

  await prisma.journalEntry.createMany({ data: journalEntries });
  await prisma.journalLine.createMany({ data: journalLines });
  if (donations.length) await prisma.donation.createMany({ data: donations });
  if (allocations.length) await prisma.donationAllocation.createMany({ data: allocations });
  if (bills.length) await prisma.vendorBill.createMany({ data: bills });
  if (payments.length) await prisma.payment.createMany({ data: payments });

  await prisma.journalEntry.updateMany({
    where: {
      periodId: period.id,
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      status: 'DRAFT',
    },
    data: { status: 'POSTED' },
  });

  if (period.isHistorical) {
    await closeYearPeriod(prisma, ledger, period.id);
  }

  return {
    donations: donations.length,
    journals: journalEntries.length,
    bills: bills.length,
    payments: payments.length,
  };
}

export async function seedFinanceHistory(
  prisma: PrismaClient,
  input: {
    dioceseId: string;
    dioceseAdminId: string;
    dioceseChart: ChartIds | null;
    parishes: Array<{
      bundle: FinanceParishBundle;
      chart: ChartIds;
      actorUserId: string;
    }>;
  },
): Promise<HistoryCounts & { years: number }> {
  const rand = mulberry32(20260715);
  const totals: HistoryCounts = { donations: 0, journals: 0, bills: 0, payments: 0 };

  if (input.dioceseChart) {
    const ledger: LedgerCtx = {
      ownerType: 'DIOCESE',
      ownerId: input.dioceseId,
      dioceseId: input.dioceseId,
      parishId: null,
      actorUserId: input.dioceseAdminId,
      label: 'Diocese',
    };
    const opsVendorId = await ensureVendor(
      prisma,
      input.dioceseId,
      null,
      'Diocese Central Operations Vendor',
    );
    const partnerNames = [
      'Mar Thoma Mission Partner Org',
      'Heritage Foundation',
      'Friends of the Diocese',
      'St. Thomas Legacy Fund',
    ];
    const partners: string[] = [];
    for (const name of partnerNames) {
      partners.push(
        await ensurePartnerDonor(
          prisma,
          input.dioceseId,
          name,
          `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.org`,
        ),
      );
    }

    for (const year of HISTORY_ALL_YEARS) {
      const r = await seedDioceseYearHistory(
        prisma,
        ledger,
        input.dioceseChart,
        opsVendorId,
        partners,
        year,
        rand,
      );
      totals.donations += r.donations;
      totals.journals += r.journals;
      totals.bills += r.bills;
      totals.payments += r.payments;
    }
    console.log(`     Diocese: ${HISTORY_ALL_YEARS.length} fiscal years of history seeded`);
  }

  for (const p of input.parishes) {
    const ledger: LedgerCtx = {
      ownerType: 'PARISH',
      ownerId: p.bundle.id,
      dioceseId: input.dioceseId,
      parishId: p.bundle.id,
      actorUserId: p.actorUserId,
      label: p.bundle.name,
    };
    const givers = p.bundle.families
      .map((f) => ({
        familyId: f.id,
        memberId: p.bundle.members.find((m) => m.familyId === f.id)?.id ?? null,
      }))
      .filter((g): g is { familyId: string; memberId: string | null } => Boolean(g.familyId));
    if (!givers.length) continue;

    const utilitiesVendorId = await ensureVendor(
      prisma,
      input.dioceseId,
      p.bundle.id,
      `${p.bundle.name.split(' ')[0]} Utilities Co`,
    );
    const payrollVendorId = await ensureVendor(
      prisma,
      input.dioceseId,
      p.bundle.id,
      `${p.bundle.name.split(' ')[0]} Payroll Services`,
    );

    for (const year of HISTORY_ALL_YEARS) {
      const r = await seedParishYearHistory(
        prisma,
        ledger,
        p.chart,
        p.bundle.id,
        givers,
        utilitiesVendorId,
        payrollVendorId,
        year,
        rand,
      );
      totals.donations += r.donations;
      totals.journals += r.journals;
      totals.bills += r.bills;
      totals.payments += r.payments;
    }
    console.log(`     ${p.bundle.name}: ${HISTORY_ALL_YEARS.length} fiscal years of history seeded`);
  }

  return { ...totals, years: HISTORY_ALL_YEARS.length };
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

  // Multi-year giving & operating history (2021–2026) — bulk, batched inserts.
  const history = await seedFinanceHistory(prisma, {
    dioceseId: input.dioceseId,
    dioceseAdminId: input.dioceseAdminId,
    dioceseChart,
    parishes: input.parishes
      .map((parish) => {
        const chart = parishCharts.get(parish.id);
        return chart
          ? { bundle: parish, chart, actorUserId: parish.adminUserId }
          : null;
      })
      .filter((p): p is { bundle: FinanceParishBundle; chart: ChartIds; actorUserId: string } => p !== null),
  });
  console.log(
    `     history: +${history.donations} donations, +${history.journals} journals, +${history.bills} bills, +${history.payments} payments across ${history.years} fiscal years`,
  );

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
